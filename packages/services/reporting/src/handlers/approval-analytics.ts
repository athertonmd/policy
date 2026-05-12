/**
 * Approval Analytics Handler
 *
 * GET /v1/reports/approval-analytics — Provides approval workflow performance
 * metrics including average approval time, SLA compliance, escalation frequency,
 * rejection rate, auto-approval rate, and bottleneck identification.
 *
 * Requirements: 24.1, 24.2, 24.3, 24.4
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { withDatabase, type DatabaseClient } from '../lib/database';

// --- Types ---

interface ApprovalAnalyticsResponse {
  tenant_id: string;
  generated_at: string;
  date_from: string;
  date_to: string;
  metrics: ApprovalMetrics;
  bottlenecks: ApprovalBottlenecks;
  trends: ApprovalTrend[];
  alerts: AnalyticsAlert[];
}

interface ApprovalMetrics {
  total_workflows: number;
  average_approval_time_hours: number;
  median_approval_time_hours: number;
  sla_compliance_rate: number;
  escalation_frequency: number;
  rejection_rate: number;
  auto_approval_rate: number;
  pending_count: number;
}

interface ApprovalBottlenecks {
  highest_queue_depth: ApproverBottleneck[];
  longest_response_time: ApproverBottleneck[];
  most_escalations: ApproverBottleneck[];
}

interface ApproverBottleneck {
  approver_id: string;
  approver_name?: string;
  department?: string;
  metric_value: number;
  metric_label: string;
}

interface ApprovalTrend {
  period: string;
  total_workflows: number;
  average_approval_time_hours: number;
  sla_compliance_rate: number;
  escalation_rate: number;
  rejection_rate: number;
}

interface AnalyticsAlert {
  alert_type: 'sla_breach' | 'high_escalation' | 'high_rejection';
  severity: 'warning' | 'critical';
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

async function queryApprovalMetrics(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ApprovalMetrics> {
  const sql = `
    SELECT
      COUNT(aw.workflow_id) AS total_workflows,
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (aw.completed_at - aw.initiated_at)) / 3600)
        FILTER (WHERE aw.completed_at IS NOT NULL),
        0
      ) AS average_approval_time_hours,
      COALESCE(
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (aw.completed_at - aw.initiated_at)) / 3600
        ) FILTER (WHERE aw.completed_at IS NOT NULL),
        0
      ) AS median_approval_time_hours,
      CASE
        WHEN COUNT(aw.workflow_id) > 0
        THEN (
          COUNT(CASE WHEN aw.completed_at IS NOT NULL AND aw.completed_at <= aw.sla_deadline THEN 1 END)::numeric
          / NULLIF(COUNT(CASE WHEN aw.completed_at IS NOT NULL THEN 1 END), 0)::numeric
        ) * 100
        ELSE 100
      END AS sla_compliance_rate,
      CASE
        WHEN COUNT(aw.workflow_id) > 0
        THEN (COUNT(CASE WHEN aw.status = 'escalated' THEN 1 END)::numeric / COUNT(aw.workflow_id)::numeric) * 100
        ELSE 0
      END AS escalation_frequency,
      CASE
        WHEN COUNT(aw.workflow_id) > 0
        THEN (COUNT(CASE WHEN aw.status = 'rejected' THEN 1 END)::numeric / COUNT(aw.workflow_id)::numeric) * 100
        ELSE 0
      END AS rejection_rate,
      COUNT(CASE WHEN aw.status = 'pending' THEN 1 END) AS pending_count
    FROM ${schema}.approval_workflows aw
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);
  const row = result.rows[0] ?? {};

  // Query auto-approval rate separately from approval_actions
  const autoApprovalSql = `
    SELECT
      COUNT(CASE WHEN aa.source = 'auto' THEN 1 END) AS auto_approvals,
      COUNT(aa.action_id) AS total_actions
    FROM ${schema}.approval_actions aa
    JOIN ${schema}.approval_workflows aw ON aa.workflow_id = aw.workflow_id
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
      AND aa.action = 'approve'
  `;

  const autoResult = await client.query<Record<string, unknown>>(autoApprovalSql, [dateFrom, dateTo]);
  const autoRow = autoResult.rows[0] ?? {};
  const autoApprovals = Number(autoRow.auto_approvals ?? 0);
  const totalApproveActions = Number(autoRow.total_actions ?? 0);
  const autoApprovalRate = totalApproveActions > 0 ? (autoApprovals / totalApproveActions) * 100 : 0;

  return {
    total_workflows: Number(row.total_workflows ?? 0),
    average_approval_time_hours: Number(Number(row.average_approval_time_hours ?? 0).toFixed(2)),
    median_approval_time_hours: Number(Number(row.median_approval_time_hours ?? 0).toFixed(2)),
    sla_compliance_rate: Number(Number(row.sla_compliance_rate ?? 100).toFixed(2)),
    escalation_frequency: Number(Number(row.escalation_frequency ?? 0).toFixed(2)),
    rejection_rate: Number(Number(row.rejection_rate ?? 0).toFixed(2)),
    auto_approval_rate: Number(autoApprovalRate.toFixed(2)),
    pending_count: Number(row.pending_count ?? 0),
  };
}

async function queryBottlenecks(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ApprovalBottlenecks> {
  // Highest queue depth: approvers with most pending items
  const queueDepthSql = `
    SELECT
      aa.approver_id,
      tp.full_name AS approver_name,
      tp.department,
      COUNT(CASE WHEN aw.status = 'pending' THEN 1 END) AS queue_depth
    FROM ${schema}.approval_actions aa
    JOIN ${schema}.approval_workflows aw ON aa.workflow_id = aw.workflow_id
    LEFT JOIN ${schema}.traveller_profiles tp ON aa.approver_id = tp.traveller_id
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
    GROUP BY aa.approver_id, tp.full_name, tp.department
    ORDER BY queue_depth DESC
    LIMIT 5
  `;

  // Longest response time: approvers with highest average response time
  const responseTimeSql = `
    SELECT
      aa.approver_id,
      tp.full_name AS approver_name,
      tp.department,
      AVG(EXTRACT(EPOCH FROM (aa.acted_at - aw.initiated_at)) / 3600) AS avg_response_hours
    FROM ${schema}.approval_actions aa
    JOIN ${schema}.approval_workflows aw ON aa.workflow_id = aw.workflow_id
    LEFT JOIN ${schema}.traveller_profiles tp ON aa.approver_id = tp.traveller_id
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
      AND aa.action IN ('approve', 'reject')
    GROUP BY aa.approver_id, tp.full_name, tp.department
    ORDER BY avg_response_hours DESC
    LIMIT 5
  `;

  // Most escalations per approver
  const escalationsSql = `
    SELECT
      aa.approver_id,
      tp.full_name AS approver_name,
      tp.department,
      COUNT(CASE WHEN aa.action = 'escalate' THEN 1 END) AS escalation_count
    FROM ${schema}.approval_actions aa
    LEFT JOIN ${schema}.traveller_profiles tp ON aa.approver_id = tp.traveller_id
    JOIN ${schema}.approval_workflows aw ON aa.workflow_id = aw.workflow_id
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
    GROUP BY aa.approver_id, tp.full_name, tp.department
    HAVING COUNT(CASE WHEN aa.action = 'escalate' THEN 1 END) > 0
    ORDER BY escalation_count DESC
    LIMIT 5
  `;

  const [queueResult, responseResult, escalationResult] = await Promise.all([
    client.query<Record<string, unknown>>(queueDepthSql, [dateFrom, dateTo]),
    client.query<Record<string, unknown>>(responseTimeSql, [dateFrom, dateTo]),
    client.query<Record<string, unknown>>(escalationsSql, [dateFrom, dateTo]),
  ]);

  return {
    highest_queue_depth: queueResult.rows.map((row) => ({
      approver_id: String(row.approver_id),
      approver_name: row.approver_name ? String(row.approver_name) : undefined,
      department: row.department ? String(row.department) : undefined,
      metric_value: Number(row.queue_depth ?? 0),
      metric_label: 'pending_items',
    })),
    longest_response_time: responseResult.rows.map((row) => ({
      approver_id: String(row.approver_id),
      approver_name: row.approver_name ? String(row.approver_name) : undefined,
      department: row.department ? String(row.department) : undefined,
      metric_value: Number(Number(row.avg_response_hours ?? 0).toFixed(2)),
      metric_label: 'avg_hours',
    })),
    most_escalations: escalationResult.rows.map((row) => ({
      approver_id: String(row.approver_id),
      approver_name: row.approver_name ? String(row.approver_name) : undefined,
      department: row.department ? String(row.department) : undefined,
      metric_value: Number(row.escalation_count ?? 0),
      metric_label: 'escalations',
    })),
  };
}

async function queryTrends(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<ApprovalTrend[]> {
  const sql = `
    SELECT
      to_char(aw.initiated_at, 'YYYY-MM') AS period,
      COUNT(aw.workflow_id) AS total_workflows,
      COALESCE(
        AVG(EXTRACT(EPOCH FROM (aw.completed_at - aw.initiated_at)) / 3600)
        FILTER (WHERE aw.completed_at IS NOT NULL),
        0
      ) AS average_approval_time_hours,
      CASE
        WHEN COUNT(CASE WHEN aw.completed_at IS NOT NULL THEN 1 END) > 0
        THEN (
          COUNT(CASE WHEN aw.completed_at IS NOT NULL AND aw.completed_at <= aw.sla_deadline THEN 1 END)::numeric
          / COUNT(CASE WHEN aw.completed_at IS NOT NULL THEN 1 END)::numeric
        ) * 100
        ELSE 100
      END AS sla_compliance_rate,
      CASE
        WHEN COUNT(aw.workflow_id) > 0
        THEN (COUNT(CASE WHEN aw.status = 'escalated' THEN 1 END)::numeric / COUNT(aw.workflow_id)::numeric) * 100
        ELSE 0
      END AS escalation_rate,
      CASE
        WHEN COUNT(aw.workflow_id) > 0
        THEN (COUNT(CASE WHEN aw.status = 'rejected' THEN 1 END)::numeric / COUNT(aw.workflow_id)::numeric) * 100
        ELSE 0
      END AS rejection_rate
    FROM ${schema}.approval_workflows aw
    WHERE aw.initiated_at >= $1::timestamptz
      AND aw.initiated_at <= $2::timestamptz
    GROUP BY to_char(aw.initiated_at, 'YYYY-MM')
    ORDER BY period ASC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => ({
    period: String(row.period),
    total_workflows: Number(row.total_workflows ?? 0),
    average_approval_time_hours: Number(Number(row.average_approval_time_hours ?? 0).toFixed(2)),
    sla_compliance_rate: Number(Number(row.sla_compliance_rate ?? 100).toFixed(2)),
    escalation_rate: Number(Number(row.escalation_rate ?? 0).toFixed(2)),
    rejection_rate: Number(Number(row.rejection_rate ?? 0).toFixed(2)),
  }));
}

function generateAlerts(
  metrics: ApprovalMetrics,
  slaThreshold: number,
  escalationThreshold: number
): AnalyticsAlert[] {
  const alerts: AnalyticsAlert[] = [];
  const now = new Date().toISOString();

  if (metrics.sla_compliance_rate < slaThreshold) {
    alerts.push({
      alert_type: 'sla_breach',
      severity: metrics.sla_compliance_rate < slaThreshold - 10 ? 'critical' : 'warning',
      message: `SLA compliance rate (${metrics.sla_compliance_rate}%) is below threshold (${slaThreshold}%)`,
      current_value: metrics.sla_compliance_rate,
      threshold: slaThreshold,
      triggered_at: now,
    });
  }

  if (metrics.escalation_frequency > escalationThreshold) {
    alerts.push({
      alert_type: 'high_escalation',
      severity: metrics.escalation_frequency > escalationThreshold * 1.5 ? 'critical' : 'warning',
      message: `Escalation rate (${metrics.escalation_frequency}%) exceeds threshold (${escalationThreshold}%)`,
      current_value: metrics.escalation_frequency,
      threshold: escalationThreshold,
      triggered_at: now,
    });
  }

  if (metrics.rejection_rate > 30) {
    alerts.push({
      alert_type: 'high_rejection',
      severity: metrics.rejection_rate > 50 ? 'critical' : 'warning',
      message: `Rejection rate (${metrics.rejection_rate}%) is unusually high`,
      current_value: metrics.rejection_rate,
      threshold: 30,
      triggered_at: now,
    });
  }

  return alerts;
}

async function publishAlerts(
  alerts: AnalyticsAlert[],
  tenantId: string
): Promise<void> {
  if (alerts.length === 0) return;

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
            correlationId: `alert_${Date.now()}`,
            aggregateId: tenantId,
            aggregateType: 'ApprovalAnalytics',
            payload: alert,
          }),
          EventBusName: EVENT_BUS_NAME,
        })),
      })
    );
  } catch (error) {
    console.error('Failed to publish analytics alerts:', error);
  }
}

// --- Handler ---

/**
 * GET /v1/reports/approval-analytics — Get approval workflow analytics
 */
export async function getApprovalAnalyticsHandler(
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

  // Configurable thresholds (defaults from requirements)
  const slaThreshold = params.sla_threshold ? parseFloat(params.sla_threshold) : 90;
  const escalationThreshold = params.escalation_threshold ? parseFloat(params.escalation_threshold) : 15;

  const report = await withDatabase(async (client) => {
    const [metrics, bottlenecks, trends] = await Promise.all([
      queryApprovalMetrics(client, schema, dateFrom, dateTo),
      queryBottlenecks(client, schema, dateFrom, dateTo),
      queryTrends(client, schema, dateFrom, dateTo),
    ]);

    const alerts = generateAlerts(metrics, slaThreshold, escalationThreshold);

    // Publish critical alerts to EventBridge
    await publishAlerts(alerts, tenantId);

    const response: ApprovalAnalyticsResponse = {
      tenant_id: tenantId,
      generated_at: new Date().toISOString(),
      date_from: dateFrom,
      date_to: dateTo,
      metrics,
      bottlenecks,
      trends,
      alerts,
    };

    return response;
  });

  return jsonResponse(200, { data: report });
}
