/**
 * Budget Repository — Database operations for the budgets table.
 * Provides CRUD, utilisation updates with atomic increment, and threshold checking.
 */
import type { DatabaseClient } from './database';

export interface BudgetRecord {
  budget_id: string;
  name: string;
  scope_type: 'tenant' | 'department' | 'cost_centre' | 'project';
  scope_value: string;
  period_type: 'monthly' | 'quarterly' | 'annual';
  amount: number;
  currency: string;
  warning_threshold: number;
  current_utilisation: number;
  period_start: string;
  period_end: string;
  owner_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetInput {
  name: string;
  scope_type: 'tenant' | 'department' | 'cost_centre' | 'project';
  scope_value: string;
  period_type: 'monthly' | 'quarterly' | 'annual';
  amount: number;
  currency: string;
  warning_threshold?: number;
  period_start: string;
  period_end: string;
  owner_id?: string;
}

export interface UpdateBudgetInput {
  name?: string;
  amount?: number;
  currency?: string;
  warning_threshold?: number;
  period_start?: string;
  period_end?: string;
  owner_id?: string | null;
}

export interface BudgetListFilter {
  scope_type?: string;
  scope_value?: string;
  period_type?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface UtilisationUpdateResult {
  budget_id: string;
  previous_utilisation: number;
  new_utilisation: number;
  amount: number;
  warning_threshold: number;
  threshold_breached: boolean;
  over_budget: boolean;
}

/**
 * Creates a new budget record.
 */
export async function createBudget(
  client: DatabaseClient,
  schema: string,
  input: CreateBudgetInput
): Promise<BudgetRecord> {
  const sql = `
    INSERT INTO ${schema}.budgets (
      name, scope_type, scope_value, period_type, amount, currency,
      warning_threshold, period_start, period_end, owner_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;

  const params = [
    input.name,
    input.scope_type,
    input.scope_value,
    input.period_type,
    input.amount,
    input.currency,
    input.warning_threshold ?? 80.0,
    input.period_start,
    input.period_end,
    input.owner_id ?? null,
  ];

  const result = await client.query<BudgetRecord>(sql, params);
  return result.rows[0];
}

/**
 * Retrieves a budget by ID.
 */
export async function getBudgetById(
  client: DatabaseClient,
  schema: string,
  budgetId: string
): Promise<BudgetRecord | null> {
  const sql = `SELECT * FROM ${schema}.budgets WHERE budget_id = $1`;
  const result = await client.query<BudgetRecord>(sql, [budgetId]);
  return result.rows[0] ?? null;
}

/**
 * Lists budgets with optional filtering and pagination.
 */
export async function listBudgets(
  client: DatabaseClient,
  schema: string,
  filter: BudgetListFilter = {}
): Promise<{ budgets: BudgetRecord[]; totalCount: number }> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter.scope_type) {
    conditions.push(`scope_type = $${paramIndex++}`);
    params.push(filter.scope_type);
  }
  if (filter.scope_value) {
    conditions.push(`scope_value = $${paramIndex++}`);
    params.push(filter.scope_value);
  }
  if (filter.period_type) {
    conditions.push(`period_type = $${paramIndex++}`);
    params.push(filter.period_type);
  }
  if (filter.is_active !== undefined) {
    conditions.push(`is_active = $${paramIndex++}`);
    params.push(filter.is_active);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countSql = `SELECT COUNT(*) as total FROM ${schema}.budgets ${whereClause}`;
  const countResult = await client.query<{ total: string }>(countSql, params);
  const totalCount = parseInt(countResult.rows[0]?.total ?? '0', 10);

  // Data query with pagination
  const limit = filter.limit ?? 50;
  const offset = filter.offset ?? 0;
  const dataSql = `
    SELECT * FROM ${schema}.budgets ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `;
  const dataParams = [...params, limit, offset];
  const dataResult = await client.query<BudgetRecord>(dataSql, dataParams);

  return { budgets: dataResult.rows, totalCount };
}

/**
 * Updates a budget record.
 */
export async function updateBudget(
  client: DatabaseClient,
  schema: string,
  budgetId: string,
  input: UpdateBudgetInput
): Promise<BudgetRecord | null> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    setClauses.push(`name = $${paramIndex++}`);
    params.push(input.name);
  }
  if (input.amount !== undefined) {
    setClauses.push(`amount = $${paramIndex++}`);
    params.push(input.amount);
  }
  if (input.currency !== undefined) {
    setClauses.push(`currency = $${paramIndex++}`);
    params.push(input.currency);
  }
  if (input.warning_threshold !== undefined) {
    setClauses.push(`warning_threshold = $${paramIndex++}`);
    params.push(input.warning_threshold);
  }
  if (input.period_start !== undefined) {
    setClauses.push(`period_start = $${paramIndex++}`);
    params.push(input.period_start);
  }
  if (input.period_end !== undefined) {
    setClauses.push(`period_end = $${paramIndex++}`);
    params.push(input.period_end);
  }
  if (input.owner_id !== undefined) {
    setClauses.push(`owner_id = $${paramIndex++}`);
    params.push(input.owner_id);
  }

  if (setClauses.length === 0) {
    return getBudgetById(client, schema, budgetId);
  }

  setClauses.push(`updated_at = NOW()`);

  const sql = `
    UPDATE ${schema}.budgets
    SET ${setClauses.join(', ')}
    WHERE budget_id = $${paramIndex++} AND is_active = true
    RETURNING *
  `;
  params.push(budgetId);

  const result = await client.query<BudgetRecord>(sql, params);
  return result.rows[0] ?? null;
}

/**
 * Soft-deletes (deactivates) a budget.
 */
export async function deactivateBudget(
  client: DatabaseClient,
  schema: string,
  budgetId: string
): Promise<boolean> {
  const sql = `
    UPDATE ${schema}.budgets
    SET is_active = false, updated_at = NOW()
    WHERE budget_id = $1 AND is_active = true
  `;
  const result = await client.query(sql, [budgetId]);
  return result.rowCount > 0;
}

/**
 * Atomically increments budget utilisation and returns threshold status.
 * Uses a single UPDATE with RETURNING to avoid race conditions.
 */
export async function incrementUtilisation(
  client: DatabaseClient,
  schema: string,
  budgetId: string,
  incrementAmount: number
): Promise<UtilisationUpdateResult | null> {
  const sql = `
    UPDATE ${schema}.budgets
    SET current_utilisation = current_utilisation + $1, updated_at = NOW()
    WHERE budget_id = $2 AND is_active = true
    RETURNING budget_id, current_utilisation - $1 AS previous_utilisation,
              current_utilisation AS new_utilisation, amount, warning_threshold
  `;

  const result = await client.query<{
    budget_id: string;
    previous_utilisation: number;
    new_utilisation: number;
    amount: number;
    warning_threshold: number;
  }>(sql, [incrementAmount, budgetId]);

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  const percentUsed = row.amount > 0 ? (row.new_utilisation / row.amount) * 100 : 0;

  return {
    budget_id: row.budget_id,
    previous_utilisation: Number(row.previous_utilisation),
    new_utilisation: Number(row.new_utilisation),
    amount: Number(row.amount),
    warning_threshold: Number(row.warning_threshold),
    threshold_breached: percentUsed >= row.warning_threshold,
    over_budget: percentUsed >= 100,
  };
}

/**
 * Finds budgets matching a given scope for a tenant.
 * Used to determine which budgets are affected by a trip approval.
 */
export async function findBudgetsForScope(
  client: DatabaseClient,
  schema: string,
  scopeType: string,
  scopeValue: string,
  asOfDate: string
): Promise<BudgetRecord[]> {
  const sql = `
    SELECT * FROM ${schema}.budgets
    WHERE scope_type = $1
      AND scope_value = $2
      AND is_active = true
      AND period_start <= $3::date
      AND period_end >= $3::date
    ORDER BY created_at DESC
  `;

  const result = await client.query<BudgetRecord>(sql, [scopeType, scopeValue, asOfDate]);
  return result.rows;
}

/**
 * Finds all applicable budgets for a trip based on traveller context.
 * Checks tenant-level, department, cost_centre, and project budgets.
 */
export async function findApplicableBudgets(
  client: DatabaseClient,
  schema: string,
  tenantId: string,
  department: string | undefined,
  costCentre: string | undefined,
  asOfDate: string
): Promise<BudgetRecord[]> {
  const conditions: string[] = [
    'is_active = true',
    'period_start <= $1::date',
    'period_end >= $1::date',
  ];
  const params: unknown[] = [asOfDate];
  let paramIndex = 2;

  // Build scope conditions: tenant-level OR matching department/cost_centre
  const scopeConditions: string[] = [];

  // Always include tenant-level budgets
  scopeConditions.push(`(scope_type = 'tenant' AND scope_value = $${paramIndex++})`);
  params.push(tenantId);

  if (department) {
    scopeConditions.push(`(scope_type = 'department' AND scope_value = $${paramIndex++})`);
    params.push(department);
  }

  if (costCentre) {
    scopeConditions.push(`(scope_type = 'cost_centre' AND scope_value = $${paramIndex++})`);
    params.push(costCentre);
  }

  conditions.push(`(${scopeConditions.join(' OR ')})`);

  const sql = `
    SELECT * FROM ${schema}.budgets
    WHERE ${conditions.join(' AND ')}
    ORDER BY scope_type, created_at DESC
  `;

  const result = await client.query<BudgetRecord>(sql, params);
  return result.rows;
}
