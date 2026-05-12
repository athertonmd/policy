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
import * as events from 'aws-cdk-lib/aws-events';
import { ApprovalApiStack } from '../../src/stacks/approval-api-stack';

describe('ApprovalApiStack', () => {
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

    const eventBus = new events.EventBus(prereqStack, 'EventBus', {
      eventBusName: 'test-event-bus',
    });

    const stack = new ApprovalApiStack(app, 'TestApprovalApi', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
      vpc,
      lambdaSecurityGroup: lambdaSg,
      databaseCluster: cluster,
      cognitoUserPool: userPool,
      eventBus,
    });

    template = Template.fromStack(stack);
  });

  describe('REST API', () => {
    it('creates a REST API with the correct name', () => {
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'travel-policy-platform-uk-approval-api',
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
    it('creates the /v1/approvals resource path', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'v1',
      });
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'approvals',
      });
    });

    it('creates the /v1/approvals/workflows resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'workflows',
      });
    });

    it('creates the /v1/approvals/pending resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'pending',
      });
    });

    it('creates the /v1/approvals/actions resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'actions',
      });
    });

    it('creates the /v1/approvals/templates resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'templates',
      });
    });

    it('creates the /v1/approvals/templates/{templateId} resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: '{templateId}',
      });
    });

    it('creates the /v1/approvals/delegations resource', () => {
      template.hasResourceProperties('AWS::ApiGateway::Resource', {
        PathPart: 'delegations',
      });
    });

    it('creates POST methods with Cognito authorization', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        AuthorizationType: 'COGNITO_USER_POOLS',
      });
    });

    it('creates GET method for pending approvals with Cognito authorization', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'GET',
        AuthorizationType: 'COGNITO_USER_POOLS',
      });
    });

    it('creates PUT method for template update with Cognito authorization', () => {
      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'PUT',
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
        Name: 'travel-policy-platform-uk-approval-api-authorizer',
      });
    });
  });

  describe('Usage Plan', () => {
    it('creates a usage plan with throttling limits for approval API', () => {
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', {
        Throttle: {
          RateLimit: 200,
          BurstLimit: 500,
        },
        Quota: {
          Limit: 50000,
          Period: 'DAY',
        },
      });
    });
  });

  describe('Lambda Functions', () => {
    it('creates 6 Lambda functions for approval services', () => {
      template.resourceCountIs('AWS::Lambda::Function', 6);
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
            EVENT_BUS_NAME: Match.anyValue(),
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

    it('creates initiate-workflow Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-initiate-workflow',
      });
    });

    it('creates list-pending-approvals Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-list-pending-approvals',
      });
    });

    it('creates submit-action Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-submit-action',
      });
    });

    it('creates configure-template Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-configure-template',
      });
    });

    it('creates update-template Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-update-template',
      });
    });

    it('creates configure-delegation Lambda function', () => {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'travel-policy-platform-uk-configure-delegation',
      });
    });
  });

  describe('EventBridge Rule', () => {
    it('creates an EventBridge rule for PolicyDecisionMade events with approval obligations', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'travel-policy-platform-uk-policy-decision-approval',
        EventPattern: Match.objectLike({
          source: ['travel-policy-platform'],
          'detail-type': ['PolicyDecisionMade'],
        }),
      });
    });

    it('targets the initiate-workflow Lambda function', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'travel-policy-platform-uk-policy-decision-approval',
        Targets: Match.arrayWith([
          Match.objectLike({
            Arn: Match.anyValue(),
          }),
        ]),
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
                Limit: 3000,
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
    it('exports the Approval API URL', () => {
      template.hasOutput('ApprovalApiUrl', {
        Export: { Name: 'travel-policy-platform-uk-approval-api-url' },
      });
    });

    it('exports the Approval API ID', () => {
      template.hasOutput('ApprovalApiId', {
        Export: { Name: 'travel-policy-platform-uk-approval-api-id' },
      });
    });
  });
});
