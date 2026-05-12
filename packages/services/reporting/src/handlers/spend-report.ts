/**
 * Financial Spend Reporting Handler
 *
 * POST /v1/reports/spend — Generate spend reports with aggregation by tenant,
 * department, cost centre, supplier, trip type, cabin class, region, time period.
 *
 * Calculates: total spend, average trip cost, compliance rate, savings,
 * budget variance. Supports cost allocation rules for multi-cost-centre trips.
 * Generates reports within 60-second SLA for 12-month datasets.
 *
 * Requirements: 12.1, 12.2, 12.4, 12.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';

// --- Types ---

interface SpendReportRequest {
  date_from: string;
  date_to: string;
  group_by: SpendGroupBy[];
  filters?: SpendFilters;
  cost_allocation?: CostAllocationConfig;
  include_budget_variance?: boolean;
}

type SpendGroupBy =
  | 'department'
  | 'cost_centre'
  | 'supplier'
  | 'trip_type'
  | 'cabin_class'
  | 'region'
  | 'time_period';

interface SpendFilters {
  departments?: string[];
  cost_centres?: string[];
  suppliers?: string[];
  trip_types?: string[];
  cabin_classes?: string[];
  regions?: string[];
}

interface CostAllocationConfig {
  enabled: boolean;
  rules: CostAllocationRule[];
}

interface CostAllocationRule {
  cost_centre: string;
  percentage: number;
}

interface SpendAggregation {
  group_key: string;
  group_value: string;
  total_spend: number;
  trip_count: number;
  average_trip_cost: number;
  compliance_rate: number;
  savings: number;
  budget_variance?: number;
}

interface SpendReportResponse {
  report_id: string;
  tenant_id: string;
  generated_at: string;
  date_from: string;
  date_to: string;
  summary: {
    total_spend: number;
    total_trips: number;
    average_trip_cost: number;
    overall_compliance_rate: number;
    total_savings: number;
    currency: string;
  };
  aggregations: SpendAggregation[];
  cost_allocations?: CostAllocationResult[];
}

interface CostAllocationResult {
  trip_id: string;
  total_cost: number;
  allocations: Array<{
    cost_centre: string;
    amount: number;
    percentage: number;
  }>;
}

// --- Helpers ---

const VALID_GROUP_BY: SpendGroupBy[] = [
  'department',
  'cost_centre',
  'supplier',
  'trip_type',
  'cabin_class',
  'region',
  'time_period',
];

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

function generateReportId(): string {
  return `rpt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

// --- SQL Query Builders ---

function buildGroupByColumn(groupBy: SpendGroupBy): string {
  switch (groupBy) {
    case 'department':
      return 'tp.department';
    case 'cost_centre':
      return 'tp.cost_centre';
    case 'supplier':
      return "pd.request_payload->>'supplier'";
    case 'trip_type':
      return "pd.request_payload->'trip'->>'tripType'";
    case 'cabin_class':
      return "pd.request_payload->'offers'->0->>'cabinClass'";
    case 'region':
      return 'tp.region';
    case 'time_period':
      return "to_char(pd.evaluated_at, 'YYYY-MM')";
    default:
      return 'tp.department';
  }
}

async function querySpendAggregations(
  client: DatabaseClient,
  schema: string,
  request: SpendReportRequest
): Promise<SpendAggregation[]> {
  const groupByColumns = request.group_by.map(buildGroupByColumn);
  const groupByLabels = request.group_by;

  const params: unknown[] = [request.date_from, request.date_to];
  let paramIndex = 3;

  let filterClauses = '';

  if (request.filters?.departments?.length) {
    filterClauses += ` AND tp.department = ANY($${paramIndex})`;
    params.push(request.filters.departments);
    paramIndex++;
  }
  if (request.filters?.cost_centres?.length) {
    filterClauses += ` AND tp.cost_centre = ANY($${paramIndex})`;
    params.push(request.filters.cost_centres);
    paramIndex++;
  }
  if (request.filters?.suppliers?.length) {
    filterClauses += ` AND pd.request_payload->>'supplier' = ANY($${paramIndex})`;
    params.push(request.filters.suppliers);
    paramIndex++;
  }
  if (request.filters?.trip_types?.length) {
    filterClauses += ` AND pd.request_payload->'trip'->>'tripType' = ANY($${paramIndex})`;
    params.push(request.filters.trip_types);
    paramIndex++;
  }
  if (request.filters?.regions?.length) {
    filterClauses += ` AND tp.region = ANY($${paramIndex})`;
    params.push(request.filters.regions);
    paramIndex++;
  }

  const selectCols = groupByColumns
    .map((col, i) => `${col} AS group_value_${i}`)
    .join(', ');

  const groupByCols = groupByColumns.join(', ');

  const sql = `
    SELECT
      ${selectCols},
      COALESCE(SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric), 0) AS total_spend,
      COUNT(pd.decision_id) AS trip_count,
      COALESCE(AVG((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric), 0) AS average_trip_cost,
      CASE
        WHEN COUNT(pd.decision_id) > 0
        THEN (COUNT(CASE WHEN pd.result = 'approve' THEN 1 END)::numeric / COUNT(pd.decision_id)::numeric) * 100
        ELSE 0
      END AS compliance_rate,
      COALESCE(SUM(
        CASE WHEN pd.alternatives::text != '[]' AND pd.result = 'approve'
        THEN GREATEST(
          (pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric -
          COALESCE((pd.alternatives->0->>'suggestedPrice')::numeric, (pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric),
          0
        )
        ELSE 0 END
      ), 0) AS savings
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
      ${filterClauses}
    GROUP BY ${groupByCols}
    ORDER BY total_spend DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, params);

  return result.rows.map((row) => ({
    group_key: groupByLabels[0],
    group_value: String(row.group_value_0 ?? 'unknown'),
    total_spend: Number(row.total_spend),
    trip_count: Number(row.trip_count),
    average_trip_cost: Number(Number(row.average_trip_cost).toFixed(2)),
    compliance_rate: Number(Number(row.compliance_rate).toFixed(2)),
    savings: Number(Number(row.savings).toFixed(2)),
  }));
}

async function querySummary(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  total_spend: number;
  total_trips: number;
  average_trip_cost: number;
  overall_compliance_rate: number;
  total_savings: number;
}> {
  const sql = `
    SELECT
      COALESCE(SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric), 0) AS total_spend,
      COUNT(pd.decision_id) AS total_trips,
      COALESCE(AVG((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric), 0) AS average_trip_cost,
      CASE
        WHEN COUNT(pd.decision_id) > 0
        THEN (COUNT(CASE WHEN pd.result = 'approve' THEN 1 END)::numeric / COUNT(pd.decision_id)::numeric) * 100
        ELSE 0
      END AS overall_compliance_rate,
      COALESCE(SUM(
        CASE WHEN pd.alternatives::text != '[]' AND pd.result = 'approve'
        THEN GREATEST(
          (pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric -
          COALESCE((pd.alternatives->0->>'suggestedPrice')::numeric, (pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric),
          0
        )
        ELSE 0 END
      ), 0) AS total_savings
    FROM ${schema}.policy_decisions pd
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);
  const row = result.rows[0] ?? {};

  return {
    total_spend: Number(row.total_spend ?? 0),
    total_trips: Number(row.total_trips ?? 0),
    average_trip_cost: Number(Number(row.average_trip_cost ?? 0).toFixed(2)),
    overall_compliance_rate: Number(Number(row.overall_compliance_rate ?? 0).toFixed(2)),
    total_savings: Number(Number(row.total_savings ?? 0).toFixed(2)),
  };
}

async function queryBudgetVariance(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string,
  aggregations: SpendAggregation[]
): Promise<SpendAggregation[]> {
  const sql = `
    SELECT
      scope_type,
      scope_value,
      amount AS budget_amount,
      current_utilisation
    FROM ${schema}.budgets
    WHERE period_start <= $2::date
      AND period_end >= $1::date
      AND is_active = true
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  const budgetMap = new Map<string, { amount: number; utilisation: number }>();
  for (const row of result.rows) {
    const key = `${row.scope_type}:${row.scope_value}`;
    budgetMap.set(key, {
      amount: Number(row.budget_amount),
      utilisation: Number(row.current_utilisation),
    });
  }

  return aggregations.map((agg) => {
    const budgetKey = `${agg.group_key}:${agg.group_value}`;
    const budget = budgetMap.get(budgetKey);
    if (budget && budget.amount > 0) {
      return {
        ...agg,
        budget_variance: Number((agg.total_spend - budget.amount).toFixed(2)),
      };
    }
    return agg;
  });
}

async function queryCostAllocations(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string,
  rules: CostAllocationRule[]
): Promise<CostAllocationResult[]> {
  // Find trips that span multiple cost centres (multi-leg or shared trips)
  const sql = `
    SELECT
      pd.decision_id AS trip_id,
      (pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric AS total_cost
    FROM ${schema}.policy_decisions pd
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
      AND pd.result = 'approve'
    ORDER BY pd.evaluated_at DESC
    LIMIT 100
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => {
    const totalCost = Number(row.total_cost ?? 0);
    const allocations = rules.map((rule) => ({
      cost_centre: rule.cost_centre,
      amount: Number((totalCost * (rule.percentage / 100)).toFixed(2)),
      percentage: rule.percentage,
    }));

    return {
      trip_id: String(row.trip_id),
      total_cost: totalCost,
      allocations,
    };
  });
}

// --- Handler ---

/**
 * POST /v1/reports/spend — Generate financial spend report
 */
export async function generateSpendReportHandler(
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

  let body: SpendReportRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as SpendReportRequest;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  // Validate required fields
  if (!body.date_from || typeof body.date_from !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'date_from is required (ISO 8601 format)');
  }
  if (!body.date_to || typeof body.date_to !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'date_to is required (ISO 8601 format)');
  }
  if (!body.group_by || !Array.isArray(body.group_by) || body.group_by.length === 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'group_by must be a non-empty array');
  }

  const invalidGroupBy = body.group_by.filter((g) => !VALID_GROUP_BY.includes(g));
  if (invalidGroupBy.length > 0) {
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `Invalid group_by values: ${invalidGroupBy.join(', ')}. Valid values: ${VALID_GROUP_BY.join(', ')}`
    );
  }

  // Validate cost allocation rules sum to 100%
  if (body.cost_allocation?.enabled && body.cost_allocation.rules.length > 0) {
    const totalPercentage = body.cost_allocation.rules.reduce((sum, r) => sum + r.percentage, 0);
    if (Math.abs(totalPercentage - 100) > 0.01) {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        `Cost allocation percentages must sum to 100%, got ${totalPercentage}%`
      );
    }
  }

  const report = await withDatabase(async (client) => {
    const [summary, aggregations] = await Promise.all([
      querySummary(client, schema, body.date_from, body.date_to),
      querySpendAggregations(client, schema, body),
    ]);

    let finalAggregations = aggregations;
    if (body.include_budget_variance) {
      finalAggregations = await queryBudgetVariance(
        client,
        schema,
        body.date_from,
        body.date_to,
        aggregations
      );
    }

    let costAllocations: CostAllocationResult[] | undefined;
    if (body.cost_allocation?.enabled && body.cost_allocation.rules.length > 0) {
      costAllocations = await queryCostAllocations(
        client,
        schema,
        body.date_from,
        body.date_to,
        body.cost_allocation.rules
      );
    }

    const response: SpendReportResponse = {
      report_id: generateReportId(),
      tenant_id: tenantId,
      generated_at: new Date().toISOString(),
      date_from: body.date_from,
      date_to: body.date_to,
      summary: {
        ...summary,
        currency: 'GBP',
      },
      aggregations: finalAggregations,
      cost_allocations: costAllocations,
    };

    return response;
  });

  return jsonResponse(200, { data: report });
}
