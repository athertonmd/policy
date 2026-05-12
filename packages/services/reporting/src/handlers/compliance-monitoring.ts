/**
 * Compliance Monitoring Handler
 *
 * Real-time compliance rate calculation.
 * Policy leakage detection (out-of-channel bookings).
 * Threshold alerting.
 * Policy effectiveness report.
 *
 * Requirements: 28.1, 28.2, 28.3, 28.4, 28.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { withDatabase } from '../lib/database';
import type { DatabaseClient } from '../lib/database';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';

// --- Types ---

export interface ComplianceRate {
  segment: string;
  segmentValue: string;
  totalBookings: number;
  compliantBookings: number;
  nonCompliantBookings: number;
  complianceRate: number;
  trend: 'improving' | 'stable' | 'declining';
  previousPeriodRate: number | null;
  changeSignificant: boolean;
}

export interface PolicyLeakage {
  leakageId: string;
  tenantId: string;
  travellerId: string;
  travellerName: string;
  department: string;
  bookingChannel: string;
  bookingDate: string;
  tripDetails: {
    origin: string;
    destination: string;
    amount: number;
    currency: string;
  };
  detectedAt: string;
  status: 'detected' | 'acknowledged' | 'resolved';
}

export interface ComplianceAlert {
  alertId: string;
  tenantId: string;
  department: string;
  currentRate: number;
  threshold: number;
  triggeredAt: string;
  severity: 'warning' | 'critical';
}

export interface PolicyEffectivenessReport {
  tenantId: string;
  generatedAt: string;
  period: { start: string; end: string };
  summary: {
    totalRules: number;
    activeRules: number;
    totalEvaluations: number;
    overallComplianceRate: number;
    estimatedSavings: number;
    currency: string;
  };
  ruleAnalysis: RuleEffectiveness[];
  recommendations: string[];
}

export interface RuleEffectiveness {
  ruleId: string;
  ruleName: string;
  triggerCount: number;
  overrideCount: number;
  overrideRate: number;
  estimatedSavings: number;
  category: 'most_triggered' | 'least_triggered' | 'most_overridden' | 'never_triggered';
}

export interface ComplianceThresholdConfig {
  tenantId: string;
  department?: string;
  warningThreshold: number;
  criticalThreshold: number;
  alertRecipients: string[];
}

// --- Compliance Rate Calculation ---

/**
 * Calculate real-time compliance rates segmented by various dimensions.
 * Requirement 28.1: Real-time compliance rates by department, traveller, trip type, supplier, channel.
 */
async function calculateComplianceRates(
  db: DatabaseClient,
  tenantId: string,
  segmentBy: string,
  periodStart: string,
  periodEnd: string
): Promise<ComplianceRate[]> {
  const validSegments = ['department', 'traveller', 'trip_type', 'supplier', 'booking_channel'];
  const segment = validSegments.includes(segmentBy) ? segmentBy : 'department';

  // Current period compliance
  const currentSql = `
    SELECT
      ${segment} as "segmentValue",
      COUNT(*) as "totalBookings",
      COUNT(*) FILTER (WHERE is_compliant = true) as "compliantBookings",
      COUNT(*) FILTER (WHERE is_compliant = false) as "nonCompliantBookings"
    FROM "${tenantId}".booking_compliance
    WHERE evaluated_at >= $1 AND evaluated_at < $2
    GROUP BY ${segment}
    ORDER BY COUNT(*) DESC
  `;

  const currentResult = await db.query<{
    segmentValue: string;
    totalBookings: string;
    compliantBookings: string;
    nonCompliantBookings: string;
  }>(currentSql, [periodStart, periodEnd]);

  // Previous period for trend comparison
  const periodDuration = new Date(periodEnd).getTime() - new Date(periodStart).getTime();
  const previousStart = new Date(new Date(periodStart).getTime() - periodDuration).toISOString();

  const previousSql = `
    SELECT
      ${segment} as "segmentValue",
      COUNT(*) as "totalBookings",
      COUNT(*) FILTER (WHERE is_compliant = true) as "compliantBookings"
    FROM "${tenantId}".booking_compliance
    WHERE evaluated_at >= $1 AND evaluated_at < $2
    GROUP BY ${segment}
  `;

  const previousResult = await db.query<{
    segmentValue: string;
    totalBookings: string;
    compliantBookings: string;
  }>(previousSql, [previousStart, periodStart]);

  const previousRates = new Map<string, number>();
  for (const row of previousResult.rows) {
    const total = parseInt(row.totalBookings, 10);
    const compliant = parseInt(row.compliantBookings, 10);
    previousRates.set(row.segmentValue, total > 0 ? (compliant / total) * 100 : 0);
  }

  return currentResult.rows.map((row) => {
    const total = parseInt(row.totalBookings, 10);
    const compliant = parseInt(row.compliantBookings, 10);
    const nonCompliant = parseInt(row.nonCompliantBookings, 10);
    const rate = total > 0 ? (compliant / total) * 100 : 0;
    const previousRate = previousRates.get(row.segmentValue) ?? null;

    // Determine trend with statistical significance (>2% change)
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    let changeSignificant = false;
    if (previousRate !== null) {
      const change = rate - previousRate;
      if (Math.abs(change) > 2) {
        changeSignificant = true;
        trend = change > 0 ? 'improving' : 'declining';
      }
    }

    return {
      segment: segmentBy,
      segmentValue: row.segmentValue,
      totalBookings: total,
      compliantBookings: compliant,
      nonCompliantBookings: nonCompliant,
      complianceRate: Math.round(rate * 100) / 100,
      trend,
      previousPeriodRate: previousRate !== null ? Math.round(previousRate * 100) / 100 : null,
      changeSignificant,
    };
  });
}

// --- Policy Leakage Detection ---

/**
 * Detect out-of-channel bookings (policy leakage).
 * Requirement 28.2: Identify bookings that circumvent policy controls.
 */
async function detectPolicyLeakage(
  db: DatabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<PolicyLeakage[]> {
  const sql = `
    SELECT
      l.leakage_id as "leakageId",
      l.tenant_id as "tenantId",
      l.traveller_id as "travellerId",
      l.traveller_name as "travellerName",
      l.department,
      l.booking_channel as "bookingChannel",
      l.booking_date as "bookingDate",
      l.origin,
      l.destination,
      l.amount,
      l.currency,
      l.detected_at as "detectedAt",
      l.status
    FROM "${tenantId}".policy_leakage l
    WHERE l.detected_at >= $1 AND l.detected_at < $2
    ORDER BY l.detected_at DESC
    LIMIT 100
  `;

  const result = await db.query<{
    leakageId: string;
    tenantId: string;
    travellerId: string;
    travellerName: string;
    department: string;
    bookingChannel: string;
    bookingDate: string;
    origin: string;
    destination: string;
    amount: string;
    currency: string;
    detectedAt: string;
    status: string;
  }>(sql, [periodStart, periodEnd]);

  return result.rows.map((row) => ({
    leakageId: row.leakageId,
    tenantId: row.tenantId,
    travellerId: row.travellerId,
    travellerName: row.travellerName,
    department: row.department,
    bookingChannel: row.bookingChannel,
    bookingDate: row.bookingDate,
    tripDetails: {
      origin: row.origin,
      destination: row.destination,
      amount: parseFloat(row.amount),
      currency: row.currency,
    },
    detectedAt: row.detectedAt,
    status: row.status as PolicyLeakage['status'],
  }));
}

// --- Threshold Alerting ---

/**
 * Check compliance thresholds and generate alerts.
 * Requirement 28.3: Alert when department compliance falls below threshold.
 */
async function checkComplianceThresholds(
  db: DatabaseClient,
  tenantId: string,
  rates: ComplianceRate[]
): Promise<ComplianceAlert[]> {
  // Get threshold configurations for this tenant
  const configSql = `
    SELECT
      department,
      warning_threshold as "warningThreshold",
      critical_threshold as "criticalThreshold",
      alert_recipients as "alertRecipients"
    FROM "${tenantId}".compliance_thresholds
    WHERE tenant_id = $1 AND enabled = true
  `;

  const configResult = await db.query<{
    department: string | null;
    warningThreshold: string;
    criticalThreshold: string;
    alertRecipients: string;
  }>(configSql, [tenantId]);

  const alerts: ComplianceAlert[] = [];

  for (const config of configResult.rows) {
    const warningThreshold = parseFloat(config.warningThreshold);
    const criticalThreshold = parseFloat(config.criticalThreshold);

    // Find matching rates
    const matchingRates = config.department
      ? rates.filter((r) => r.segmentValue === config.department)
      : rates;

    for (const rate of matchingRates) {
      if (rate.complianceRate < criticalThreshold) {
        const alert: ComplianceAlert = {
          alertId: `alert-${tenantId}-${rate.segmentValue}-${Date.now()}`,
          tenantId,
          department: rate.segmentValue,
          currentRate: rate.complianceRate,
          threshold: criticalThreshold,
          triggeredAt: new Date().toISOString(),
          severity: 'critical',
        };
        alerts.push(alert);
      } else if (rate.complianceRate < warningThreshold) {
        const alert: ComplianceAlert = {
          alertId: `alert-${tenantId}-${rate.segmentValue}-${Date.now()}`,
          tenantId,
          department: rate.segmentValue,
          currentRate: rate.complianceRate,
          threshold: warningThreshold,
          triggeredAt: new Date().toISOString(),
          severity: 'warning',
        };
        alerts.push(alert);
      }
    }
  }

  // Publish alerts to EventBridge
  if (alerts.length > 0) {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: alerts.map((alert) => ({
          Source: 'travel-policy-platform.compliance',
          DetailType: 'ComplianceThresholdBreach',
          Detail: JSON.stringify(alert),
          EventBusName: EVENT_BUS_NAME,
        })),
      })
    );
  }

  return alerts;
}

// --- Policy Effectiveness Report ---

/**
 * Generate policy effectiveness report.
 * Requirement 28.5: Rules triggered most/least, override frequency, estimated savings.
 */
async function generateEffectivenessReport(
  db: DatabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string
): Promise<PolicyEffectivenessReport> {
  // Get rule trigger statistics
  const ruleStatsSql = `
    SELECT
      r.rule_id as "ruleId",
      r.rule_name as "ruleName",
      COALESCE(e.trigger_count, 0) as "triggerCount",
      COALESCE(e.override_count, 0) as "overrideCount",
      COALESCE(e.estimated_savings, 0) as "estimatedSavings"
    FROM "${tenantId}".policy_rules r
    LEFT JOIN (
      SELECT
        rule_id,
        COUNT(*) as trigger_count,
        COUNT(*) FILTER (WHERE was_overridden = true) as override_count,
        SUM(savings_amount) as estimated_savings
      FROM "${tenantId}".policy_evaluations
      WHERE evaluated_at >= $1 AND evaluated_at < $2
      GROUP BY rule_id
    ) e ON e.rule_id = r.rule_id
    WHERE r.is_active = true
    ORDER BY COALESCE(e.trigger_count, 0) DESC
  `;

  const ruleStats = await db.query<{
    ruleId: string;
    ruleName: string;
    triggerCount: string;
    overrideCount: string;
    estimatedSavings: string;
  }>(ruleStatsSql, [periodStart, periodEnd]);

  // Summary statistics
  const summarySql = `
    SELECT
      COUNT(DISTINCT rule_id) as "activeRules",
      COUNT(*) as "totalEvaluations",
      COUNT(*) FILTER (WHERE is_compliant = true)::float / NULLIF(COUNT(*), 0) * 100 as "overallComplianceRate",
      COALESCE(SUM(savings_amount), 0) as "estimatedSavings"
    FROM "${tenantId}".policy_evaluations
    WHERE evaluated_at >= $1 AND evaluated_at < $2
  `;

  const summaryResult = await db.query<{
    activeRules: string;
    totalEvaluations: string;
    overallComplianceRate: string;
    estimatedSavings: string;
  }>(summarySql, [periodStart, periodEnd]);

  const summary = summaryResult.rows[0];

  // Categorise rules
  const ruleAnalysis: RuleEffectiveness[] = ruleStats.rows.map((row) => {
    const triggerCount = parseInt(row.triggerCount, 10);
    const overrideCount = parseInt(row.overrideCount, 10);

    let category: RuleEffectiveness['category'] = 'least_triggered';
    if (triggerCount === 0) {
      category = 'never_triggered';
    } else if (overrideCount / Math.max(triggerCount, 1) > 0.3) {
      category = 'most_overridden';
    } else if (triggerCount > 50) {
      category = 'most_triggered';
    }

    return {
      ruleId: row.ruleId,
      ruleName: row.ruleName,
      triggerCount,
      overrideCount,
      overrideRate: triggerCount > 0 ? Math.round((overrideCount / triggerCount) * 100) / 100 : 0,
      estimatedSavings: parseFloat(row.estimatedSavings),
      category,
    };
  });

  // Generate recommendations
  const recommendations: string[] = [];
  const neverTriggered = ruleAnalysis.filter((r) => r.category === 'never_triggered');
  if (neverTriggered.length > 0) {
    recommendations.push(
      `${neverTriggered.length} rules have never been triggered. Consider reviewing or removing them.`
    );
  }

  const highOverride = ruleAnalysis.filter((r) => r.overrideRate > 0.5);
  if (highOverride.length > 0) {
    recommendations.push(
      `${highOverride.length} rules have override rates above 50%. Consider relaxing these rules or investigating root causes.`
    );
  }

  const totalRulesCount = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM "${tenantId}".policy_rules`
  );

  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    period: { start: periodStart, end: periodEnd },
    summary: {
      totalRules: parseInt(totalRulesCount.rows[0]?.count ?? '0', 10),
      activeRules: parseInt(summary?.activeRules ?? '0', 10),
      totalEvaluations: parseInt(summary?.totalEvaluations ?? '0', 10),
      overallComplianceRate: Math.round(parseFloat(summary?.overallComplianceRate ?? '0') * 100) / 100,
      estimatedSavings: parseFloat(summary?.estimatedSavings ?? '0'),
      currency: 'GBP',
    },
    ruleAnalysis,
    recommendations,
  };
}

// --- Lambda Handlers ---

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Content-Type': 'application/json',
};

function extractTenantId(event: APIGatewayProxyEvent): string | null {
  return event.headers?.['x-tenant-id'] ?? event.headers?.['X-Tenant-Id'] ?? null;
}

/**
 * GET /v1/compliance/rates — Real-time compliance rates.
 */
export async function complianceRatesHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 'MISSING_TENANT', message: 'Tenant ID is required', requestId }),
      };
    }

    const params = event.queryStringParameters ?? {};
    const segmentBy = params.segmentBy ?? 'department';
    const periodStart = params.periodStart ?? new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const periodEnd = params.periodEnd ?? new Date().toISOString();

    const result = await withDatabase(async (db) => {
      const rates = await calculateComplianceRates(db, tenantId, segmentBy, periodStart, periodEnd);
      const alerts = await checkComplianceThresholds(db, tenantId, rates);

      return { rates, alerts, period: { start: periodStart, end: periodEnd } };
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ data: result, metadata: { requestId, timestamp: new Date().toISOString() } }),
    };
  } catch (error) {
    console.error('Compliance rates query failed:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        code: 'COMPLIANCE_QUERY_FAILED',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        requestId,
      }),
    };
  }
}

/**
 * GET /v1/compliance/leakage — Policy leakage detection.
 */
export async function leakageDetectionHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 'MISSING_TENANT', message: 'Tenant ID is required', requestId }),
      };
    }

    const params = event.queryStringParameters ?? {};
    const periodStart = params.periodStart ?? new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    const periodEnd = params.periodEnd ?? new Date().toISOString();

    const result = await withDatabase(async (db) => {
      return detectPolicyLeakage(db, tenantId, periodStart, periodEnd);
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ data: { leakages: result, count: result.length }, metadata: { requestId, timestamp: new Date().toISOString() } }),
    };
  } catch (error) {
    console.error('Leakage detection failed:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        code: 'LEAKAGE_DETECTION_FAILED',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        requestId,
      }),
    };
  }
}

/**
 * GET /v1/compliance/effectiveness — Policy effectiveness report.
 */
export async function effectivenessReportHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ code: 'MISSING_TENANT', message: 'Tenant ID is required', requestId }),
      };
    }

    const params = event.queryStringParameters ?? {};
    const periodStart = params.periodStart ?? new Date(Date.now() - 90 * 24 * 3600_000).toISOString();
    const periodEnd = params.periodEnd ?? new Date().toISOString();

    const result = await withDatabase(async (db) => {
      return generateEffectivenessReport(db, tenantId, periodStart, periodEnd);
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ data: result, metadata: { requestId, timestamp: new Date().toISOString() } }),
    };
  } catch (error) {
    console.error('Effectiveness report generation failed:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        code: 'EFFECTIVENESS_REPORT_FAILED',
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        requestId,
      }),
    };
  }
}
