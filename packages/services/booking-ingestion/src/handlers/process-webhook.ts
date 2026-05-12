/**
 * SQS event handler for asynchronous webhook processing.
 * Triggered by SQS when events are queued by the webhook receiver.
 *
 * For each message:
 * 1. Parses the queued event (eventId, integrationId, payload, receivedAt)
 * 2. Loads the integration's payload mapping configuration from the DB
 * 3. Applies the payload mapping to transform raw payload into PolicyDecisionRequest
 * 4. Publishes BookingReceived event to EventBridge
 * 5. Triggers policy evaluation via EventBridge
 * 6. On success: publishes BookingValidated event
 * 7. On failure: lets SQS retry (message goes back to queue via visibility timeout)
 *
 * Must complete within 30 seconds of original receipt.
 *
 * Requirements: 7.2, 7.4, 7.5
 */
import type { SQSEvent, SQSRecord, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { mapPayload, PayloadMappingError } from '../lib/payload-mapper.js';
import type { PayloadMappingConfig } from '../lib/payload-mapper.js';
import { withDatabase } from '../lib/database.js';
import type { PolicyDecisionRequest } from '@travel-policy/shared';

const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';
const EVENT_SOURCE = 'travel-policy-platform.booking-ingestion';
const PROCESSING_TIMEOUT_MS = 25_000; // 25s safety margin within 30s SLA

/**
 * Structure of the message body queued by the webhook receiver.
 */
interface QueuedWebhookEvent {
  eventId: string;
  integrationId: string;
  idempotencyKey: string;
  payload: unknown;
  receivedAt: string;
}

/**
 * Integration configuration stored in the database.
 */
interface IntegrationRecord {
  integration_id: string;
  tenant_id: string;
  source_type: string;
  source_name: string;
  payload_mapping: PayloadMappingConfig | string;
  status: string;
}

/**
 * Main SQS Lambda handler. Processes webhook events in batch with partial failure reporting.
 * Uses SQS partial batch failure to allow individual message retries.
 */
export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchItemFailure[] = [];
  const startTime = Date.now();

  for (const record of event.Records) {
    // Check if we're approaching the processing timeout
    const elapsed = Date.now() - startTime;
    if (elapsed > PROCESSING_TIMEOUT_MS) {
      // Mark remaining records as failures so they return to the queue
      batchItemFailures.push({ itemIdentifier: record.messageId });
      continue;
    }

    try {
      await processRecord(record);
    } catch (error) {
      console.error('Failed to process webhook event', {
        messageId: record.messageId,
        error: error instanceof Error ? error.message : String(error),
      });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
}

/**
 * Processes a single SQS record containing a webhook event.
 */
async function processRecord(record: SQSRecord): Promise<void> {
  // 1. Parse the queued event
  const queuedEvent = parseQueuedEvent(record.body);

  const { eventId, integrationId, payload, receivedAt } = queuedEvent;

  console.info('Processing webhook event', { eventId, integrationId, receivedAt });

  // 2. Load integration configuration from DB
  const integration = await loadIntegrationConfig(integrationId);

  if (!integration) {
    throw new Error(`Integration not found: ${integrationId}`);
  }

  if (integration.status !== 'active') {
    throw new Error(`Integration ${integrationId} is not active (status: ${integration.status})`);
  }

  // 3. Parse the payload mapping config
  const mappingConfig = parseMappingConfig(integration.payload_mapping);

  // 4. Publish BookingReceived event
  await publishEvent('BookingReceived', {
    eventId,
    integrationId,
    tenantId: integration.tenant_id,
    sourceType: integration.source_type,
    sourceName: integration.source_name,
    receivedAt,
    processedAt: new Date().toISOString(),
  });

  // 5. Apply payload mapping to transform into PolicyDecisionRequest
  let policyRequest: PolicyDecisionRequest;
  try {
    policyRequest = mapPayload(payload, mappingConfig);
  } catch (error) {
    if (error instanceof PayloadMappingError) {
      console.error('Payload mapping failed', {
        eventId,
        integrationId,
        field: error.field,
        path: error.path,
        message: error.message,
      });
    }
    throw error;
  }

  // 6. Verify processing time constraint (30 seconds from receipt)
  const receiptTime = new Date(receivedAt).getTime();
  const now = Date.now();
  const elapsedSinceReceipt = now - receiptTime;

  if (elapsedSinceReceipt > 30_000) {
    console.warn('Processing exceeded 30-second SLA', {
      eventId,
      elapsedMs: elapsedSinceReceipt,
    });
  }

  // 7. Trigger policy evaluation via EventBridge
  await publishEvent('PolicyEvaluationRequested', {
    eventId,
    integrationId,
    tenantId: integration.tenant_id,
    policyRequest,
    triggeredAt: new Date().toISOString(),
  });

  // 8. Publish BookingValidated event on success
  await publishEvent('BookingValidated', {
    eventId,
    integrationId,
    tenantId: integration.tenant_id,
    sourceType: integration.source_type,
    tripId: policyRequest.trip.tripId,
    travellerId: policyRequest.traveller.travellerId,
    validatedAt: new Date().toISOString(),
  });

  console.info('Successfully processed webhook event', {
    eventId,
    integrationId,
    tenantId: integration.tenant_id,
    tripId: policyRequest.trip.tripId,
  });
}

/**
 * Parses the SQS message body into a QueuedWebhookEvent.
 */
function parseQueuedEvent(body: string): QueuedWebhookEvent {
  try {
    const parsed = JSON.parse(body) as QueuedWebhookEvent;

    if (!parsed.eventId || !parsed.integrationId || !parsed.receivedAt) {
      throw new Error('Missing required fields in queued event');
    }

    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse queued event: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Loads integration configuration from the database.
 */
async function loadIntegrationConfig(integrationId: string): Promise<IntegrationRecord | null> {
  return withDatabase(async (client) => {
    const result = await client.query<IntegrationRecord>(
      `SELECT integration_id, tenant_id, source_type, source_name, payload_mapping, status
       FROM platform.integrations
       WHERE integration_id = $1`,
      [integrationId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    return result.rows[0];
  });
}

/**
 * Parses the payload mapping configuration from the database record.
 * The config may be stored as a JSON string or already parsed object.
 */
function parseMappingConfig(config: PayloadMappingConfig | string): PayloadMappingConfig {
  if (typeof config === 'string') {
    try {
      return JSON.parse(config) as PayloadMappingConfig;
    } catch {
      throw new Error('Invalid payload mapping configuration: not valid JSON');
    }
  }
  return config;
}

/**
 * Publishes a domain event to EventBridge.
 */
async function publishEvent(
  detailType: string,
  detail: Record<string, unknown>
): Promise<void> {
  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: EVENT_SOURCE,
          DetailType: detailType,
          Detail: JSON.stringify({
            ...detail,
            timestamp: new Date().toISOString(),
          }),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    })
  );
}
