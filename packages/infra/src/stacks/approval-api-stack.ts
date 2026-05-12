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
} from 'aws-cdk-lib/aws-lambda';
import { Vpc, SecurityGroup, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { DatabaseCluster } from 'aws-cdk-lib/aws-rds';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import {
  CfnWebACL,
  CfnWebACLAssociation,
} from 'aws-cdk-lib/aws-wafv2';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface ApprovalApiStackProps extends StackProps {
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
  /** EventBridge event bus for domain events */
  readonly eventBus: events.IEventBus;
}

/**
 * Approval API Gateway stack deploying REST API endpoints for approval
 * workflow orchestration.
 *
 * Includes:
 * - REST API with /v1/approvals resource tree
 * - POST /v1/approvals/workflows — Initiate workflow
 * - GET /v1/approvals/pending — List pending approvals
 * - POST /v1/approvals/actions — Submit approval action
 * - POST /v1/approvals/templates — Create template
 * - PUT /v1/approvals/templates/{templateId} — Update template
 * - POST /v1/approvals/delegations — Configure delegation
 * - Cognito authorizer for tenant user authentication
 * - Usage plan with throttling (200 req/s rate, 500 burst)
 * - WAF WebACL attached
 * - EventBridge rule triggering workflow initiation on PolicyDecision with approval obligations
 * - CORS configuration
 * - Stage: prod
 *
 * Validates: Requirements 8.1, 8.3, 18.1
 */
export class ApprovalApiStack extends Stack {
  /** The REST API */
  public readonly api: RestApi;

  constructor(scope: Construct, id: string, props: ApprovalApiStackProps) {
    super(scope, id, props);

    const {
      platformRegion,
      platformName,
      vpc,
      lambdaSecurityGroup,
      databaseCluster,
      cognitoUserPool,
      eventBus,
    } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // --- REST API ---
    this.api = new RestApi(this, 'ApprovalApi', {
      restApiName: `${prefix}-approval-api`,
      description: `Approval Workflow REST API for Travel Policy Platform (${platformRegion})`,
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
    const cognitoAuthorizer = new CognitoUserPoolsAuthorizer(this, 'ApprovalApiCognitoAuthorizer', {
      cognitoUserPools: [cognitoUserPool],
      authorizerName: `${prefix}-approval-api-authorizer`,
    });

    // --- Usage Plan with throttling ---
    new UsagePlan(this, 'ApprovalApiUsagePlan', {
      name: `${prefix}-approval-api-usage-plan`,
      description: 'Usage plan for approval workflow API with throttling',
      throttle: {
        rateLimit: 200,
        burstLimit: 500,
      },
      quota: {
        limit: 50000,
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
      EVENT_BUS_NAME: eventBus.eventBusName,
    };

    // --- Lambda Functions ---

    // Initiate workflow Lambda
    const initiateWorkflowFunction = this.createLambdaFunction(
      'InitiateWorkflow',
      'initiate-workflow',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // List pending approvals Lambda
    const listPendingFunction = this.createLambdaFunction(
      'ListPending',
      'list-pending-approvals',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Submit action Lambda
    const submitActionFunction = this.createLambdaFunction(
      'SubmitAction',
      'submit-action',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Create template Lambda
    const createTemplateFunction = this.createLambdaFunction(
      'CreateTemplate',
      'configure-template',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Update template Lambda
    const updateTemplateFunction = this.createLambdaFunction(
      'UpdateTemplate',
      'update-template',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Configure delegation Lambda
    const configureDelegationFunction = this.createLambdaFunction(
      'ConfigureDelegation',
      'configure-delegation',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Grant Lambda functions access to the database secret
    const allFunctions = [
      initiateWorkflowFunction,
      listPendingFunction,
      submitActionFunction,
      createTemplateFunction,
      updateTemplateFunction,
      configureDelegationFunction,
    ];

    if (databaseCluster.secret) {
      for (const fn of allFunctions) {
        databaseCluster.secret.grantRead(fn);
      }
    }

    // Grant EventBridge put events permission to initiate workflow function
    eventBus.grantPutEventsTo(initiateWorkflowFunction);

    // --- API Resources ---
    const v1 = this.api.root.addResource('v1');
    const approvals = v1.addResource('approvals');

    // POST /v1/approvals/workflows — Initiate workflow
    const workflows = approvals.addResource('workflows');
    workflows.addMethod('POST', new LambdaIntegration(initiateWorkflowFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // GET /v1/approvals/pending — List pending approvals
    const pending = approvals.addResource('pending');
    pending.addMethod('GET', new LambdaIntegration(listPendingFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // POST /v1/approvals/actions — Submit approval action
    const actions = approvals.addResource('actions');
    actions.addMethod('POST', new LambdaIntegration(submitActionFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // /v1/approvals/templates
    const templates = approvals.addResource('templates');

    // POST /v1/approvals/templates — Create template
    templates.addMethod('POST', new LambdaIntegration(createTemplateFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // PUT /v1/approvals/templates/{templateId} — Update template
    const templateById = templates.addResource('{templateId}');
    templateById.addMethod('PUT', new LambdaIntegration(updateTemplateFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // POST /v1/approvals/delegations — Configure delegation
    const delegations = approvals.addResource('delegations');
    delegations.addMethod('POST', new LambdaIntegration(configureDelegationFunction), {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: cognitoAuthorizer,
    });

    // --- EventBridge Rule: PolicyDecision with approval obligations triggers workflow ---
    const policyDecisionRule = new events.Rule(this, 'PolicyDecisionApprovalRule', {
      ruleName: `${prefix}-policy-decision-approval`,
      description: 'Triggers approval workflow initiation when a PolicyDecision with approval obligations is made',
      eventBus,
      eventPattern: {
        source: ['travel-policy-platform'],
        detailType: ['PolicyDecisionMade'],
        detail: {
          payload: {
            obligations: {
              type: [{ prefix: 'require_approval' }, { prefix: 'manager_approval' }, { prefix: 'finance_approval' }],
            },
          },
        },
      },
    });

    policyDecisionRule.addTarget(new targets.LambdaFunction(initiateWorkflowFunction, {
      retryAttempts: 2,
      maxEventAge: Duration.hours(1),
    }));

    // --- WAF WebACL ---
    const webAcl = new CfnWebACL(this, 'ApprovalApiWebAcl', {
      name: `${prefix}-approval-api-waf`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-approval-api-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-approval-rate-limit`,
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 3000,
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
            metricName: `${prefix}-approval-common-rules`,
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
            metricName: `${prefix}-approval-bad-inputs`,
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
    new CfnWebACLAssociation(this, 'ApprovalApiWebAclAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // --- Tags ---
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'ApprovalApi');

    // --- Outputs ---
    new CfnOutput(this, 'ApprovalApiUrl', {
      value: this.api.url,
      description: 'Approval Workflow API URL',
      exportName: `${prefix}-approval-api-url`,
    });

    new CfnOutput(this, 'ApprovalApiId', {
      value: this.api.restApiId,
      description: 'Approval Workflow API ID',
      exportName: `${prefix}-approval-api-id`,
    });
  }

  /**
   * Creates a Lambda function for approval services with VPC access.
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
      code: Code.fromAsset('../services/approval-workflow/dist'),
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
