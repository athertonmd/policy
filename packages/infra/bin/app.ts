#!/usr/bin/env node
import 'source-map-support/register';
import { App, Tags } from 'aws-cdk-lib';
import {
  getEnvironments,
  getPlatformConfig,
  PlatformRegion,
} from '../src/config/index';
import { NetworkingStack } from '../src/stacks/networking-stack';
import { SharedResourcesStack } from '../src/stacks/shared-resources-stack';
import { DatabaseStack } from '../src/stacks/database-stack';
import { DynamoDBStack } from '../src/stacks/dynamodb-stack';
import { EventBridgeStack } from '../src/stacks/eventbridge-stack';
import { ApiGatewayStack } from '../src/stacks/api-gateway-stack';
import { PolicyApiStack } from '../src/stacks/policy-api-stack';
import { ApprovalApiStack } from '../src/stacks/approval-api-stack';

const app = new App();

const platformConfig = getPlatformConfig();
const environments = getEnvironments();

// Allow deploying a specific region via CDK context: `cdk deploy -c region=uk`
const targetRegion = app.node.tryGetContext('region') as PlatformRegion | undefined;

const regionsToDeploy: PlatformRegion[] = targetRegion
  ? [targetRegion]
  : (Object.keys(environments) as PlatformRegion[]);

for (const region of regionsToDeploy) {
  const envConfig = environments[region];
  const stackPrefix = `TravelPolicy-${region.toUpperCase()}`;

  // Networking stack: VPC, subnets, security groups
  const networkingStack = new NetworkingStack(app, `${stackPrefix}-Networking`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    description: `Networking infrastructure for Travel Policy Platform (${envConfig.label})`,
  });

  // Shared resources stack: KMS keys, Route 53, CloudFront
  const sharedResourcesStack = new SharedResourcesStack(app, `${stackPrefix}-SharedResources`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    rootDomain: platformConfig.rootDomain,
    isPrimary: envConfig.isPrimary,
    description: `Shared resources for Travel Policy Platform (${envConfig.label})`,
  });

  // Shared resources depend on networking being in place
  sharedResourcesStack.addDependency(networkingStack);

  // Database stack: Aurora PostgreSQL Serverless v2
  const databaseStack = new DatabaseStack(app, `${stackPrefix}-Database`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    vpc: networkingStack.vpc,
    auroraSecurityGroup: networkingStack.auroraSecurityGroup,
    databaseEncryptionKey: sharedResourcesStack.databaseEncryptionKey,
    description: `Aurora PostgreSQL database for Travel Policy Platform (${envConfig.label})`,
  });

  // Database depends on networking and shared resources
  databaseStack.addDependency(networkingStack);
  databaseStack.addDependency(sharedResourcesStack);

  // DynamoDB stack: operational tables (AuditLog, WebhookIdempotency, PolicyBundleCache)
  const dynamoDBStack = new DynamoDBStack(app, `${stackPrefix}-DynamoDB`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    description: `DynamoDB operational tables for Travel Policy Platform (${envConfig.label})`,
  });

  // DynamoDB has no hard dependencies but logically follows shared resources
  dynamoDBStack.addDependency(sharedResourcesStack);

  // EventBridge stack: custom event bus, schema registry, DLQ
  const eventBridgeStack = new EventBridgeStack(app, `${stackPrefix}-EventBridge`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    description: `EventBridge event bus and schema registry for Travel Policy Platform (${envConfig.label})`,
  });

  // EventBridge logically follows shared resources
  eventBridgeStack.addDependency(sharedResourcesStack);

  // API Gateway stack: REST API for tenant management
  const apiGatewayStack = new ApiGatewayStack(app, `${stackPrefix}-ApiGateway`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    vpc: networkingStack.vpc,
    lambdaSecurityGroup: networkingStack.lambdaSecurityGroup,
    databaseCluster: databaseStack.cluster,
    description: `API Gateway for tenant management - Travel Policy Platform (${envConfig.label})`,
  });

  // API Gateway depends on networking (VPC, security groups) and database (secret ARN, cluster ARN)
  apiGatewayStack.addDependency(networkingStack);
  apiGatewayStack.addDependency(databaseStack);

  // Policy API stack: REST API for policy decision and configuration
  const policyApiStack = new PolicyApiStack(app, `${stackPrefix}-PolicyApi`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    vpc: networkingStack.vpc,
    lambdaSecurityGroup: networkingStack.lambdaSecurityGroup,
    databaseCluster: databaseStack.cluster,
    cognitoUserPool: sharedResourcesStack.cognitoUserPool,
    description: `Policy Decision API for Travel Policy Platform (${envConfig.label})`,
  });

  // Policy API depends on networking, database, and shared resources (Cognito)
  policyApiStack.addDependency(networkingStack);
  policyApiStack.addDependency(databaseStack);
  policyApiStack.addDependency(sharedResourcesStack);

  // Approval API stack: REST API for approval workflow orchestration
  const approvalApiStack = new ApprovalApiStack(app, `${stackPrefix}-ApprovalApi`, {
    env: envConfig.env,
    platformRegion: region,
    platformName: platformConfig.platformName,
    vpc: networkingStack.vpc,
    lambdaSecurityGroup: networkingStack.lambdaSecurityGroup,
    databaseCluster: databaseStack.cluster,
    cognitoUserPool: sharedResourcesStack.cognitoUserPool,
    eventBus: eventBridgeStack.eventBus,
    description: `Approval Workflow API for Travel Policy Platform (${envConfig.label})`,
  });

  // Approval API depends on networking, database, shared resources (Cognito), and EventBridge
  approvalApiStack.addDependency(networkingStack);
  approvalApiStack.addDependency(databaseStack);
  approvalApiStack.addDependency(sharedResourcesStack);
  approvalApiStack.addDependency(eventBridgeStack);
}

// Global tags applied to all resources
Tags.of(app).add('Application', platformConfig.platformName);
Tags.of(app).add('ManagedBy', 'CDK');

app.synth();
