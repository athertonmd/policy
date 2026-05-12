import {
  Stack,
  StackProps,
  Tags,
  CfnOutput,
  Duration,
} from 'aws-cdk-lib';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventschemas from 'aws-cdk-lib/aws-eventschemas';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import { PlatformRegion } from '../config/environments';

/**
 * All domain event types published by the Travel Policy Platform.
 */
const EVENT_TYPES = [
  'PolicyDecisionMade',
  'ApprovalWorkflowInitiated',
  'ApprovalActionTaken',
  'ApprovalWorkflowCompleted',
  'ApprovalEscalated',
  'BookingReceived',
  'BookingValidated',
  'ProfileUpdated',
  'BudgetThresholdBreached',
  'PolicyRuleChanged',
  'TenantProvisioned',
  'ComplianceAlertRaised',
] as const;

/**
 * JSON Schema for the DomainEvent envelope used by all event types.
 */
function buildEventSchema(eventType: string): object {
  return {
    type: 'object',
    required: ['version', 'id', 'source', 'detail-type', 'time', 'region', 'detail'],
    properties: {
      version: { type: 'string', enum: ['1.0'] },
      id: { type: 'string', format: 'uuid' },
      source: { type: 'string', enum: ['travel-policy-platform'] },
      'detail-type': { type: 'string', enum: [eventType] },
      time: { type: 'string', format: 'date-time' },
      region: { type: 'string' },
      detail: {
        type: 'object',
        required: ['tenantId', 'correlationId', 'aggregateId', 'aggregateType', 'payload'],
        properties: {
          tenantId: { type: 'string' },
          correlationId: { type: 'string', format: 'uuid' },
          aggregateId: { type: 'string' },
          aggregateType: { type: 'string' },
          payload: { type: 'object' },
        },
      },
    },
  };
}

export interface EventBridgeStackProps extends StackProps {
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Platform name for resource naming */
  readonly platformName: string;
}

/**
 * EventBridge stack deploying the custom event bus, schema registry,
 * dead-letter queue, and event archive for the Travel Policy Platform.
 *
 * Validates: Requirements 17.1, 17.2, 17.4, 17.5
 */
export class EventBridgeStack extends Stack {
  /** Custom event bus for domain events */
  public readonly eventBus: events.EventBus;
  /** Dead-letter queue for failed event deliveries */
  public readonly deadLetterQueue: sqs.Queue;
  /** Event archive for replay capability */
  public readonly archive: events.CfnArchive;

  constructor(scope: Construct, id: string, props: EventBridgeStackProps) {
    super(scope, id, props);

    const { platformRegion, platformName } = props;
    const prefix = `${platformName}-${platformRegion}`;

    // Custom event bus
    this.eventBus = new events.EventBus(this, 'EventBus', {
      eventBusName: `${prefix}-event-bus`,
    });

    // Dead-letter queue for failed event deliveries
    this.deadLetterQueue = new sqs.Queue(this, 'DeadLetterQueue', {
      queueName: `${prefix}-events-dlq`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // Event archive for replay capability
    this.archive = new events.CfnArchive(this, 'EventArchive', {
      archiveName: `${prefix}-event-archive`,
      sourceArn: this.eventBus.eventBusArn,
      eventPattern: {
        source: ['travel-policy-platform'],
      },
      retentionDays: 90,
    });

    // Schema registry for domain event schemas
    const registryName = `${prefix}-schema-registry`;
    const registry = new eventschemas.CfnRegistry(this, 'SchemaRegistry', {
      registryName,
      description: `Schema registry for ${platformName} domain events`,
    });

    // Register JSON schemas for each event type
    for (const eventType of EVENT_TYPES) {
      new eventschemas.CfnSchema(this, `Schema${eventType}`, {
        registryName,
        schemaName: `${platformName}.${eventType}`,
        type: 'JSONSchemaDraft4',
        content: JSON.stringify(buildEventSchema(eventType)),
        description: `Schema for ${eventType} domain event`,
      });
    }

    // Catch-all rule routing failed deliveries to DLQ
    const catchAllRule = new events.Rule(this, 'CatchAllFailedDeliveryRule', {
      ruleName: `${prefix}-catch-all-dlq-rule`,
      eventBus: this.eventBus,
      eventPattern: {
        source: ['travel-policy-platform'],
      },
    });

    catchAllRule.addTarget(
      new targets.SqsQueue(this.deadLetterQueue, {
        deadLetterQueue: this.deadLetterQueue,
        retryAttempts: 3,
        maxEventAge: Duration.hours(24),
      }),
    );

    // Tags
    Tags.of(this).add('Platform', platformName);
    Tags.of(this).add('Region', platformRegion);
    Tags.of(this).add('Stack', 'EventBridge');

    // Outputs
    new CfnOutput(this, 'EventBusArn', {
      value: this.eventBus.eventBusArn,
      description: 'Custom EventBridge event bus ARN',
      exportName: `${prefix}-event-bus-arn`,
    });

    new CfnOutput(this, 'EventBusName', {
      value: this.eventBus.eventBusName,
      description: 'Custom EventBridge event bus name',
      exportName: `${prefix}-event-bus-name`,
    });

    new CfnOutput(this, 'DeadLetterQueueArn', {
      value: this.deadLetterQueue.queueArn,
      description: 'Dead-letter queue ARN for failed event deliveries',
      exportName: `${prefix}-events-dlq-arn`,
    });

    new CfnOutput(this, 'DeadLetterQueueUrl', {
      value: this.deadLetterQueue.queueUrl,
      description: 'Dead-letter queue URL for failed event deliveries',
      exportName: `${prefix}-events-dlq-url`,
    });
  }
}
