/**
 * Lambda handler for integration health monitoring.
 * GET /v1/integrations/{integrationId}/health
 *
 * Returns health metrics:
 * - Message throughput (last hour)
 * - Error rate
 * - Average latency
 * - Queue depth
 * Queries the database for recent event counts and determines health status.
 * Health status: healthy/degraded/unhealthy based on error rate thresholds.
 *
 * Requirements: 25.5, 25.6
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';
import type { IntegrationHealthStatus } from '@travel-policy/shared';
import { randomUUID } from 'crypto';

/** Error rate thresholds for health status determination */
const HEALTH_THRESHOLDS = {
  /** Error rate below this is healthy */
  healthy: 0.01,
  /** Error rate below this is degraded, above is unhealthy */
  degraded: 0.05,
};

/**
 * Health metrics for an integration.
 */
interface IntegrationHealthMetrics {
  integrationId: string;
  tenantId: string;
  status: IntegrationHealthStatus;
  metrics: {
    throughputLastHour: number;
    throughputLast24h: number;
    errorRate: number;
    errorCountLastHour: number;
    successCountLastHour: number;
    averageLatencyMs: number;
    queueDepth: number;
  };
  lastSuccessfulEvent: string | null;
  lastFailedEvent: string | null;
  checkedAt: string;
}

/**
 * Database row for event metrics aggregation.
 */
interface EventMetricsRow {
  total_events: string;
  successful_events: string;
  failed_events: string;
  avg_latency_ms: string;
}

/**
 * Database row for 24h event count.
 */
interface Events24hRow {
  total_events: string;
}

/**
 * Database row for last event timestamps.
 */
interface LastEventRow {
  last_successful: string | null;
  last_failed: string | null;
}

/**
 * Database row for queue depth.
 */
interface QueueDepthRow {
  pending_count: string;
}

/**
 * Integration record from the database.
 */
interface IntegrationRecord {
  integration_id: string;
  tenant_id: string;
  status: string;
  health_status: string;
}

/**
 * Main Lambda handler for getting integration health metrics.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId ?? randomUUID();
  const integrationId = event.pathParameters?.integrationId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    if (!integrationId) {
      return errorResponse(400, 'MISSING_INTEGRATION_ID', 'Integration ID is required in the path', requestId);
    }

    // Verify integration exists and belongs to tenant
    const integration = await withDatabase(async (client) => {
      const result = await client.query<IntegrationRecord>(
        `SELECT integration_id, tenant_id, status, health_status
         FROM platform.integrations
         WHERE integration_id = $1 AND tenant_id = $2`,
        [integrationId, tenantId]
      );
      return result.rows[0] ?? null;
    });

    if (!integration) {
      return errorResponse(404, 'NOT_FOUND', 'Integration not found', requestId);
    }

    // Gather health metrics
    const metrics = await gatherHealthMetrics(integrationId);

    // Determine health status based on error rate
    const healthStatus = determineHealthStatus(metrics.errorRate, metrics.throughputLastHour);

    // Update health status in the database
    await withDatabase(async (client) => {
      await client.query(
        `UPDATE platform.integrations
         SET health_status = $1, last_health_check = $2
         WHERE integration_id = $3`,
        [healthStatus, new Date().toISOString(), integrationId]
      );
    });

    const response: IntegrationHealthMetrics = {
      integrationId,
      tenantId,
      status: healthStatus,
      metrics: {
        throughputLastHour: metrics.throughputLastHour,
        throughputLast24h: metrics.throughputLast24h,
        errorRate: metrics.errorRate,
        errorCountLastHour: metrics.errorCountLastHour,
        successCountLastHour: metrics.successCountLastHour,
        averageLatencyMs: metrics.averageLatencyMs,
        queueDepth: metrics.queueDepth,
      },
      lastSuccessfulEvent: metrics.lastSuccessfulEvent,
      lastFailedEvent: metrics.lastFailedEvent,
      checkedAt: new Date().toISOString(),
    };

    return successResponse(200, response, requestId);
  } catch (error) {
    console.error('Error getting integration health', {
      requestId,
      integrationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred', requestId);
  }
}

/**
 * Gathers health metrics for an integration from the database.
 * Queries recent webhook events to calculate throughput, error rate, and latency.
 */
async function gatherHealthMetrics(integrationId: string): Promise<{
  throughputLastHour: number;
  throughputLast24h: number;
  errorRate: number;
  errorCountLastHour: number;
  successCountLastHour: number;
  averageLatencyMs: number;
  queueDepth: number;
  lastSuccessfulEvent: string | null;
  lastFailedEvent: string | null;
}> {
  return withDatabase(async (client) => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Get event metrics for the last hour
    const metricsResult = await client.query<EventMetricsRow>(
      `SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE status = 'processed') as successful_events,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_events,
        COALESCE(AVG(EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000) FILTER (WHERE processed_at IS NOT NULL), 0) as avg_latency_ms
      FROM platform.webhook_events
      WHERE integration_id = $1 AND received_at >= $2`,
      [integrationId, oneHourAgo]
    );

    // Get 24h event count
    const events24hResult = await client.query<Events24hRow>(
      `SELECT COUNT(*) as total_events
       FROM platform.webhook_events
       WHERE integration_id = $1 AND received_at >= $2`,
      [integrationId, twentyFourHoursAgo]
    );

    // Get last successful and failed event timestamps
    const lastEventsResult = await client.query<LastEventRow>(
      `SELECT
        MAX(received_at) FILTER (WHERE status = 'processed') as last_successful,
        MAX(received_at) FILTER (WHERE status = 'failed') as last_failed
      FROM platform.webhook_events
      WHERE integration_id = $1`,
      [integrationId]
    );

    // Get queue depth (pending events)
    const queueResult = await client.query<QueueDepthRow>(
      `SELECT COUNT(*) as pending_count
       FROM platform.webhook_events
       WHERE integration_id = $1 AND status = 'pending'`,
      [integrationId]
    );

    const metrics = metricsResult.rows[0];
    const totalEvents = parseInt(metrics?.total_events ?? '0', 10);
    const successfulEvents = parseInt(metrics?.successful_events ?? '0', 10);
    const failedEvents = parseInt(metrics?.failed_events ?? '0', 10);
    const avgLatencyMs = parseFloat(metrics?.avg_latency_ms ?? '0');

    const events24h = parseInt(events24hResult.rows[0]?.total_events ?? '0', 10);
    const lastEvents = lastEventsResult.rows[0];
    const queueDepth = parseInt(queueResult.rows[0]?.pending_count ?? '0', 10);

    const errorRate = totalEvents > 0 ? failedEvents / totalEvents : 0;

    return {
      throughputLastHour: totalEvents,
      throughputLast24h: events24h,
      errorRate: Math.round(errorRate * 10000) / 10000, // 4 decimal places
      errorCountLastHour: failedEvents,
      successCountLastHour: successfulEvents,
      averageLatencyMs: Math.round(avgLatencyMs * 100) / 100, // 2 decimal places
      queueDepth,
      lastSuccessfulEvent: lastEvents?.last_successful ?? null,
      lastFailedEvent: lastEvents?.last_failed ?? null,
    };
  });
}

/**
 * Determines the health status based on error rate and throughput.
 * - healthy: error rate < 1% or no events
 * - degraded: error rate between 1% and 5%
 * - unhealthy: error rate > 5%
 * - unknown: no events in the last hour
 */
export function determineHealthStatus(
  errorRate: number,
  throughputLastHour: number
): IntegrationHealthStatus {
  if (throughputLastHour === 0) {
    return 'unknown';
  }

  if (errorRate <= HEALTH_THRESHOLDS.healthy) {
    return 'healthy';
  }

  if (errorRate <= HEALTH_THRESHOLDS.degraded) {
    return 'degraded';
  }

  return 'unhealthy';
}
