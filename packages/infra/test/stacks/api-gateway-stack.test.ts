import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { Vpc, SecurityGroup } from 'aws-cdk-lib/aws-ec2';
import {
  DatabaseCluster,
  DatabaseClusterEngine,
  AuroraPostgresEngineVersion,
  ClusterInstance,
  Credentials,
} from 'aws-cdk-lib/aws-rds';
import { ApiGatewayStack } from '../../src/stacks/api-gateway-stack';

describe('ApiGatewayStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();

    // Create prerequisite resources in a separate stack
    const prereqStack = new Stack(app, 'PrereqStack', {
      env: { account: '123456789012', region: 'eu-west-2' },
    });

    const vpc = new Vpc(prereqStack, 'Vpc', { maxAzs: 2 });
    const lambdaSg = new SecurityGroup(prereqStack, 'LambdaSg', { vpc });
    const auroraSg = new SecurityGroup(prereqStack, 'AuroraSg', { vpc });

    const cluster = new DatabaseCluster(prereqStack, 'Cluster', {
      engine: DatabaseClusterEngine.auroraPostgres({
        version: AuroraPostgresEngineVersion.VER_16_4,
      }),
      credentials: Credentials.fromGeneratedSecret('admin'),
      writer: ClusterInstance.serverlessV2('Writer'),
      vpc,
      securityGroups: [auroraSg],
    });

    const stack = new ApiGatewayStack(app, 'TestApiGateway', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
      vpc,
      lambdaSecurityGroup: lambdaSg,
      databaseCluster: cluster,
    });

    template = Template.fromStack(stack);
  });

  describe('REST API', () => {
    it('creates a REST API with the correct name', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'travel-policy-platform-uk-tenant-api',
      });
    });

    it('deploys to prod stage with tracing enabled', () => {
      template.hasResourceProperties('AWS::ApiGateway::Stage', {
        StageName: 'prod',
        TracingEnabled: true,
      });
    });
  });

  describe('API Resources and Methods', () => {
    it('creates the /v1/tenants resource path', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'v1',
      });
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'tenants',
      });
    });

    it('creates the /v1/tenants/{tenantId} resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{tenantId}',
      });
    });

    it('creates GET method on /v1/tenants with API key required', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
        ApiKeyRequired: true,
        AuthorizationType: 'NONE',
      });
    });

    it('creates POST method on /v1/tenants with API key required', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        ApiKeyRequired: true,
        AuthorizationType: 'NONE',
      });
    });

    it('creates PUT method on /v1/tenants/{tenantId} with API key required', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'PUT',
        ApiKeyRequired: true,
        AuthorizationType: 'NONE',
      });
    });

    it('creates DELETE method on /v1/tenants/{tenantId} with API key required', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'DELETE',
        ApiKeyRequired: true,
        AuthorizationType: 'NONE',
      });
    });

    it('configures CORS preflight OPTIONS methods', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'OPTIONS',
      });
    });
  });

  describe('API Key and Usage Plan', () => {
    it('creates an API key for platform operators', () => {
      template.hasResourceProperties('AWS::ApiGateway::ApiKey', {
        Name: 'travel-policy-platform-uk-platform-operator-key',
        Enabled: true,
      });
    });

    it('creates a usage plan with throttling limits', () => {
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        Throttle: {
          RateLimit: 100,
          BurstLimit: 200,
        },
        Quota: {
          Limit: 10000,
          Period: 'DAY',
        },
      });
    });

    it('associates the API key with the usage plan', () => {
      template.resourceCountIs('AWS::ApiGateway::UsagePlanKey', 1);
    });
  });

  describe('Lambda Functions', () => {
    it('creates 5 Lambda functions for tenant management', () => {
      template.resourceCountIs('AWS::Lambda::Function', 5);
    });

    it('configures Lambda functions with Node.js 20 runtime', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Architectures: ['arm64'],
      });
    });

    it('configures Lambda functions with VPC access', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        VpcConfig: Match.objectLike({
          SecurityGroupIds: Match.anyValue(),
          SubnetIds: Match.anyValue(),
        }),
      });
    });

    it('configures Lambda functions with required environment variables', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            DB_SECRET_ARN: Match.anyValue(),
            DB_CLUSTER_ARN: Match.anyValue(),
            PLATFORM_REGION: 'uk',
          }),
        },
      });
    });

    it('configures Lambda functions with X-Ray tracing', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: {
          Mode: 'Active',
        },
      });
    });

    it('configures Lambda functions with 512MB memory and 30s timeout', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 512,
        Timeout: 30,
      });
    });
  });

  describe('WAF WebACL', () => {
    it('creates a WAF WebACL with REGIONAL scope', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Scope: 'REGIONAL',
        DefaultAction: { Allow: {} },
      });
    });

    it('configures rate limiting rule', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'RateLimitRule',
            Action: { Block: {} },
            Statement: {
              RateBasedStatement: {
                Limit: 2000,
                AggregateKeyType: 'IP',
              },
            },
          }),
        ]),
      });
    });

    it('configures AWS managed common rule set', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesCommonRuleSet',
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesCommonRuleSet',
              },
            },
          }),
        ]),
      });
    });

    it('configures AWS managed known bad inputs rule set', () => {
      template.hasResourceProperties('AWS::WAFv2::WebACL', {
        Rules: Match.arrayWith([
          Match.objectLike({
            Name: 'AWSManagedRulesKnownBadInputsRuleSet',
            Statement: {
              ManagedRuleGroupStatement: {
                VendorName: 'AWS',
                Name: 'AWSManagedRulesKnownBadInputsRuleSet',
              },
            },
          }),
        ]),
      });
    });

    it('associates WAF WebACL with the API Gateway stage', () => {
      template.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
    });
  });

  describe('Outputs', () => {
    it('exports the API URL', () => {
      template.hasOutput('ApiUrl', {
        Export: { Name: 'travel-policy-platform-uk-tenant-api-url' },
      });
    });

    it('exports the API ID', () => {
      template.hasOutput('ApiId', {
        Export: { Name: 'travel-policy-platform-uk-tenant-api-id' },
      });
    });

    it('exports the API key ID', () => {
      template.hasOutput('ApiKeyId', {
        Export: { Name: 'travel-policy-platform-uk-platform-operator-api-key-id' },
      });
    });
  });
});
