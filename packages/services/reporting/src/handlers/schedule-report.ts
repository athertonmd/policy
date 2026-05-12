/**
 * Scheduled Report Generation Handler
 *
 * POST /v1/reports/schedule — Configure scheduled report generation with
 * cron-based scheduling, email distribution, and export in JSON/CSV formats.
 *
 * Requirements: 12.6, 24.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';

// --- Types ---

interface ScheduleReportRequest {
  name: string;
  report_type: ReportType;
  schedule: CronSchedule;
  recipients: string[];
  export_format: ExportFormat;
  report_config: ReportConfig;
}

type ReportType = 'spend' | 'carbon' | 'approval_analytics' | 'compliance';
type ExportFormat = 'json' | 'csv';

interface CronSchedule {
  expression: string;
  timezone?: string;
}

interface ReportConfig {
  date_range_days?: number;
  group_by?: string[];
  filters?: Record<string, unknown>;
  include_targets?: boolean;
  include_budget_variance?: boolean;
}

interface ReportScheduleRecord {
  schedule_id: string;
  tenant_id: string;
  name: string;
  report_type: ReportType;
  schedule: CronSchedule;
  recipients: string[];
  export_format: ExportFormat;
  report_config: ReportConfig;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ScheduleReportResponse {
  data: ReportScheduleRecord;
}

// --- Helpers ---

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

const VALID_REPORT_TYPES: ReportType[] = ['spend', 'carbon', 'approval_analytics', 'compliance'];
const VALID_EXPORT_FORMATS: ExportFormat[] = ['json', 'csv'];

/**
 * Validates a cron expression (basic validation).
 * Supports standard 5-field cron: minute hour day-of-month month day-of-week
 * Also supports AWS EventBridge rate expressions: rate(1 day), rate(7 days)
 */
function isValidCronExpression(expression: string): boolean {
  // AWS EventBridge rate expression
  if (/^rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)$/.test(expression)) {
    return true;
  }

  // Standard cron expression (5 or 6 fields)
  const parts = expression.trim().split(/\s+/);
  if (parts.length < 5 || parts.length > 6) {
    return false;
  }

  // Basic validation: each field should contain valid cron characters
  const cronFieldPattern = /^[\d*,\-/LW#?]+$/;
  return parts.every((part) => cronFieldPattern.test(part));
}

/**
 * Calculate the next run time based on a cron expression.
 * Simplified: returns next hour for hourly, next day for daily, etc.
 */
function calculateNextRunAt(expression: string): string {
  const now = new Date();

  // Rate expression parsing
  const rateMatch = expression.match(/^rate\((\d+)\s+(minute|minutes|hour|hours|day|days)\)$/);
  if (rateMatch) {
    const value = parseInt(rateMatch[1], 10);
    const unit = rateMatch[2];

    if (unit.startsWith('minute')) {
      now.setMinutes(now.getMinutes() + value);
    } else if (unit.startsWith('hour')) {
      now.setHours(now.getHours() + value);
    } else if (unit.startsWith('day')) {
      now.setDate(now.getDate() + value);
    }

    return now.toISOString();
  }

  // For cron expressions, default to next day at the specified time
  now.setDate(now.getDate() + 1);
  now.setMinutes(0);
  now.setSeconds(0);
  now.setMilliseconds(0);

  return now.toISOString();
}

// --- Database Operations ---

async function createReportSchedule(
  client: DatabaseClient,
  schema: string,
  tenantId: string,
  request: ScheduleReportRequest
): Promise<ReportScheduleRecord> {
  const nextRunAt = calculateNextRunAt(request.schedule.expression);

  const sql = `
    INSERT INTO ${schema}.report_schedules (
      tenant_id, name, report_type, schedule, recipients,
      export_format, report_config, is_active, next_run_at
    ) VALUES (
      $1, $2, $3, $4::jsonb, $5::jsonb,
      $6, $7::jsonb, true, $8::timestamptz
    )
    RETURNING
      schedule_id, tenant_id, name, report_type, schedule,
      recipients, export_format, report_config, is_active,
      last_run_at, next_run_at, created_at, updated_at
  `;

  const params = [
    tenantId,
    request.name,
    request.report_type,
    JSON.stringify(request.schedule),
    JSON.stringify(request.recipients),
    request.export_format,
    JSON.stringify(request.report_config),
    nextRunAt,
  ];

  try {
    const result = await client.query<Record<string, unknown>>(sql, params);
    const row = result.rows[0];

    return {
      schedule_id: String(row.schedule_id),
      tenant_id: String(row.tenant_id),
      name: String(row.name),
      report_type: row.report_type as ReportType,
      schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule) : row.schedule as CronSchedule,
      recipients: typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients as string[],
      export_format: row.export_format as ExportFormat,
      report_config: typeof row.report_config === 'string' ? JSON.parse(row.report_config) : row.report_config as ReportConfig,
      is_active: Boolean(row.is_active),
      last_run_at: row.last_run_at ? String(row.last_run_at) : null,
      next_run_at: row.next_run_at ? String(row.next_run_at) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
    };
  } catch (error: unknown) {
    // If the report_schedules table doesn't exist, create it and retry
    if (error instanceof Error && error.message.includes('relation') && error.message.includes('does not exist')) {
      await ensureReportSchedulesTable(client, schema);
      const retryResult = await client.query<Record<string, unknown>>(sql, params);
      const row = retryResult.rows[0];

      return {
        schedule_id: String(row.schedule_id),
        tenant_id: String(row.tenant_id),
        name: String(row.name),
        report_type: row.report_type as ReportType,
        schedule: typeof row.schedule === 'string' ? JSON.parse(row.schedule) : row.schedule as CronSchedule,
        recipients: typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients as string[],
        export_format: row.export_format as ExportFormat,
        report_config: typeof row.report_config === 'string' ? JSON.parse(row.report_config) : row.report_config as ReportConfig,
        is_active: Boolean(row.is_active),
        last_run_at: row.last_run_at ? String(row.last_run_at) : null,
        next_run_at: row.next_run_at ? String(row.next_run_at) : null,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    }
    throw error;
  }
}

async function ensureReportSchedulesTable(
  client: DatabaseClient,
  schema: string
): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS ${schema}.report_schedules (
      schedule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      name VARCHAR(255) NOT NULL,
      report_type VARCHAR(50) NOT NULL,
      schedule JSONB NOT NULL,
      recipients JSONB NOT NULL DEFAULT '[]',
      export_format VARCHAR(10) NOT NULL DEFAULT 'json',
      report_config JSONB NOT NULL DEFAULT '{}',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await client.query(sql, []);
}

/**
 * Convert report data to CSV format.
 */
export function convertToCSV(data: Record<string, unknown>[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((header) => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
      // Escape CSV special characters
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

// --- Handler ---

/**
 * POST /v1/reports/schedule — Create a scheduled report
 */
export async function scheduleReportHandler(
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

  let body: ScheduleReportRequest;
  try {
    body = JSON.parse(event.body ?? '{}') as ScheduleReportRequest;
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  // Validate required fields
  if (!body.name || typeof body.name !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'name is required and must be a string');
  }

  if (!body.report_type || !VALID_REPORT_TYPES.includes(body.report_type)) {
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `report_type must be one of: ${VALID_REPORT_TYPES.join(', ')}`
    );
  }

  if (!body.schedule || !body.schedule.expression) {
    return errorResponse(400, 'VALIDATION_ERROR', 'schedule.expression is required');
  }

  if (!isValidCronExpression(body.schedule.expression)) {
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      'schedule.expression must be a valid cron expression or rate expression (e.g., "0 9 * * 1" or "rate(1 day)")'
    );
  }

  if (!body.recipients || !Array.isArray(body.recipients) || body.recipients.length === 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'recipients must be a non-empty array of email addresses');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = body.recipients.filter((r) => !emailRegex.test(r));
  if (invalidEmails.length > 0) {
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `Invalid email addresses: ${invalidEmails.join(', ')}`
    );
  }

  if (!body.export_format || !VALID_EXPORT_FORMATS.includes(body.export_format)) {
    return errorResponse(
      400,
      'VALIDATION_ERROR',
      `export_format must be one of: ${VALID_EXPORT_FORMATS.join(', ')}`
    );
  }

  // Default report config
  if (!body.report_config) {
    body.report_config = { date_range_days: 30 };
  }

  const schedule = await withDatabase(async (client) => {
    return createReportSchedule(client, schema, tenantId, body);
  });

  return jsonResponse(201, { data: schedule } as ScheduleReportResponse);
}
