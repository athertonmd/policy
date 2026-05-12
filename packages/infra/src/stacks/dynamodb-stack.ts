import {
  Stack,
  StackProps,
  RemovalPolicy,
  Tags,
  CfnOutput,
} from 'aws-cdk-lib';
import {
  Table,
  AttributeType,
  BillingMode,
  TableEncryption,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

export interface DynamoDBStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
}

/**
 * DynamoDB stack deploying operational tables for audit logging,
 * webhook idempotency, and policy bundle caching.
 *
 * All tables use PAY_PER_REQUEST billing, AWS-managed KMS encryption,
 * and point-in-time recovery.
 */
export class DynamoDBStack extends Stack {
  /** AuditLog table for immutable audit events */
  public readonly auditLogTable: Table;
  /** WebhookIdempotency table for deduplicating webhook deliveries */
  public readonly webhookIdempotencyTable: Table;
  /** PolicyBundleCache table for caching compiled policy bundles */
  public readonly policyBundleCacheTable: Table;

  constructor(scope: Construct, id: string, props: DynamoDBStackProps) {
    super(scope, id, props);

    const { platformRegion, platformName } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // AuditLog table
    this.auditLogTable = new Table(this, 'AuditLogTable', {
      tableName: `${prefix}-audit-log`,
      partitionKey: { name: 'tenantId', type: AttributeType.STRING },
      sortKey: { name: 'timestamp#eventId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // GSI1: tenantId-actionType-index
    this.auditLogTable.addGlobalSecondaryIndex({
      indexName: 'tenantId-actionType-index',
      partitionKey: { name: 'tenantId', type: AttributeType.STRING },
      sortKey: { name: 'actionType#timestamp', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI2: tenantId-userId-index
    this.auditLogTable.addGlobalSecondaryIndex({
      indexName: 'tenantId-userId-index',
      partitionKey: { name: 'tenantId', type: AttributeType.STRING },
      sortKey: { name: 'userId#timestamp', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // WebhookIdempotency table
    this.webhookIdempotencyTable = new Table(this, 'WebhookIdempotencyTable', {
      tableName: `${prefix}-webhook-idempotency`,
      partitionKey: { name: 'integrationId', type: AttributeType.STRING },
      sortKey: { name: 'idempotencyKey', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // PolicyBundleCache table
    this.policyBundleCacheTable = new Table(this, 'PolicyBundleCacheTable', {
      tableName: `${prefix}-policy-bundle-cache`,
      partitionKey: { name: 'tenantId', type: AttributeType.STRING },
      sortKey: { name: 'bundleVersion', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      encryption: TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // Tags
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'DynamoDB');

    // Outputs
    new CfnOutput(this, 'AuditLogTableName', {
      value: this.auditLogTable.tableName,
      description: 'DynamoDB AuditLog table name',
      exportName: `${prefix}-audit-log-table-name`,
    });

    new CfnOutput(this, 'AuditLogTableArn', {
      value: this.auditLogTable.tableArn,
      description: 'DynamoDB AuditLog table ARN',
      exportName: `${prefix}-audit-log-table-arn`,
    });

    new CfnOutput(this, 'WebhookIdempotencyTableName', {
      value: this.webhookIdempotencyTable.tableName,
      description: 'DynamoDB WebhookIdempotency table name',
      exportName: `${prefix}-webhook-idempotency-table-name`,
    });

    new CfnOutput(this, 'WebhookIdempotencyTableArn', {
      value: this.webhookIdempotencyTable.tableArn,
      description: 'DynamoDB WebhookIdempotency table ARN',
      exportName: `${prefix}-webhook-idempotency-table-arn`,
    });

    new CfnOutput(this, 'PolicyBundleCacheTableName', {
      value: this.policyBundleCacheTable.tableName,
      description: 'DynamoDB PolicyBundleCache table name',
      exportName: `${prefix}-policy-bundle-cache-table-name`,
    });

    new CfnOutput(this, 'PolicyBundleCacheTableArn', {
      value: this.policyBundleCacheTable.tableArn,
      description: 'DynamoDB PolicyBundleCache table ARN',
      exportName: `${prefix}-policy-bundle-cache-table-arn`,
    });
  }
}
