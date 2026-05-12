/**
 * Auto-Scaling CDK Construct
 *
 * Lambda provisioned concurrency configuration.
 * Aurora auto-scaling for read replicas.
 * API Gateway throttling configuration per tenant.
 *
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 18.6
 */
import { Duration, Tags } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

// --- Lambda Provisioned Concurrency ---

/**
 * Properties for Lambda provisioned concurrency configuration.
 */
export interface LambdaProvisionedConcurrencyProps {
  /** The Lambda function to configure */
  readonly function: lambda.IFunction;
  /** Lambda function alias name */
  readonly aliasName?: string;
  /** Minimum provisioned concurrency */
  readonly minCapacity: number;
  /** Maximum provisioned concurrency */
  readonly maxCapacity: number;
  /** Target utilisation percentage (0-1) for auto-scaling */
  readonly targetUtilisation?: number;
  /** Scale-in cooldown period */
  readonly scaleInCooldown?: Duration;
  /** Scale-out cooldown period */
  readonly scaleOutCooldown?: Duration;
  /** Schedule-based scaling configurations */
  readonly scheduledScaling?: ScheduledScalingConfig[];
}

export interface ScheduledScalingConfig {
  /** Cron schedule expression */
  readonly schedule: appscaling.Schedule;
  /** Minimum capacity during this schedule */
  readonly minCapacity: number;
  /** Maximum capacity during this schedule */
  readonly maxCapacity: number;
}

/**
 * CDK Construct for Lambda provisioned concurrency with auto-scaling.
 * Ensures cold-start mitigation for the policy decision path.
 *
 * Requirement 29.1: Auto-scale compute resources maintaining SLA during 10x traffic.
 * Requirement 29.2: 1000 decisions/second/tenant at p95 <200ms.
 */
export class LambdaProvisionedConcurrency extends Construct {
  public readonly alias: lambda.Alias;
  public readonly scalableTarget: appscaling.ScalableTarget;

  constructor(scope: Construct, id: string, props: LambdaProvisionedConcurrencyProps) {
    super(scope, id);

    const {
      function: fn,
      aliasName = 'live',
      minCapacity,
      maxCapacity,
      targetUtilisation = 0.7,
      scaleInCooldown = Duration.minutes(15),
      scaleOutCooldown = Duration.minutes(1),
      scheduledScaling,
    } = props;

    // Create a Lambda alias with provisioned concurrency
    this.alias = new lambda.Alias(this, 'Alias', {
      aliasName,
      version: fn.latestVersion,
      provisionedConcurrentExecutions: minCapacity,
    });

    // Set up auto-scaling target
    this.scalableTarget = new appscaling.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: appscaling.ServiceNamespace.LAMBDA,
      resourceId: `function:${fn.functionName}:${aliasName}`,
      scalableDimension: 'lambda:function:ProvisionedConcurrency',
      minCapacity,
      maxCapacity,
    });

    // Target tracking scaling policy based on utilisation
    this.scalableTarget.scaleToTrackMetric('UtilisationTracking', {
      targetValue: targetUtilisation * 100,
      customMetric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'ProvisionedConcurrencyUtilization',
        dimensionsMap: {
          FunctionName: fn.functionName,
          Resource: `${fn.functionName}:${aliasName}`,
        },
        statistic: 'Average',
        period: Duration.minutes(1),
      }),
      scaleInCooldown,
      scaleOutCooldown,
    });

    // Requirement 29.4: Scale down within 15 minutes on traffic decrease
    // The scaleInCooldown of 15 minutes ensures we don't scale down too aggressively

    // Schedule-based scaling for predictable traffic patterns
    if (scheduledScaling) {
      for (let i = 0; i < scheduledScaling.length; i++) {
        const config = scheduledScaling[i];
        this.scalableTarget.scaleOnSchedule(`ScheduledScale${i}`, {
          schedule: config.schedule,
          minCapacity: config.minCapacity,
          maxCapacity: config.maxCapacity,
        });
      }
    }

    Tags.of(this).add('Component', 'AutoScaling');
    Tags.of(this).add('ScalingType', 'LambdaProvisionedConcurrency');
  }
}

// --- Aurora Auto-Scaling ---

/**
 * Properties for Aurora read replica auto-scaling.
 */
export interface AuroraAutoScalingProps {
  /** The Aurora cluster to scale */
  readonly cluster: rds.IDatabaseCluster;
  /** Cluster identifier for scaling target */
  readonly clusterIdentifier: string;
  /** Minimum number of read replicas */
  readonly minCapacity: number;
  /** Maximum number of read replicas */
  readonly maxCapacity: number;
  /** Target CPU utilisation percentage for scaling */
  readonly targetCpuUtilisation?: number;
  /** Target connections percentage for scaling */
  readonly targetConnectionsUtilisation?: number;
  /** Scale-in cooldown */
  readonly scaleInCooldown?: Duration;
  /** Scale-out cooldown */
  readonly scaleOutCooldown?: Duration;
}

/**
 * CDK Construct for Aurora Serverless v2 / read replica auto-scaling.
 *
 * Requirement 29.3: Support 10,000 concurrent active approval workflows per tenant.
 * Requirement 29.4: Scale down within 15 minutes on traffic decrease.
 */
export class AuroraAutoScaling extends Construct {
  public readonly scalableTarget: appscaling.ScalableTarget;

  constructor(scope: Construct, id: string, props: AuroraAutoScalingProps) {
    super(scope, id);

    const {
      clusterIdentifier,
      minCapacity,
      maxCapacity,
      targetCpuUtilisation = 70,
      targetConnectionsUtilisation,
      scaleInCooldown = Duration.minutes(15),
      scaleOutCooldown = Duration.minutes(3),
    } = props;

    // Auto-scaling target for Aurora read replicas
    this.scalableTarget = new appscaling.ScalableTarget(this, 'ScalableTarget', {
      serviceNamespace: appscaling.ServiceNamespace.RDS,
      resourceId: `cluster:${clusterIdentifier}`,
      scalableDimension: 'rds:cluster:ReadReplicaCount',
      minCapacity,
      maxCapacity,
    });

    // CPU-based scaling policy
    this.scalableTarget.scaleToTrackMetric('CpuTracking', {
      targetValue: targetCpuUtilisation,
      customMetric: new cloudwatch.Metric({
        namespace: 'AWS/RDS',
        metricName: 'CPUUtilization',
        dimensionsMap: {
          DBClusterIdentifier: clusterIdentifier,
        },
        statistic: 'Average',
        period: Duration.minutes(1),
      }),
      scaleInCooldown,
      scaleOutCooldown,
    });

    // Connection-based scaling policy (optional)
    if (targetConnectionsUtilisation) {
      this.scalableTarget.scaleToTrackMetric('ConnectionTracking', {
        targetValue: targetConnectionsUtilisation,
        customMetric: new cloudwatch.Metric({
          namespace: 'AWS/RDS',
          metricName: 'DatabaseConnections',
          dimensionsMap: {
            DBClusterIdentifier: clusterIdentifier,
          },
          statistic: 'Average',
          period: Duration.minutes(1),
        }),
        scaleInCooldown,
        scaleOutCooldown,
      });
    }

    Tags.of(this).add('Component', 'AutoScaling');
    Tags.of(this).add('ScalingType', 'AuroraReadReplicas');
  }
}

// --- API Gateway Throttling ---

/**
 * Properties for API Gateway throttling configuration.
 */
export interface ApiGatewayThrottlingProps {
  /** The REST API to configure throttling for */
  readonly api: apigateway.IRestApi;
  /** Default rate limit (requests per second) */
  readonly defaultRateLimit: number;
  /** Default burst limit */
  readonly defaultBurstLimit: number;
  /** Per-tenant throttling configurations */
  readonly tenantThrottling?: TenantThrottleConfig[];
  /** Per-method throttling overrides */
  readonly methodThrottling?: MethodThrottleConfig[];
  /** Usage plan name */
  readonly usagePlanName?: string;
  /** Quota limit per month */
  readonly monthlyQuota?: number;
}

export interface TenantThrottleConfig {
  /** Tenant identifier */
  readonly tenantId: string;
  /** API key for this tenant */
  readonly apiKeyValue: string;
  /** Rate limit for this tenant (requests/second) */
  readonly rateLimit: number;
  /** Burst limit for this tenant */
  readonly burstLimit: number;
  /** Monthly quota for this tenant */
  readonly monthlyQuota?: number;
}

export interface MethodThrottleConfig {
  /** HTTP method */
  readonly method: string;
  /** Resource path */
  readonly path: string;
  /** Rate limit for this method */
  readonly rateLimit: number;
  /** Burst limit for this method */
  readonly burstLimit: number;
}

/**
 * CDK Construct for API Gateway throttling per tenant and per API client.
 *
 * Requirement 18.6: Rate limiting on all API endpoints with configurable limits per tenant.
 * Requirement 29.1: Maintain response times within SLA during traffic spikes.
 * Requirement 29.5: 99.9% availability.
 */
export class ApiGatewayThrottling extends Construct {
  public readonly defaultUsagePlan: apigateway.UsagePlan;
  public readonly tenantUsagePlans: Map<string, apigateway.UsagePlan> = new Map();
  public readonly apiKeys: Map<string, apigateway.IApiKey> = new Map();

  constructor(scope: Construct, id: string, props: ApiGatewayThrottlingProps) {
    super(scope, id);

    const {
      api,
      defaultRateLimit,
      defaultBurstLimit,
      tenantThrottling = [],
      methodThrottling = [],
      usagePlanName = 'default-plan',
      monthlyQuota,
    } = props;

    // Default usage plan with platform-wide throttling
    this.defaultUsagePlan = new apigateway.UsagePlan(this, 'DefaultUsagePlan', {
      name: usagePlanName,
      description: 'Default throttling plan for the Travel Policy Platform',
      throttle: {
        rateLimit: defaultRateLimit,
        burstLimit: defaultBurstLimit,
      },
      quota: monthlyQuota
        ? {
            limit: monthlyQuota,
            period: apigateway.Period.MONTH,
          }
        : undefined,
      apiStages: [
        {
          api,
          stage: api.deploymentStage,
        },
      ],
    });

    // Per-tenant usage plans with individual throttling
    for (const tenantConfig of tenantThrottling) {
      const tenantPlan = new apigateway.UsagePlan(this, `TenantPlan-${tenantConfig.tenantId}`, {
        name: `tenant-${tenantConfig.tenantId}-plan`,
        description: `Throttling plan for tenant ${tenantConfig.tenantId}`,
        throttle: {
          rateLimit: tenantConfig.rateLimit,
          burstLimit: tenantConfig.burstLimit,
        },
        quota: tenantConfig.monthlyQuota
          ? {
              limit: tenantConfig.monthlyQuota,
              period: apigateway.Period.MONTH,
            }
          : undefined,
        apiStages: [
          {
            api,
            stage: api.deploymentStage,
          },
        ],
      });

      // Create API key for the tenant
      const apiKey = new apigateway.ApiKey(this, `ApiKey-${tenantConfig.tenantId}`, {
        apiKeyName: `tenant-${tenantConfig.tenantId}-key`,
        description: `API key for tenant ${tenantConfig.tenantId}`,
        value: tenantConfig.apiKeyValue,
        enabled: true,
      });

      tenantPlan.addApiKey(apiKey);

      this.tenantUsagePlans.set(tenantConfig.tenantId, tenantPlan);
      this.apiKeys.set(tenantConfig.tenantId, apiKey);
    }

    Tags.of(this).add('Component', 'AutoScaling');
    Tags.of(this).add('ScalingType', 'ApiGatewayThrottling');
  }
}

// --- Composite Auto-Scaling Stack Helper ---

/**
 * Properties for the complete platform auto-scaling configuration.
 */
export interface PlatformAutoScalingProps {
  readonly platformName: string;
  readonly platformRegion: string;
  readonly policyDecisionFunction: lambda.IFunction;
  readonly auroraClusterIdentifier: string;
  readonly auroraCluster: rds.IDatabaseCluster;
  readonly api: apigateway.IRestApi;
  readonly tenantConfigs?: TenantThrottleConfig[];
}

/**
 * Create the complete auto-scaling configuration for the platform.
 * Combines Lambda, Aurora, and API Gateway scaling.
 */
export class PlatformAutoScaling extends Construct {
  public readonly lambdaScaling: LambdaProvisionedConcurrency;
  public readonly auroraScaling: AuroraAutoScaling;
  public readonly apiThrottling: ApiGatewayThrottling;

  constructor(scope: Construct, id: string, props: PlatformAutoScalingProps) {
    super(scope, id);

    const {
      platformName,
      platformRegion,
      policyDecisionFunction,
      auroraClusterIdentifier,
      auroraCluster,
      api,
      tenantConfigs = [],
    } = props;

    // Lambda provisioned concurrency for policy decision path
    this.lambdaScaling = new LambdaProvisionedConcurrency(this, 'PolicyDecisionScaling', {
      function: policyDecisionFunction,
      aliasName: 'live',
      minCapacity: 10,
      maxCapacity: 1000,
      targetUtilisation: 0.7,
      scaleInCooldown: Duration.minutes(15),
      scaleOutCooldown: Duration.minutes(1),
      scheduledScaling: [
        {
          // Scale up during business hours (Mon-Fri 7am-7pm)
          schedule: appscaling.Schedule.expression('cron(0 7 ? * MON-FRI *)'),
          minCapacity: 50,
          maxCapacity: 1000,
        },
        {
          // Scale down outside business hours
          schedule: appscaling.Schedule.expression('cron(0 19 ? * MON-FRI *)'),
          minCapacity: 10,
          maxCapacity: 200,
        },
      ],
    });

    // Aurora read replica auto-scaling
    this.auroraScaling = new AuroraAutoScaling(this, 'AuroraScaling', {
      cluster: auroraCluster,
      clusterIdentifier: auroraClusterIdentifier,
      minCapacity: 1,
      maxCapacity: 15,
      targetCpuUtilisation: 70,
      targetConnectionsUtilisation: 80,
      scaleInCooldown: Duration.minutes(15),
      scaleOutCooldown: Duration.minutes(3),
    });

    // API Gateway throttling
    this.apiThrottling = new ApiGatewayThrottling(this, 'ApiThrottling', {
      api,
      defaultRateLimit: 1000,
      defaultBurstLimit: 2000,
      tenantThrottling: tenantConfigs,
      methodThrottling: [
        {
          method: 'POST',
          path: '/v1/policies/evaluate',
          rateLimit: 2000,
          burstLimit: 5000,
        },
        {
          method: 'GET',
          path: '/v1/approvals/pending',
          rateLimit: 500,
          burstLimit: 1000,
        },
      ],
      monthlyQuota: 10_000_000,
    });

    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Component', 'PlatformAutoScaling');
  }
}
