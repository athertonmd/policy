import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { EventBridgeStack } from '../../src/stacks/eventbridge-stack';

describe('EventBridgeStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();

    const stack = new EventBridgeStack(app, 'TestEventBridge', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
    });

    template = Template.fromStack(stack);
  });

  describe('Custom Event Bus', () => {
    it('creates a custom event bus with the correct name', () => {
      template.hasResourceProperties('AWS::Events::EventBus', {
        Name: 'travel-policy-platform-uk-event-bus',
      });
    });
  });

  describe('Dead-Letter Queue', () => {
    it('creates an SQS dead-letter queue with correct name', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'travel-policy-platform-uk-events-dlq',
      });
    });

    it('configures 14-day message retention', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'travel-policy-platform-uk-events-dlq',
        MessageRetentionPeriod: 1209600,
      });
    });

    it('enables SQS-managed encryption', () => {
      template.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'travel-policy-platform-uk-events-dlq',
        SqsManagedSseEnabled: true,
      });
    });
  });

  describe('Event Archive', () => {
    it('creates an event archive with correct name', () => {
      template.hasResourceProperties('AWS::Events::Archive', {
        ArchiveName: 'travel-policy-platform-uk-event-archive',
      });
    });

    it('configures 90-day retention', () => {
      template.hasResourceProperties('AWS::Events::Archive', {
        RetentionDays: 90,
      });
    });

    it('filters events from travel-policy-platform source', () => {
      template.hasResourceProperties('AWS::Events::Archive', {
        EventPattern: {
          source: ['travel-policy-platform'],
        },
      });
    });
  });

  describe('Schema Registry', () => {
    it('creates a schema registry', () => {
      template.hasResourceProperties('AWS::EventSchemas::Registry', {
        RegistryName: 'travel-policy-platform-uk-schema-registry',
      });
    });

    it('registers schemas for all 12 event types', () => {
      template.resourceCountIs('AWS::EventSchemas::Schema', 12);
    });

    it('registers PolicyDecisionMade schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.PolicyDecisionMade',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ApprovalWorkflowInitiated schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ApprovalWorkflowInitiated',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ApprovalActionTaken schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ApprovalActionTaken',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ApprovalWorkflowCompleted schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ApprovalWorkflowCompleted',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ApprovalEscalated schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ApprovalEscalated',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers BookingReceived schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.BookingReceived',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers BookingValidated schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.BookingValidated',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ProfileUpdated schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ProfileUpdated',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers BudgetThresholdBreached schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.BudgetThresholdBreached',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers PolicyRuleChanged schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.PolicyRuleChanged',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers TenantProvisioned schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.TenantProvisioned',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('registers ComplianceAlertRaised schema', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        SchemaName: 'travel-policy-platform.ComplianceAlertRaised',
        Type: 'JSONSchemaDraft4',
      });
    });

    it('schemas reference the correct registry', () => {
      template.hasResourceProperties('AWS::EventSchemas::Schema', {
        RegistryName: 'travel-policy-platform-uk-schema-registry',
      });
    });
  });

  describe('Catch-All DLQ Rule', () => {
    it('creates an EventBridge rule for failed deliveries', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'travel-policy-platform-uk-catch-all-dlq-rule',
        EventPattern: {
          source: ['travel-policy-platform'],
        },
      });
    });

    it('targets the DLQ with retry configuration', () => {
      template.hasResourceProperties('AWS::Events::Rule', {
        Name: 'travel-policy-platform-uk-catch-all-dlq-rule',
        Targets: Match.arrayWith([
          Match.objectLike({
            RetryPolicy: {
              MaximumRetryAttempts: 3,
              MaximumEventAgeInSeconds: 86400,
            },
          }),
        ]),
      });
    });
  });

  describe('Stack Outputs', () => {
    it('exports event bus ARN', () => {
      template.hasOutput('EventBusArn', {
        Export: { Name: 'travel-policy-platform-uk-event-bus-arn' },
      });
    });

    it('exports event bus name', () => {
      template.hasOutput('EventBusName', {
        Export: { Name: 'travel-policy-platform-uk-event-bus-name' },
      });
    });

    it('exports dead-letter queue ARN', () => {
      template.hasOutput('DeadLetterQueueArn', {
        Export: { Name: 'travel-policy-platform-uk-events-dlq-arn' },
      });
    });

    it('exports dead-letter queue URL', () => {
      template.hasOutput('DeadLetterQueueUrl', {
        Export: { Name: 'travel-policy-platform-uk-events-dlq-url' },
      });
    });
  });
});
