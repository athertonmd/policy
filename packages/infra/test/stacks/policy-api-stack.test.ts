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
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { PolicyApiStack } from '../../src/stacks/policy-api-stack';

describe('PolicyApiStack', () => {
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

    const userPool = new UserPool(prereqStack, 'UserPool', {
      userPoolName: 'test-user-pool',
    });

    const stack = new PolicyApiStack(app, 'TestPolicyApi', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
      vpc,
      lambdaSecurityGroup: lambdaSg,
      databaseCluster: cluster,
      cognitoUserPool: userPool,
    });

    template = Template.fromStack(stack);
  });

  describe('REST API', () => {
    it('creates a REST API with the correct name', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'travel-policy-platform-uk-policy-api',
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
    it('creates the /v1/policies resource path', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'v1',
      });
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'policies',
      });
    });

    it('creates the /v1/policies/evaluate resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'evaluate',
      });
    });

    it('creates the /v1/policies/evaluate-batch resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'evaluate-batch',
      });
    });

    it('creates the /v1/policies/compile resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'compile',
      });
    });

    it('creates the /v1/policies/rules resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'rules',
      });
    });

    it('creates the /v1/policies/rules/{ruleId} resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{ruleId}',
      });
    });

    it('creates the activate resource under {ruleId}', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'activate',
      });
    });

    it('creates the versions resource under {ruleId}', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'versions',
      });
    });

    it('creates the rollback resource under {ruleId}', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'rollback',
      });
    });

    it('creates POST methods with Cognito authorization', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        AuthorizationType: 'COGNITO_USER_POOLS',
      });
    });

    it('creates GET method for versions with Cognito authorization', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
        AuthorizationType: 'COGNITO_USER_POOLS',
      });
    });

    it('configures CORS preflight OPTIONS methods', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'OPTIONS',
      });
    });
  });

  describe('Cognito Authorizer', () => {
    it('creates a Cognito user pools authorizer', () => {
      template.hasResourceProperties('AWS::ApiGateway::Authorizer', {
        Type: 'COGNITO_USER_POOLS',
        Name: 'travel-policy-platform-uk-policy-api-authorizer',
      });
    });
  });

  describe('Usage Plan', () => {
    it('creates a usage plan with throttling limits for policy API', () => {
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        Throttle: {
          RateLimit: 500,
          BurstLimit: 1000,
        },
        Quota: {
          Limit: 100000,
          Period: 'DAY',
        },
      });
    });
  });

  describe('Lambda Functions', () => {
    it('creates 7 Lambda functions for policy services', () => {
      template.resourceCountIs('AWS::Lambda::Function', 7);
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

    it('configures evaluate Lambda with 1024MB memory for performance', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 1024,
        FunctionName: 'travel-policy-platform-uk-evaluate-policy',
      });
    });

    it('configures evaluate Lambda with 10s timeout', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 10,
        FunctionName: 'travel-policy-platform-uk-evaluate-policy',
      });
    });
  });

  describe('Provisioned Concurrency', () => {
    it('creates a Lambda alias for evaluate function', () => {
      template.hasResourceProperties('AWS::Lambda::Alias', {
        Name: 'live',
      });
    });

    it('configures provisioned concurrency on evaluate alias', () => {
      template.hasResourceProperties('AWS::Lambda::Alias', {
        Name: 'live',
        ProvisionedConcurrencyConfig: {
          ProvisionedConcurrentExecutions: 5,
        },
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
                Limit: 5000,
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
    it('exports the Policy API URL', () => {
      template.hasOutput('PolicyApiUrl', {
        Export: { Name: 'travel-policy-platform-uk-policy-api-url' },
      });
    });

    it('exports the Policy API ID', () => {
      template.hasOutput('PolicyApiId', {
        Export: { Name: 'travel-policy-platform-uk-policy-api-id' },
      });
    });
  });
});
