import {
  Stack,
  StackProps,
  Duration,
  CfnOutput,
  Tags,
} from 'aws-cdk-lib';
import {
  RestApi,
  LambdaIntegration,
  UsagePlan,
  Period,
  Cors,
  AuthorizationType,
  MethodLoggingLevel,
  CognitoUserPoolsAuthorizer,
} from 'aws-cdk-lib/aws-apigateway';
import {
  Function as LambdaFunction,
  Runtime,
  Code,
  Architecture,
  Tracing,
  Alias,
} from 'aws-cdk-lib/aws-lambda';
import { Vpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import {
  CfnWebACL,
  CfnWebACLAssociation,
} from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface PolicyApiStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
  /** VPC for Lambda functions */
  readonly vpc: Vpc;
  /** Security group for Lambda functions accessing Aurora */
  readonly lambdaSecurityGroup: SecurityGroup;
  /** Aurora database cluster */
  readonly databaseCluster: DatabaseCluster;
  /** Cognito User Pool for tenant user authentication */
  readonly cognitoUserPool: UserPool;
}

/**
 * Policy API Gateway stack deploying REST API endpoints for policy decision
 * and policy configuration services.
 *
 * Includes:
 * - REST API with /v1/policies resource tree
 * - POST /v1/policies/evaluate — synchronous policy evaluation (<200ms p95)
 * - POST /v1/policies/evaluate-batch — batch evaluation
 * - POST /v1/policies/compile — DSL compilation
 * - POST /v1/policies/rules — save rule
 * - POST /v1/policies/rules/{ruleId}/activate — activate version
 * - GET /v1/policies/rules/{ruleId}/versions — list versions
 * - POST /v1/policies/rules/{ruleId}/rollback — rollback version
 * - Cognito authorizer for tenant user authentication
 * - Provisioned concurrency on evaluate Lambda for cold-start mitigation
 * - Usage plan with throttling (500 req/s rate, 1000 burst for evaluate)
 * - WAF WebACL attached
 * - CORS configuration
 * - Stage: prod
 */
export class PolicyApiStack extends Stack {
  /** The REST API */
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, props: PolicyApiStackProps) {
    super(scope, id, props);

    const {
      platformRegion,
      platformName,
      vpc,
      lambdaSecurityGroup,
      databaseCluster,
      cognitoUserPool,
    } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // --- REST API ---
    this.api = new RestApi(this, 'PolicyDecisionApi', {
      restApiName: `${prefix}-policy-api`,
      description: `Policy Decision REST API for Travel Policy Platform (${platformRegion})`,
      deployOptions: {
        stageName: 'prod',
        loggingLevel: MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        tracingEnabled: true,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Security-Token',
        ],
        maxAge: Duration.hours(1),
      },
    });

    // --- Cognito Authorizer ---
    const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, 'PolicyApiCognitoAuthorizer', {
      cognitoUserPools: [cognitoUserPool],
      authorizerName: `${prefix}-policy-api-authorizer`,
    });

    // --- Usage Plan with throttling ---
    const usagePlan = new UsagePlan(this, 'PolicyApiUsagePlan', {
      name: `${prefix}-policy-api-usage-plan`,
      description: 'Usage plan for policy decision API with throttling',
      throttle: {
        rateLimit: 500,
        burstLimit: 1000,
      },
      quota: {
        limit: 100000,
        period: Period.DAY,
      },
      apiStages: [
        {
          api: this.api,
          stage: this.api.deploymentStage,
        },
      ],
    });

    // --- Lambda Environment Variables ---
    const lambdaEnvironment: Record<string, string> = {
      DB_SECRET_ARN: databaseCluster.secret?.secretArn ?? '',
      DB_CLUSTER_ARN: databaseCluster.clusterArn,
      PLATFORM_REGION: platformRegion,
    };

    // --- Lambda Functions ---

    // Policy evaluation Lambda (with provisioned concurrency)
    const evaluatePolicyFunction = this.createLambdaFunction(
      'EvaluatePolicy',
      'evaluate-policy',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      1024, // Higher memory for performance target
      10,   // 10s timeout for evaluation
    );

    // Create alias with provisioned concurrency for cold-start mitigation
    const evaluateAlias = new Alias(this, 'EvaluatePolicyAlias', {
      aliasName: 'live',
      version: evaluatePolicyFunction.currentVersion,
      provisionedConcurrentExecutions: 5,
    });

    // Batch evaluation Lambda
    const evaluateBatchFunction = this.createLambdaFunction(
      'EvaluateBatch',
      'evaluate-batch',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      1024,
      30,
    );

    // DSL compilation Lambda
    const compileDslFunction = this.createLambdaFunction(
      'CompileDsl',
      'compile-dsl',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      512,
      30,
    );

    // Save rule Lambda
    const saveRuleFunction = this.createLambdaFunction(
      'SaveRule',
      'save-rule',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      512,
      30,
    );

    // Activate version Lambda
    const activateVersionFunction = this.createLambdaFunction(
      'ActivateVersion',
      'activate-version',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      512,
      30,
    );

    // List versions Lambda
    const listVersionsFunction = this.createLambdaFunction(
      'ListVersions',
      'list-versions',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      512,
      30,
    );

    // Rollback version Lambda
    const rollbackVersionFunction = this.createLambdaFunction(
      'RollbackVersion',
      'rollback-version',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
      512,
      30,
    );

    // Grant Lambda functions access to the database secret
    if (databaseCluster.secret) {
      databaseCluster.secret.grantRead(evaluatePolicyFunction);
      databaseCluster.secret.grantRead(evaluateBatchFunction);
      databaseCluster.secret.grantRead(compileDslFunction);
      databaseCluster.secret.grantRead(saveRuleFunction);
      databaseCluster.secret.grantRead(activateVersionFunction);
      databaseCluster.secret.grantRead(listVersionsFunction);
      databaseCluster.secret.grantRead(rollbackVersionFunction);
    }

    // --- API Resources ---
    const v1 = this.api.root.addResource('v1');
    const policies = v1.addResource('policies');

    // POST /v1/policies/evaluate
    const evaluate = policies.addResource('evaluate');
    evaluate.addMethod('POST', new LambdaIntegration(evaluateAlias), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // POST /v1/policies/evaluate-batch
    const evaluateBatch = policies.addResource('evaluate-batch');
    evaluateBatch.addMethod('POST', new LambdaIntegration(evaluateBatchFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // POST /v1/policies/compile
    const compile = policies.addResource('compile');
    compile.addMethod('POST', new LambdaIntegration(compileDslFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // /v1/policies/rules
    const rules = policies.addResource('rules');

    // POST /v1/policies/rules — save rule
    rules.addMethod('POST', new LambdaIntegration(saveRuleFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // /v1/policies/rules/{ruleId}
    const ruleById = rules.addResource('{ruleId}');

    // POST /v1/policies/rules/{ruleId}/activate
    const activate = ruleById.addResource('activate');
    activate.addMethod('POST', new LambdaIntegration(activateVersionFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // GET /v1/policies/rules/{ruleId}/versions
    const versions = ruleById.addResource('versions');
    versions.addMethod('GET', new LambdaIntegration(listVersionsFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // POST /v1/policies/rules/{ruleId}/rollback
    const rollback = ruleById.addResource('rollback');
    rollback.addMethod('POST', new LambdaIntegration(rollbackVersionFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // --- WAF WebACL ---
    const webAcl = new CfnWebACL(this, 'PolicyApiWebAcl', {
      name: `${prefix}-policy-api-waf`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-policy-api-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-policy-rate-limit`,
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 5000,
              aggregateKeyType: 'IP',
            },
          },
        },
        {
          name: 'AWSManagedRulesCommonRuleSet',
          priority: 2,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-policy-common-rules`,
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
        },
        {
          name: 'AWSManagedRulesKnownBadInputsRuleSet',
          priority: 3,
          overrideAction: { none: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-policy-bad-inputs`,
            sampledRequestsEnabled: true,
          },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesKnownBadInputsRuleSet',
            },
          },
        },
      ],
    });

    // Associate WAF with API Gateway stage
    new CfnWebACLAssociation(this, 'PolicyApiWebAclAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // --- Tags ---
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'PolicyApi');

    // --- Outputs ---
    new CfnOutput(this, 'PolicyApiUrl', {
      value: this.api.url,
      description: 'Policy Decision API URL',
      exportName: `${prefix}-policy-api-url`,
    });

    new CfnOutput(this, 'PolicyApiId', {
      value: this.api.restApiId,
      description: 'Policy Decision API ID',
      exportName: `${prefix}-policy-api-id`,
    });
  }

  /**
   * Creates a Lambda function for policy services with VPC access.
   */
  private createLambdaFunction(
    id: string,
    handlerName: string,
    prefix: string,
    vpc: Vpc,
    securityGroup: SecurityGroup,
    environment: Record<string, string>,
    memorySize: number = 512,
    timeoutSeconds: number = 30,
  ): LambdaFunction {
    return new LambdaFunction(this, id, {
      functionName: `${prefix}-${handlerName}`,
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: `handlers/${handlerName}.handler`,
      code: Code.fromAsset('../services/policy-decision/dist'),
      memorySize,
      timeout: Duration.seconds(timeoutSeconds),
      tracing: Tracing.ACTIVE,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [securityGroup],
      environment,
    });
  }
}
