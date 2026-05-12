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
  ApiKey,
  UsagePlan,
  Period,
  Cors,
  AuthorizationType,
  MethodLoggingLevel,
  Resource,
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
import {
  CfnWebACL,
  CfnWebACLAssociation,
} from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface ApiGatewayStackProps extends StackProps {
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
}

/**
 * API Gateway stack deploying REST API endpoints for tenant management.
 *
 * Includes:
 * - REST API with /v1/tenants resource and CRUD operations
 * - API key authentication for platform operators
 * - Usage plan with throttling (100 req/s, burst 200)
 * - WAF WebACL attached to the API stage
 * - Lambda integrations for tenant management handlers
 * - CORS configuration
 * - Stage: prod
 */
export class ApiGatewayStack extends Stack {
  /** The REST API */
  public readonly api: RestApi;
  /** The API key for platform operators */
  public readonly apiKey: ApiKey;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const {
      platformRegion,
      platformName,
      vpc,
      lambdaSecurityGroup,
      databaseCluster,
    } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // --- REST API ---
    this.api = new RestApi(this, 'TenantManagementApi', {
      restApiName: `${prefix}-tenant-api`,
      description: `Tenant Management REST API for Travel Policy Platform (${platformRegion})`,
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
          'X-Api-Key',
          'Authorization',
          'X-Amz-Date',
          'X-Amz-Security-Token',
        ],
        maxAge: Duration.hours(1),
      },
    });

    // --- API Key and Usage Plan ---
    this.apiKey = new ApiKey(this, 'PlatformOperatorApiKey', {
      apiKeyName: `${prefix}-platform-operator-key`,
      description: 'API key for platform operators to manage tenants',
      enabled: true,
    });

    const usagePlan = new UsagePlan(this, 'TenantApiUsagePlan', {
      name: `${prefix}-tenant-api-usage-plan`,
      description: 'Usage plan for tenant management API with throttling',
      throttle: {
        rateLimit: 100,
        burstLimit: 200,
      },
      quota: {
        limit: 10000,
        period: Period.DAY,
      },
      apiStages: [
        {
          api: this.api,
          stage: this.api.deploymentStage,
        },
      ],
    });

    usagePlan.addApiKey(this.apiKey);

    // --- Lambda Environment Variables ---
    const lambdaEnvironment: Record<string, string> = {
      DB_SECRET_ARN: databaseCluster.secret?.secretArn ?? '',
      DB_CLUSTER_ARN: databaseCluster.clusterArn,
      PLATFORM_REGION: platformRegion,
    };

    // --- Lambda Functions ---
    const listTenantsFunction = this.createLambdaFunction(
      'ListTenants',
      'list-tenants',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    const provisionTenantFunction = this.createLambdaFunction(
      'ProvisionTenant',
      'provision-tenant',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    const getTenantFunction = this.createLambdaFunction(
      'GetTenant',
      'get-tenant',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    const updateTenantConfigFunction = this.createLambdaFunction(
      'UpdateTenantConfig',
      'update-tenant-config',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    const decommissionTenantFunction = this.createLambdaFunction(
      'DecommissionTenant',
      'decommission-tenant',
      prefix,
      vpc,
      lambdaSecurityGroup,
      lambdaEnvironment,
    );

    // Grant Lambda functions access to the database secret
    if (databaseCluster.secret) {
      databaseCluster.secret.grantRead(listTenantsFunction);
      databaseCluster.secret.grantRead(provisionTenantFunction);
      databaseCluster.secret.grantRead(getTenantFunction);
      databaseCluster.secret.grantRead(updateTenantConfigFunction);
      databaseCluster.secret.grantRead(decommissionTenantFunction);
    }

    // --- API Resources ---
    const v1 = this.api.root.addResource('v1');
    const tenants = v1.addResource('tenants');
    const tenantById = tenants.addResource('{tenantId}');

    // GET /v1/tenants - List tenants
    tenants.addMethod('GET', new LambdaIntegration(listTenantsFunction), {
      apiKeyRequired: true,
      authorizationType: AuthorizationType.NONE,
    });

    // POST /v1/tenants - Provision tenant
    tenants.addMethod('POST', new LambdaIntegration(provisionTenantFunction), {
      apiKeyRequired: true,
      authorizationType: AuthorizationType.NONE,
    });

    // GET /v1/tenants/{tenantId} - Get tenant
    tenantById.addMethod('GET', new LambdaIntegration(getTenantFunction), {
      apiKeyRequired: true,
      authorizationType: AuthorizationType.NONE,
    });

    // PUT /v1/tenants/{tenantId} - Update tenant config
    tenantById.addMethod('PUT', new LambdaIntegration(updateTenantConfigFunction), {
      apiKeyRequired: true,
      authorizationType: AuthorizationType.NONE,
    });

    // DELETE /v1/tenants/{tenantId} - Decommission tenant
    tenantById.addMethod('DELETE', new LambdaIntegration(decommissionTenantFunction), {
      apiKeyRequired: true,
      authorizationType: AuthorizationType.NONE,
    });

    // --- WAF WebACL ---
    const webAcl = new CfnWebACL(this, 'TenantApiWebAcl', {
      name: `${prefix}-tenant-api-waf`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${prefix}-tenant-api-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'RateLimitRule',
          priority: 1,
          action: { block: {} },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${prefix}-rate-limit`,
            sampledRequestsEnabled: true,
          },
          statement: {
            rateBasedStatement: {
              limit: 2000,
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
            metricName: `${prefix}-common-rules`,
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
            metricName: `${prefix}-bad-inputs`,
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
    new CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: this.api.deploymentStage.stageArn,
      webAclArn: webAcl.attrArn,
    });

    // --- Tags ---
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'ApiGateway');

    // --- Outputs ---
    new CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      description: 'Tenant Management API URL',
      exportName: `${prefix}-tenant-api-url`,
    });

    new CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'Tenant Management API ID',
      exportName: `${prefix}-tenant-api-id`,
    });

    new CfnOutput(this, 'ApiKeyId', {
      value: this.apiKey.keyId,
      description: 'Platform operator API key ID',
      exportName: `${prefix}-platform-operator-api-key-id`,
    });
  }

  /**
   * Creates a Lambda function for tenant management with VPC access.
   */
  private createLambdaFunction(
    id: string,
    handlerName: string,
    prefix: string,
    vpc: Vpc,
    securityGroup: SecurityGroup,
    environment: Record<string, string>,
  ): LambdaFunction {
    return new LambdaFunction(this, id, {
      functionName: `${prefix}-${handlerName}`,
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      handler: `handlers/${handlerName}.handler`,
      code: Code.fromAsset('../services/tenant-management/dist'),
      memorySize: 512,
      timeout: Duration.seconds(30),
      tracing: Tracing.ACTIVE,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [securityGroup],
      environment,
    });
  }
}
