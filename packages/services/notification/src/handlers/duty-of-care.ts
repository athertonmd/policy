/**
 * Duty of Care Integration Handler
 *
 * EventBridge handler for ApprovalWorkflowCompleted events.
 * Publishes traveller itinerary to configured duty-of-care systems via webhook.
 * Publishes updates on modification/cancellation.
 * Handles disruption alerts with escalation notifications.
 *
 * Requirements: 16.1, 16.2, 16.3, 16.4
 */
import type { EventBridgeEvent, Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';
const DELIVERY_SLA_MS = 60_000; // 60 seconds

// --- Types ---

export interface ItinerarySegment {
  segmentId: string;
  type: 'flight' | 'hotel' | 'rail' | 'car' | 'transfer';
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  carrier?: string;
  bookingReference?: string;
  status: 'confirmed' | 'modified' | 'cancelled';
}

export interface TravellerItinerary {
  tenantId: string;
  travellerId: string;
  travellerName: string;
  travellerEmail: string;
  tripId: string;
  segments: ItinerarySegment[];
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
}

export interface DutyOfCareConfig {
  tenantId: string;
  systemId: string;
  systemName: string;
  webhookUrl: string;
  authType: 'bearer' | 'api-key' | 'hmac';
  authCredential: string;
  enabled: boolean;
  deliveryPattern: 'webhook' | 'eventbridge';
  eventBusArn?: string;
}

export interface DisruptionAlert {
  tenantId: string;
  travellerId: string;
  tripId: string;
  alertType: 'cancellation' | 'delay' | 'security' | 'weather' | 'health';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedSegments: string[];
  sourceSystem: string;
  timestamp: string;
}

export type DutyOfCareEventType =
  | 'ApprovalWorkflowCompleted'
  | 'ItineraryModified'
  | 'ItineraryCancelled'
  | 'DisruptionAlertReceived';

export interface DutyOfCareEventDetail {
  eventType: DutyOfCareEventType;
  tenantId: string;
  travellerId: string;
  tripId: string;
  itinerary?: TravellerItinerary;
  disruption?: DisruptionAlert;
  timestamp: string;
  correlationId: string;
}

export interface WebhookDeliveryResult {
  systemId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  deliveredAt: string;
  latencyMs: number;
}

// --- Webhook Delivery ---

/**
 * Deliver itinerary data to a duty-of-care system via webhook.
 */
async function deliverViaWebhook(
  config: DutyOfCareConfig,
  payload: Record<string, unknown>
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Platform-Source': 'travel-policy-platform',
      'X-Delivery-Timestamp': new Date().toISOString(),
    };

    switch (config.authType) {
      case 'bearer':
        headers['Authorization'] = `Bearer ${config.authCredential}`;
        break;
      case 'api-key':
        headers['X-API-Key'] = config.authCredential;
        break;
      case 'hmac': {
        const { createHmac } = await import('crypto');
        const body = JSON.stringify(payload);
        const signature = createHmac('sha256', config.authCredential)
          .update(body)
          .digest('hex');
        headers['X-Signature'] = signature;
        break;
      }
    }

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    const latencyMs = Date.now() - startTime;

    return {
      systemId: config.systemId,
      success: response.ok,
      statusCode: response.status,
      deliveredAt: new Date().toISOString(),
      latencyMs,
      error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      systemId: config.systemId,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown delivery error',
      deliveredAt: new Date().toISOString(),
      latencyMs,
    };
  }
}

/**
 * Deliver itinerary data via EventBridge to a duty-of-care system.
 */
async function deliverViaEventBridge(
  config: DutyOfCareConfig,
  payload: Record<string, unknown>,
  eventType: string
): Promise<WebhookDeliveryResult> {
  const startTime = Date.now();

  try {
    const targetBus = config.eventBusArn ?? EVENT_BUS_NAME;

    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'travel-policy-platform.duty-of-care',
            DetailType: `DutyOfCare.${eventType}`,
            Detail: JSON.stringify(payload),
            EventBusName: targetBus,
          },
        ],
      })
    );

    const latencyMs = Date.now() - startTime;
    return {
      systemId: config.systemId,
      success: true,
      deliveredAt: new Date().toISOString(),
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    return {
      systemId: config.systemId,
      success: false,
      error: error instanceof Error ? error.message : 'EventBridge delivery failed',
      deliveredAt: new Date().toISOString(),
      latencyMs,
    };
  }
}

// --- Configuration Resolution ---

/**
 * Resolve duty-of-care system configurations for a tenant.
 * In production, this would query the tenant's configuration store.
 */
async function getDutyOfCareConfigs(tenantId: string): Promise<DutyOfCareConfig[]> {
  // In production: query from tenant config table
  // For now, resolve from environment or return empty if not configured
  const configJson = process.env.DUTY_OF_CARE_CONFIGS;
  if (!configJson) {
    return [];
  }

  try {
    const allConfigs = JSON.parse(configJson) as DutyOfCareConfig[];
    return allConfigs.filter((c) => c.tenantId === tenantId && c.enabled);
  } catch {
    console.error('Failed to parse DUTY_OF_CARE_CONFIGS environment variable');
    return [];
  }
}

// --- Core Logic ---

/**
 * Publish itinerary to all configured duty-of-care systems for a tenant.
 * Must complete within 60 seconds of the triggering event (Requirement 16.1, 16.2).
 */
async function publishItinerary(
  itinerary: TravellerItinerary,
  eventType: DutyOfCareEventType,
  correlationId: string
): Promise<WebhookDeliveryResult[]> {
  const configs = await getDutyOfCareConfigs(itinerary.tenantId);

  if (configs.length === 0) {
    console.log(`No duty-of-care systems configured for tenant ${itinerary.tenantId}`);
    return [];
  }

  const payload = {
    eventType,
    itinerary,
    correlationId,
    publishedAt: new Date().toISOString(),
  };

  const deliveryPromises = configs.map((config) => {
    if (config.deliveryPattern === 'eventbridge') {
      return deliverViaEventBridge(config, payload, eventType);
    }
    return deliverViaWebhook(config, payload);
  });

  const results = await Promise.all(deliveryPromises);

  // Log failures for monitoring
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.error(
      `Duty-of-care delivery failures for tenant ${itinerary.tenantId}:`,
      JSON.stringify(failures)
    );
  }

  return results;
}

/**
 * Handle disruption alerts from duty-of-care systems.
 * Creates escalation notification to travel risk manager within 30 seconds (Requirement 16.4).
 */
async function handleDisruptionAlert(
  alert: DisruptionAlert,
  correlationId: string
): Promise<void> {
  console.log(
    `Processing disruption alert for traveller ${alert.travellerId}, severity: ${alert.severity}`
  );

  // Publish escalation event for the notification service to pick up
  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: 'travel-policy-platform.duty-of-care',
          DetailType: 'TravelDisruptionEscalation',
          Detail: JSON.stringify({
            tenantId: alert.tenantId,
            travellerId: alert.travellerId,
            tripId: alert.tripId,
            alertType: alert.alertType,
            severity: alert.severity,
            description: alert.description,
            affectedSegments: alert.affectedSegments,
            sourceSystem: alert.sourceSystem,
            correlationId,
            escalatedAt: new Date().toISOString(),
            requiresAction: alert.severity === 'high' || alert.severity === 'critical',
          }),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    })
  );

  // For critical alerts, also publish a high-priority notification
  if (alert.severity === 'critical') {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'travel-policy-platform.duty-of-care',
            DetailType: 'CriticalTravelAlert',
            Detail: JSON.stringify({
              tenantId: alert.tenantId,
              travellerId: alert.travellerId,
              tripId: alert.tripId,
              alertType: alert.alertType,
              description: alert.description,
              correlationId,
              timestamp: new Date().toISOString(),
            }),
            EventBusName: EVENT_BUS_NAME,
          },
        ],
      })
    );
  }
}

// --- Lambda Handler ---

/**
 * EventBridge handler for duty-of-care integration events.
 */
export async function handler(
  event: EventBridgeEvent<'DutyOfCareEvent', DutyOfCareEventDetail>,
  context: Context
): Promise<void> {
  const startTime = Date.now();
  const correlationId = event.detail.correlationId ?? context.awsRequestId;

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Processing duty-of-care event',
    eventType: event.detail.eventType,
    tenantId: event.detail.tenantId,
    travellerId: event.detail.travellerId,
    tripId: event.detail.tripId,
    correlationId,
  }));

  try {
    switch (event.detail.eventType) {
      case 'ApprovalWorkflowCompleted': {
        if (!event.detail.itinerary) {
          throw new Error('Itinerary data required for ApprovalWorkflowCompleted event');
        }
        await publishItinerary(event.detail.itinerary, 'ApprovalWorkflowCompleted', correlationId);
        break;
      }

      case 'ItineraryModified': {
        if (!event.detail.itinerary) {
          throw new Error('Itinerary data required for ItineraryModified event');
        }
        await publishItinerary(event.detail.itinerary, 'ItineraryModified', correlationId);
        break;
      }

      case 'ItineraryCancelled': {
        if (!event.detail.itinerary) {
          throw new Error('Itinerary data required for ItineraryCancelled event');
        }
        await publishItinerary(event.detail.itinerary, 'ItineraryCancelled', correlationId);
        break;
      }

      case 'DisruptionAlertReceived': {
        if (!event.detail.disruption) {
          throw new Error('Disruption data required for DisruptionAlertReceived event');
        }
        await handleDisruptionAlert(event.detail.disruption, correlationId);
        break;
      }

      default:
        console.warn(`Unknown duty-of-care event type: ${event.detail.eventType}`);
    }

    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > DELIVERY_SLA_MS) {
      console.warn(
        `Duty-of-care delivery exceeded SLA: ${elapsedMs}ms (limit: ${DELIVERY_SLA_MS}ms)`
      );
    }

    console.log(JSON.stringify({
      level: 'INFO',
      message: 'Duty-of-care event processed successfully',
      eventType: event.detail.eventType,
      correlationId,
      elapsedMs,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: 'ERROR',
      message: 'Duty-of-care event processing failed',
      eventType: event.detail.eventType,
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    throw error;
  }
}
