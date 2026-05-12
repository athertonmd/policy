/**
 * Budget CRUD Handlers
 *
 * Provides API Gateway Lambda handlers for budget management:
 * - POST /v1/budgets — Create budget
 * - GET /v1/budgets — List budgets with filtering
 * - GET /v1/budgets/{budgetId} — Get budget with current utilisation
 * - PUT /v1/budgets/{budgetId} — Update budget
 * - DELETE /v1/budgets/{budgetId} — Deactivate budget
 *
 * Requirements: 14.1, 14.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase } from '../lib/database';
import {
  createBudget,
  getBudgetById,
  listBudgets,
  updateBudget,
  deactivateBudget,
  type CreateBudgetInput,
  type UpdateBudgetInput,
  type BudgetListFilter,
} from '../lib/budget-repository';

const VALID_SCOPE_TYPES = ['tenant', 'department', 'cost_centre', 'project'] as const;
const VALID_PERIOD_TYPES = ['monthly', 'quarterly', 'annual'] as const;

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
    error: {
      code,
      message,
      timestamp: new Date().toISOString(),
    },
  });
}

function getTenantSchema(event: APIGatewayProxyEvent): string | null {
  // Tenant schema is resolved from JWT claims via authorizer context
  const tenantSchema = event.requestContext?.authorizer?.tenantSchema as string | undefined;
  return tenantSchema ?? process.env.DEFAULT_TENANT_SCHEMA ?? null;
}

function getTenantId(event: APIGatewayProxyEvent): string | null {
  const tenantId = event.requestContext?.authorizer?.tenantId as string | undefined;
  return tenantId ?? process.env.DEFAULT_TENANT_ID ?? null;
}

/**
 * POST /v1/budgets — Create a new budget
 */
export async function createBudgetHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  // Validate required fields
  const { name, scope_type, scope_value, period_type, amount, currency, period_start, period_end } = body;

  if (!name || typeof name !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'name is required and must be a string');
  }
  if (!scope_type || !VALID_SCOPE_TYPES.includes(scope_type as typeof VALID_SCOPE_TYPES[number])) {
    return errorResponse(400, 'VALIDATION_ERROR', `scope_type must be one of: ${VALID_SCOPE_TYPES.join(', ')}`);
  }
  if (!scope_value || typeof scope_value !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'scope_value is required and must be a string');
  }
  if (!period_type || !VALID_PERIOD_TYPES.includes(period_type as typeof VALID_PERIOD_TYPES[number])) {
    return errorResponse(400, 'VALIDATION_ERROR', `period_type must be one of: ${VALID_PERIOD_TYPES.join(', ')}`);
  }
  if (typeof amount !== 'number' || amount <= 0) {
    return errorResponse(400, 'VALIDATION_ERROR', 'amount must be a positive number');
  }
  if (!currency || typeof currency !== 'string' || currency.length !== 3) {
    return errorResponse(400, 'VALIDATION_ERROR', 'currency must be a 3-letter ISO code');
  }
  if (!period_start || typeof period_start !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'period_start is required (YYYY-MM-DD)');
  }
  if (!period_end || typeof period_end !== 'string') {
    return errorResponse(400, 'VALIDATION_ERROR', 'period_end is required (YYYY-MM-DD)');
  }

  const warningThreshold = body.warning_threshold as number | undefined;
  if (warningThreshold !== undefined && (typeof warningThreshold !== 'number' || warningThreshold < 0 || warningThreshold > 100)) {
    return errorResponse(400, 'VALIDATION_ERROR', 'warning_threshold must be a number between 0 and 100');
  }

  const input: CreateBudgetInput = {
    name: name as string,
    scope_type: scope_type as CreateBudgetInput['scope_type'],
    scope_value: scope_value as string,
    period_type: period_type as CreateBudgetInput['period_type'],
    amount: amount as number,
    currency: currency as string,
    warning_threshold: warningThreshold,
    period_start: period_start as string,
    period_end: period_end as string,
    owner_id: body.owner_id as string | undefined,
  };

  const budget = await withDatabase(async (client) => {
    return createBudget(client, schema, input);
  });

  return jsonResponse(201, { data: budget });
}

/**
 * GET /v1/budgets — List budgets with filtering
 */
export async function listBudgetsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  const params = event.queryStringParameters ?? {};
  const filter: BudgetListFilter = {
    scope_type: params.scope_type,
    scope_value: params.scope_value,
    period_type: params.period_type,
    is_active: params.is_active !== undefined ? params.is_active === 'true' : undefined,
    limit: params.limit ? parseInt(params.limit, 10) : undefined,
    offset: params.offset ? parseInt(params.offset, 10) : undefined,
  };

  const result = await withDatabase(async (client) => {
    return listBudgets(client, schema, filter);
  });

  return jsonResponse(200, {
    data: result.budgets,
    pagination: {
      totalCount: result.totalCount,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
      hasMore: (filter.offset ?? 0) + (filter.limit ?? 50) < result.totalCount,
    },
  });
}

/**
 * GET /v1/budgets/{budgetId} — Get budget with current utilisation
 */
export async function getBudgetHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  const budgetId = event.pathParameters?.budgetId;
  if (!budgetId) {
    return errorResponse(400, 'VALIDATION_ERROR', 'budgetId path parameter is required');
  }

  const budget = await withDatabase(async (client) => {
    return getBudgetById(client, schema, budgetId);
  });

  if (!budget) {
    return errorResponse(404, 'NOT_FOUND', `Budget ${budgetId} not found`);
  }

  // Compute utilisation percentage for the response
  const percentUsed = budget.amount > 0
    ? Math.round((budget.current_utilisation / budget.amount) * 10000) / 100
    : 0;

  return jsonResponse(200, {
    data: {
      ...budget,
      percent_used: percentUsed,
      threshold_breached: percentUsed >= budget.warning_threshold,
      over_budget: percentUsed >= 100,
    },
  });
}

/**
 * PUT /v1/budgets/{budgetId} — Update budget
 */
export async function updateBudgetHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  const budgetId = event.pathParameters?.budgetId;
  if (!budgetId) {
    return errorResponse(400, 'VALIDATION_ERROR', 'budgetId path parameter is required');
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const input: UpdateBudgetInput = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string') {
      return errorResponse(400, 'VALIDATION_ERROR', 'name must be a string');
    }
    input.name = body.name;
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'amount must be a positive number');
    }
    input.amount = body.amount;
  }
  if (body.currency !== undefined) {
    if (typeof body.currency !== 'string' || body.currency.length !== 3) {
      return errorResponse(400, 'VALIDATION_ERROR', 'currency must be a 3-letter ISO code');
    }
    input.currency = body.currency;
  }
  if (body.warning_threshold !== undefined) {
    if (typeof body.warning_threshold !== 'number' || body.warning_threshold < 0 || body.warning_threshold > 100) {
      return errorResponse(400, 'VALIDATION_ERROR', 'warning_threshold must be between 0 and 100');
    }
    input.warning_threshold = body.warning_threshold;
  }
  if (body.period_start !== undefined) {
    input.period_start = body.period_start as string;
  }
  if (body.period_end !== undefined) {
    input.period_end = body.period_end as string;
  }
  if (body.owner_id !== undefined) {
    input.owner_id = body.owner_id as string | null;
  }

  const budget = await withDatabase(async (client) => {
    return updateBudget(client, schema, budgetId, input);
  });

  if (!budget) {
    return errorResponse(404, 'NOT_FOUND', `Budget ${budgetId} not found or inactive`);
  }

  return jsonResponse(200, { data: budget });
}

/**
 * DELETE /v1/budgets/{budgetId} — Deactivate budget (soft delete)
 */
export async function deleteBudgetHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const schema = getTenantSchema(event);
  if (!schema) {
    return errorResponse(401, 'UNAUTHORIZED', 'Tenant context not resolved');
  }

  const budgetId = event.pathParameters?.budgetId;
  if (!budgetId) {
    return errorResponse(400, 'VALIDATION_ERROR', 'budgetId path parameter is required');
  }

  const deactivated = await withDatabase(async (client) => {
    return deactivateBudget(client, schema, budgetId);
  });

  if (!deactivated) {
    return errorResponse(404, 'NOT_FOUND', `Budget ${budgetId} not found or already inactive`);
  }

  return jsonResponse(200, { data: { budgetId, status: 'deactivated' } });
}
