/**
 * Compliance Metrics Handler
 *
 * GET /v1/reports/compliance — Provides policy compliance rates segmented by
 * department, traveller, trip type, supplier, and channel. Generates alerts
 * when compliance falls below configurable thresholds.
 *
 * Requirements: 28.1, 28.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { withDatabase, type DatabaseClient } from '../lib/database';

// --- Types ---

interface ComplianceMetricsResponse {
  tenant_id: string;
  generated_at: string;
  date_from: string;
  date_to: string;
  overall_compliance_rate: number;
  total_decisions: number;
  compliant_decisions: number;
  non_compliant_decisions: number;
  segmentation: ComplianceSegmentation;
  trends: ComplianceTrend[];
  alerts: ComplianceAlert[];
}

interface ComplianceSegmentation {
  by_department: ComplianceSegment[];
  by_traveller: ComplianceSegment[];
  by_trip_type: ComplianceSegment[];
  by_supplier: ComplianceSegment[];
  by_channel: ComplianceSegment[];
}

interface ComplianceSegment {
  segment_key: string;
  segment_value: string;
  total_decisions: number;
  compliant_decisions: number;
  compliance_rate: number;
  override_count: number;
}

interface ComplianceTrend {
  period: string;
  compliance_rate: number;
  total_decisions: number;
  override_rate: number;
}

interface ComplianceAlert {
  alert_type: 'low_compliance' | 'compliance_drop' | 'high_override_rate';
  severity: 'warning' | 'critical';
  segment: string;
  segment_value: string;
  message: string;
  current_value: number;
  threshold: number;
  triggered_at: string;
}

// --- Helpers ---

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode: number, code: string, message: string): APIGatewayProxyResult {
  return jsonResponse(statusCode, {
    error: { code, message, timestamp: new Date().toISOString() },
  });
}

function getTenantSchema(event: APIGatewayProxyEvent): string | null {
  const tenantSchema = event.requestContext?.authorizer?.tenantSchema as string | undefined;
  return tenantSchema ?? process.env.DEFAULT_TENANT_SCHEMA ?? null;
}

function getTenantId(event: APIGatewayProxyEvent): string | null {
  const tenantId = event.requestContext?.authorizer?.tenantId as string | undefined;
  return tenantId ?? process.env.DEFAULT_TENANT_ID ?? null;
}

// --- SQL Queries ---

async function queryOverallCompliance(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<{ total: number; compliant: number; nonCompliant: number; rate: number }> {
  const sql = `
    SELECT
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(CASE WHEN pd.result IN ('reject', 'review') THEN 1 END) AS non_compliant_decisions
    FROM ${schema}.policy_decisions pd
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);
  const row = result.rows[0] ?? {};

  const total = Number(row.total_decisions ?? 0);
  const compliant = Number(row.compliant_decisions ?? 0);
  const nonCompliant = Number(row.non_compliant_decisions ?? 0);
  const rate = total > 0 ? (compliant / total) * 100 : 100;

  return { total, compliant, nonCompliant, rate: Number(rate.toFixed(2)) };
}

async function queryComplianceByDepartment(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceSegment[]> {
  const sql = `
    SELECT
      COALESCE(tp.department, 'unknown') AS segment_value,
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(po.override_id) AS override_count
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY tp.department
    ORDER BY total_decisions DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const total = Number(row.total_decisions ?? 0);
    const compliant = Number(row.compliant_decisions ?? 0);
    return {
      segment_key: 'department',
      segment_value: String(row.segment_value ?? 'unknown'),
      total_decisions: total,
      compliant_decisions: compliant,
      compliance_rate: total > 0 ? Number(((compliant / total) * 100).toFixed(2)) : 100,
      override_count: Number(row.override_count ?? 0),
    };
  });
}

async function queryComplianceByTraveller(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceSegment[]> {
  const sql = `
    SELECT
      COALESCE(tp.full_name, pd.traveller_id::text) AS segment_value,
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(po.override_id) AS override_count
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY tp.full_name, pd.traveller_id
    ORDER BY total_decisions DESC
    LIMIT 20
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const total = Number(row.total_decisions ?? 0);
    const compliant = Number(row.compliant_decisions ?? 0);
    return {
      segment_key: 'traveller',
      segment_value: String(row.segment_value ?? 'unknown'),
      total_decisions: total,
      compliant_decisions: compliant,
      compliance_rate: total > 0 ? Number(((compliant / total) * 100).toFixed(2)) : 100,
      override_count: Number(row.override_count ?? 0),
    };
  });
}

async function queryComplianceByTripType(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceSegment[]> {
  const sql = `
    SELECT
      COALESCE(pd.request_payload->'trip'->>'tripType', 'unknown') AS segment_value,
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(po.override_id) AS override_count
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY pd.request_payload->'trip'->>'tripType'
    ORDER BY total_decisions DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const total = Number(row.total_decisions ?? 0);
    const compliant = Number(row.compliant_decisions ?? 0);
    return {
      segment_key: 'trip_type',
      segment_value: String(row.segment_value ?? 'unknown'),
      total_decisions: total,
      compliant_decisions: compliant,
      compliance_rate: total > 0 ? Number(((compliant / total) * 100).toFixed(2)) : 100,
      override_count: Number(row.override_count ?? 0),
    };
  });
}

async function queryComplianceBySupplier(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceSegment[]> {
  const sql = `
    SELECT
      COALESCE(pd.request_payload->'offers'->0->>'supplier', 'unknown') AS segment_value,
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(po.override_id) AS override_count
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY pd.request_payload->'offers'->0->>'supplier'
    ORDER BY total_decisions DESC
    LIMIT 20
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const total = Number(row.total_decisions ?? 0);
    const compliant = Number(row.compliant_decisions ?? 0);
    return {
      segment_key: 'supplier',
      segment_value: String(row.segment_value ?? 'unknown'),
      total_decisions: total,
      compliant_decisions: compliant,
      compliance_rate: total > 0 ? Number(((compliant / total) * 100).toFixed(2)) : 100,
      override_count: Number(row.override_count ?? 0),
    };
  });
}

async function queryComplianceByChannel(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceSegment[]> {
  const sql = `
    SELECT
      COALESCE(pd.request_payload->>'decisionPoint', 'unknown') AS segment_value,
      COUNT(pd.decision_id) AS total_decisions,
      COUNT(CASE WHEN pd.result = 'approve' THEN 1 END) AS compliant_decisions,
      COUNT(po.override_id) AS override_count
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY pd.request_payload->>'decisionPoint'
    ORDER BY total_decisions DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const total = Number(row.total_decisions ?? 0);
    const compliant = Number(row.compliant_decisions ?? 0);
    return {
      segment_key: 'channel',
      segment_value: String(row.segment_value ?? 'unknown'),
      total_decisions: total,
      compliant_decisions: compliant,
      compliance_rate: total > 0 ? Number(((compliant / total) * 100).toFixed(2)) : 100,
      override_count: Number(row.override_count ?? 0),
    };
  });
}

async function queryComplianceTrends(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ComplianceTrend[]> {
  const sql = `
    SELECT
      to_char(pd.evaluated_at, 'YYYY-MM') AS period,
      COUNT(pd.decision_id) AS total_decisions,
      CASE
        WHEN COUNT(pd.decision_id) > 0
        THEN (COUNT(CASE WHEN pd.result = 'approve' THEN 1 END)::numeric / COUNT(pd.decision_id)::numeric) * 100
        ELSE 100
      END AS compliance_rate,
      CASE
        WHEN COUNT(pd.decision_id) > 0
        THEN (COUNT(po.override_id)::numeric / COUNT(pd.decision_id)::numeric) * 100
        ELSE 0
      END AS override_rate
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id AND po.status = 'approved'
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
    GROUP BY to_char(pd.evaluated_at, 'YYYY-MM')
    ORDER BY period ASC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => ({
    period: String(row.period),
    compliance_rate: Number(Number(row.compliance_rate ?? 100).toFixed(2)),
    total_decisions: Number(row.total_decisions ?? 0),
    override_rate: Number(Number(row.override_rate ?? 0).toFixed(2)),
  }));
}

function generateComplianceAlerts(
  segmentation: ComplianceSegmentation,
  complianceThreshold: number
): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const now = new Date().toISOString();

  // Check department compliance
  for (const segment of segmentation.by_department) {
    if (segment.total_decisions >= 5 && segment.compliance_rate < complianceThreshold) {
      alerts.push({
        alert_type: 'low_compliance',
        severity: segment.compliance_rate < complianceThreshold - 20 ? 'critical' : 'warning',
        segment: 'department',
        segment_value: segment.segment_value,
        message: `Department "${segment.segment_value}" compliance rate (${segment.compliance_rate}%) is below threshold (${complianceThreshold}%)`,
        current_value: segment.compliance_rate,
        threshold: complianceThreshold,
        triggered_at: now,
      });
    }

    // High override rate alert
    const overrideRate = segment.total_decisions > 0
      ? (segment.override_count / segment.total_decisions) * 100
      : 0;
    if (segment.total_decisions >= 5 && overrideRate > 20) {
      alerts.push({
        alert_type: 'high_override_rate',
        severity: overrideRate > 40 ? 'critical' : 'warning',
        segment: 'department',
        segment_value: segment.segment_value,
        message: `Department "${segment.segment_value}" has high override rate (${overrideRate.toFixed(1)}%)`,
        current_value: Number(overrideRate.toFixed(2)),
        threshold: 20,
        triggered_at: now,
      });
    }
  }

  return alerts;
}

async function publishComplianceAlerts(
  alerts: ComplianceAlert[],
  tenantId: string
): Promise<void> {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  if (criticalAlerts.length === 0) return;

  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: criticalAlerts.map((alert) => ({
          Source: 'travel-policy-platform',
          DetailType: 'ComplianceAlertRaised',
          Detail: JSON.stringify({
            tenantId,
            correlationId: `compliance_alert_${Date.now()}`,
            aggregateId: tenantId,
            aggregateType: 'ComplianceMetrics',
            payload: alert,
          }),
          EventBusName: EVENT_BUS_NAME,
        })),
      })
    );
  } catch (error) {
    console.error('Failed to publish compliance alerts:', error);
  }
}

// --- Handler ---

/**
 * GET /v1/reports/compliance — Get policy compliance metrics
 */
export async function getComplianceMetricsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  const tenantId = getTenantId(event);
  if (!tenantId) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant ID not resolved');
  }

  const params = event.queryStringParameters ?? {};

  // Default to last 30 days if no date range specified
  const dateTo = params.date_to ?? new Date().toISOString();
  const dateFrom = params.date_from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Configurable compliance threshold (default 80%)
  const complianceThreshold = params.compliance_threshold
    ? parseFloat(params.compliance_threshold)
    : 80;

  const report = await withDatabase(async (client) => {
    const [
      overall,
      byDepartment,
      byTraveller,
      byTripType,
      bySupplier,
      byChannel,
      trends,
    ] = await Promise.all([
      queryOverallCompliance(client, schema, dateFrom, dateTo),
      queryComplianceByDepartment(client, schema, dateFrom, dateTo),
      queryComplianceByTraveller(client, schema, dateFrom, dateTo),
      queryComplianceByTripType(client, schema, dateFrom, dateTo),
      queryComplianceBySupplier(client, schema, dateFrom, dateTo),
      queryComplianceByChannel(client, schema, dateFrom, dateTo),
      queryComplianceTrends(client, schema, dateFrom, dateTo),
    ]);

    const segmentation: ComplianceSegmentation = {
      by_department: byDepartment,
      by_traveller: byTraveller,
      by_trip_type: byTripType,
      by_supplier: bySupplier,
      by_channel: byChannel,
    };

    const alerts = generateComplianceAlerts(segmentation, complianceThreshold);

    // Publish critical alerts to EventBridge
    await publishComplianceAlerts(alerts, tenantId);

    const response: ComplianceMetricsResponse = {
      tenant_id: tenantId,
      generated_at: new Date().toISOString(),
      date_from: dateFrom,
      date_to: dateTo,
      overall_compliance_rate: overall.rate,
      total_decisions: overall.total,
      compliant_decisions: overall.compliant,
      non_compliant_decisions: overall.nonCompliant,
      segmentation,
      trends,
      alerts,
    };

    return response;
  });

  return jsonResponse(200, { data: report });
}
