/**
 * Carbon Reporting Handler
 *
 * POST /v1/reports/carbon — Generate carbon emission reports with emission factor
 * calculations per transport mode, distance, and cabin class.
 *
 * Aggregates by department, trip type, transport mode, route, time period.
 * Compares against tenant-configured carbon budgets and targets.
 * Tracks carbon offset purchases.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';

// --- Types ---

interface CarbonReportRequest {
  date_from: string;
  date_to: string;
  group_by: CarbonGroupBy[];
  filters?: CarbonFilters;
  include_offsets?: boolean;
  include_targets?: boolean;
}

type CarbonGroupBy =
  | 'department'
  | 'trip_type'
  | 'transport_mode'
  | 'route'
  | 'time_period';

interface CarbonFilters {
  departments?: string[];
  trip_types?: string[];
  transport_modes?: string[];
}

interface CarbonAggregation {
  group_key: string;
  group_value: string;
  total_emissions_kg: number;
  trip_count: number;
  average_emissions_per_trip_kg: number;
  distance_km: number;
  emissions_per_km: number;
}

interface CarbonTarget {
  target_type: string;
  target_value_kg: number;
  actual_value_kg: number;
  variance_kg: number;
  variance_percent: number;
  on_track: boolean;
}

interface CarbonOffset {
  offset_id: string;
  amount_kg: number;
  purchase_date: string;
  provider: string;
  cost: number;
  currency: string;
}

interface CarbonReportResponse {
  report_id: string;
  tenant_id: string;
  generated_at: string;
  date_from: string;
  date_to: string;
  summary: {
    total_emissions_kg: number;
    total_trips: number;
    average_emissions_per_trip_kg: number;
    total_distance_km: number;
    total_offsets_kg: number;
    net_emissions_kg: number;
  };
  aggregations: CarbonAggregation[];
  targets?: CarbonTarget[];
  offsets?: CarbonOffset[];
}

// --- Emission Factors (kg CO2 per passenger-km) ---

const EMISSION_FACTORS: Record<string, Record<string, number>> = {
  air: {
    economy: 0.255,
    premium_economy: 0.340,
    business: 0.510,
    first: 0.765,
    default: 0.255,
  },
  rail: {
    standard: 0.041,
    first: 0.061,
    default: 0.041,
  },
  car: {
    standard: 0.171,
    electric: 0.053,
    hybrid: 0.120,
    default: 0.171,
  },
  hotel: {
    standard: 20.6, // per night, not per km
    default: 20.6,
  },
};

// --- Helpers ---

const VALID_GROUP_BY: CarbonGroupBy[] = [
  'department',
  'trip_type',
  'transport_mode',
  'route',
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
  return `crpt_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Calculate carbon emissions for a trip based on transport mode, distance, and cabin class.
 */
export function calculateEmissions(
  transportMode: string,
  distanceKm: number,
  cabinClass?: string
): number {
  const modeFactors = EMISSION_FACTORS[transportMode.toLowerCase()] ?? EMISSION_FACTORS.air;
  const factor = cabinClass
    ? (modeFactors[cabinClass.toLowerCase()] ?? modeFactors.default)
    : modeFactors.default;

  // Hotel emissions are per-night, not per-km
  if (transportMode.toLowerCase() === 'hotel') {
    return factor * distanceKm; // distanceKm is used as nights for hotel
  }

  return factor * distanceKm;
}

// --- SQL Query Builders ---

function buildCarbonGroupByColumn(groupBy: CarbonGroupBy): string {
  switch (groupBy) {
    case 'department':
      return 'tp.department';
    case 'trip_type':
      return "pd.request_payload->'trip'->>'tripType'";
    case 'transport_mode':
      return "pd.request_payload->'offers'->0->>'productType'";
    case 'route':
      return "CONCAT(pd.request_payload->'trip'->'origin'->>'city', ' → ', pd.request_payload->'trip'->'destination'->>'city')";
    case 'time_period':
      return "to_char(pd.evaluated_at, 'YYYY-MM')";
    default:
      return 'tp.department';
  }
}

async function queryCarbonAggregations(
  client: DatabaseClient,
  schema: string,
  request: CarbonReportRequest
): Promise<CarbonAggregation[]> {
  const groupByColumns = request.group_by.map(buildCarbonGroupByColumn);
  const groupByLabels = request.group_by;

  const params: unknown[] = [request.date_from, request.date_to];
  let paramIndex = 3;

  let filterClauses = '';

  if (request.filters?.departments?.length) {
    filterClauses += ` AND tp.department = ANY($${paramIndex})`;
    params.push(request.filters.departments);
    paramIndex++;
  }
  if (request.filters?.trip_types?.length) {
    filterClauses += ` AND pd.request_payload->'trip'->>'tripType' = ANY($${paramIndex})`;
    params.push(request.filters.trip_types);
    paramIndex++;
  }
  if (request.filters?.transport_modes?.length) {
    filterClauses += ` AND pd.request_payload->'offers'->0->>'productType' = ANY($${paramIndex})`;
    params.push(request.filters.transport_modes);
    paramIndex++;
  }

  const selectCols = groupByColumns
    .map((col, i) => `${col} AS group_value_${i}`)
    .join(', ');

  const groupByCols = groupByColumns.join(', ');

  const sql = `
    SELECT
      ${selectCols},
      COALESCE(SUM((pd.carbon_impact->>'totalEmissionsKg')::numeric), 0) AS total_emissions_kg,
      COUNT(pd.decision_id) AS trip_count,
      COALESCE(AVG((pd.carbon_impact->>'totalEmissionsKg')::numeric), 0) AS average_emissions_per_trip_kg,
      COALESCE(SUM((pd.carbon_impact->>'distanceKm')::numeric), 0) AS distance_km
    FROM ${schema}.policy_decisions pd
    LEFT JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
      AND pd.carbon_impact IS NOT NULL
      ${filterClauses}
    GROUP BY ${groupByCols}
    ORDER BY total_emissions_kg DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, params);

  return result.rows.map((row) => {
    const totalEmissions = Number(row.total_emissions_kg ?? 0);
    const distanceKm = Number(row.distance_km ?? 0);

    return {
      group_key: groupByLabels[0],
      group_value: String(row.group_value_0 ?? 'unknown'),
      total_emissions_kg: Number(totalEmissions.toFixed(2)),
      trip_count: Number(row.trip_count),
      average_emissions_per_trip_kg: Number(Number(row.average_emissions_per_trip_kg ?? 0).toFixed(2)),
      distance_km: Number(distanceKm.toFixed(2)),
      emissions_per_km: distanceKm > 0 ? Number((totalEmissions / distanceKm).toFixed(4)) : 0,
    };
  });
}

async function queryCarbonSummary(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  total_emissions_kg: number;
  total_trips: number;
  average_emissions_per_trip_kg: number;
  total_distance_km: number;
}> {
  const sql = `
    SELECT
      COALESCE(SUM((pd.carbon_impact->>'totalEmissionsKg')::numeric), 0) AS total_emissions_kg,
      COUNT(pd.decision_id) AS total_trips,
      COALESCE(AVG((pd.carbon_impact->>'totalEmissionsKg')::numeric), 0) AS average_emissions_per_trip_kg,
      COALESCE(SUM((pd.carbon_impact->>'distanceKm')::numeric), 0) AS total_distance_km
    FROM ${schema}.policy_decisions pd
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
      AND pd.carbon_impact IS NOT NULL
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);
  const row = result.rows[0] ?? {};

  return {
    total_emissions_kg: Number(Number(row.total_emissions_kg ?? 0).toFixed(2)),
    total_trips: Number(row.total_trips ?? 0),
    average_emissions_per_trip_kg: Number(Number(row.average_emissions_per_trip_kg ?? 0).toFixed(2)),
    total_distance_km: Number(Number(row.total_distance_km ?? 0).toFixed(2)),
  };
}

async function queryCarbonTargets(
  client: DatabaseClient,
  schema: string,
  totalEmissions: number
): Promise<CarbonTarget[]> {
  // Carbon targets are stored in tenant config (budgets table with scope_type = 'carbon')
  // or in a dedicated config. We query from tenant config JSONB.
  const sql = `
    SELECT
      scope_value AS target_type,
      amount AS target_value_kg,
      current_utilisation AS actual_value_kg
    FROM ${schema}.budgets
    WHERE scope_type = 'tenant'
      AND name ILIKE '%carbon%'
      AND is_active = true
  `;

  const result = await client.query<Record<string, unknown>>(sql, []);

  if (result.rows.length === 0) {
    // Return a default target comparison using total emissions
    return [{
      target_type: 'annual',
      target_value_kg: 0,
      actual_value_kg: totalEmissions,
      variance_kg: totalEmissions,
      variance_percent: 0,
      on_track: true,
    }];
  }

  return result.rows.map((row) => {
    const targetValue = Number(row.target_value_kg ?? 0);
    const actualValue = Number(row.actual_value_kg ?? totalEmissions);
    const variance = actualValue - targetValue;
    const variancePercent = targetValue > 0 ? (variance / targetValue) * 100 : 0;

    return {
      target_type: String(row.target_type ?? 'annual'),
      target_value_kg: targetValue,
      actual_value_kg: actualValue,
      variance_kg: Number(variance.toFixed(2)),
      variance_percent: Number(variancePercent.toFixed(2)),
      on_track: actualValue <= targetValue,
    };
  });
}

async function queryCarbonOffsets(
  client: DatabaseClient,
  schema: string,
  dateFrom: string,
  dateTo: string
): Promise<CarbonOffset[]> {
  // Carbon offsets are tracked in a dedicated table or as part of policy decisions metadata
  // For now, we query from policy_decisions where carbon_impact includes offset data
  const sql = `
    SELECT
      pd.decision_id AS offset_id,
      (pd.carbon_impact->>'offsetKg')::numeric AS amount_kg,
      pd.evaluated_at AS purchase_date,
      COALESCE(pd.carbon_impact->>'offsetProvider', 'unknown') AS provider,
      COALESCE((pd.carbon_impact->>'offsetCost')::numeric, 0) AS cost,
      COALESCE(pd.carbon_impact->>'offsetCurrency', 'GBP') AS currency
    FROM ${schema}.policy_decisions pd
    WHERE pd.evaluated_at >= $1::timestamptz
      AND pd.evaluated_at <= $2::timestamptz
      AND pd.carbon_impact->>'offsetKg' IS NOT NULL
      AND (pd.carbon_impact->>'offsetKg')::numeric > 0
    ORDER BY pd.evaluated_at DESC
  `;

  const result = await client.query<Record<string, unknown>>(sql, [dateFrom, dateTo]);

  return result.rows.map((row) => ({
    offset_id: String(row.offset_id),
    amount_kg: Number(row.amount_kg ?? 0),
    purchase_date: String(row.purchase_date),
    provider: String(row.provider),
    cost: Number(row.cost ?? 0),
    currency: String(row.currency ?? 'GBP'),
  }));
}

// --- Handler ---

/**
 * POST /v1/reports/carbon — Generate carbon emissions report
 */
export async function generateCarbonReportHandler(
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

  let body: CarbonReportRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as CarbonReportRequest;
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

  const report = await withDatabase(async (client) => {
    const [summary, aggregations] = await Promise.all([
      queryCarbonSummary(client, schema, body.date_from, body.date_to),
      queryCarbonAggregations(client, schema, body),
    ]);

    let targets: CarbonTarget[] | undefined;
    if (body.include_targets) {
      targets = await queryCarbonTargets(client, schema, summary.total_emissions_kg);
    }

    let offsets: CarbonOffset[] | undefined;
    let totalOffsetsKg = 0;
    if (body.include_offsets) {
      offsets = await queryCarbonOffsets(client, schema, body.date_from, body.date_to);
      totalOffsetsKg = offsets.reduce((sum, o) => sum + o.amount_kg, 0);
    }

    const response: CarbonReportResponse = {
      report_id: generateReportId(),
      tenant_id: tenantId,
      generated_at: new Date().toISOString(),
      date_from: body.date_from,
      date_to: body.date_to,
      summary: {
        ...summary,
        total_offsets_kg: Number(totalOffsetsKg.toFixed(2)),
        net_emissions_kg: Number((summary.total_emissions_kg - totalOffsetsKg).toFixed(2)),
      },
      aggregations,
      targets,
      offsets,
    };

    return response;
  });

  return jsonResponse(200, { data: report });
}
