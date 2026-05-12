import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DynamoDBStack } from '../../src/stacks/dynamodb-stack';

describe('DynamoDBStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new App();

    const stack = new DynamoDBStack(app, 'TestDynamoDB', {
      env: { account: '123456789012', region: 'eu-west-2' },
      platformRegion: 'uk',
      platformName: 'travel-policy-platform',
    });

    template = Template.fromStack(stack);
  });

  describe('AuditLog table', () => {
    it('creates the AuditLog table with correct key schema', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        KeySchema: [
          { AttributeName: 'tenantId', KeyType: 'HASH' },
          { AttributeName: 'timestamp#eventId', KeyType: 'RANGE' },
        ],
      });
    });

    it('configures PAY_PER_REQUEST billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('enables TTL on expiresAt attribute', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      });
    });

    it('creates tenantId-actionType-index GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'tenantId-actionType-index',
            KeySchema: [
              { AttributeName: 'tenantId', KeyType: 'HASH' },
              { AttributeName: 'actionType#timestamp', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          }),
        ]),
      });
    });

    it('creates tenantId-userId-index GSI', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({
            IndexName: 'tenantId-userId-index',
            KeySchema: [
              { AttributeName: 'tenantId', KeyType: 'HASH' },
              { AttributeName: 'userId#timestamp', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          }),
        ]),
      });
    });

    it('enables point-in-time recovery', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('enables encryption with AWS-managed KMS', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-audit-log',
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });
  });

  describe('WebhookIdempotency table', () => {
    it('creates the WebhookIdempotency table with correct key schema', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-webhook-idempotency',
        KeySchema: [
          { AttributeName: 'integrationId', KeyType: 'HASH' },
          { AttributeName: 'idempotencyKey', KeyType: 'RANGE' },
        ],
      });
    });

    it('configures PAY_PER_REQUEST billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-webhook-idempotency',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('enables TTL on expiresAt attribute', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-webhook-idempotency',
        TimeToLiveSpecification: {
          AttributeName: 'expiresAt',
          Enabled: true,
        },
      });
    });

    it('enables point-in-time recovery', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-webhook-idempotency',
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('enables encryption with AWS-managed KMS', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-webhook-idempotency',
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });
  });

  describe('PolicyBundleCache table', () => {
    it('creates the PolicyBundleCache table with correct key schema', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-policy-bundle-cache',
        KeySchema: [
          { AttributeName: 'tenantId', KeyType: 'HASH' },
          { AttributeName: 'bundleVersion', KeyType: 'RANGE' },
        ],
      });
    });

    it('configures PAY_PER_REQUEST billing mode', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-policy-bundle-cache',
        BillingMode: 'PAY_PER_REQUEST',
      });
    });

    it('enables point-in-time recovery', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-policy-bundle-cache',
        PointInTimeRecoverySpecification: {
          PointInTimeRecoveryEnabled: true,
        },
      });
    });

    it('enables encryption with AWS-managed KMS', () => {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: 'travel-policy-platform-uk-policy-bundle-cache',
        SSESpecification: {
          SSEEnabled: true,
        },
      });
    });
  });

  describe('Stack configuration', () => {
    it('creates exactly 3 DynamoDB tables', () => {
      template.resourceCountIs('AWS::DynamoDB::Table', 3);
    });

    it('exports AuditLog table name', () => {
      template.hasOutput('AuditLogTableName', {
        Export: { Name: 'travel-policy-platform-uk-audit-log-table-name' },
      });
    });

    it('exports AuditLog table ARN', () => {
      template.hasOutput('AuditLogTableArn', {
        Export: { Name: 'travel-policy-platform-uk-audit-log-table-arn' },
      });
    });

    it('exports WebhookIdempotency table name', () => {
      template.hasOutput('WebhookIdempotencyTableName', {
        Export: { Name: 'travel-policy-platform-uk-webhook-idempotency-table-name' },
      });
    });

    it('exports WebhookIdempotency table ARN', () => {
      template.hasOutput('WebhookIdempotencyTableArn', {
        Export: { Name: 'travel-policy-platform-uk-webhook-idempotency-table-arn' },
      });
    });

    it('exports PolicyBundleCache table name', () => {
      template.hasOutput('PolicyBundleCacheTableName', {
        Export: { Name: 'travel-policy-platform-uk-policy-bundle-cache-table-name' },
      });
    });

    it('exports PolicyBundleCache table ARN', () => {
      template.hasOutput('PolicyBundleCacheTableArn', {
        Export: { Name: 'travel-policy-platform-uk-policy-bundle-cache-table-arn' },
      });
    });
  });
});
