/**
 * Rule Repository — Database operations for policy_rules and policy_rule_versions tables.
 *
 * Provides CRUD operations for policy rules within a tenant's schema,
 * including version history management.
 *
 * Validates: Requirements 4.1, 4.3, 4.6, 4.7
 */
import { randomUUID } from 'node:crypto';
import type { PolicyGraph, PolicyRule, PolicyRuleVersion } from '@travel-policy/shared';
import type { DatabaseClient } from './database.js';

export interface PolicyRuleRow {
  rule_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  dsl_source: string;
  policy_graph: string; // JSON string
  priority: number;
  status: string;
  conditions: string; // JSON string
  outcomes: string; // JSON string
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyRuleVersionRow {
  version_id: string;
  rule_id: string;
  version: number;
  dsl_source: string;
  policy_graph: string; // JSON string
  change_description: string | null;
  changed_by: string;
  created_at: string;
}

export interface SaveRuleParams {
  tenantId: string;
  name: string;
  description?: string;
  dslSource: string;
  policyGraph: PolicyGraph;
  priority: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  createdBy: string;
}

/**
 * Save a new policy rule and create the initial version record.
 */
export async function saveRule(
  db: DatabaseClient,
  params: SaveRuleParams
): Promise<PolicyRule> {
  const ruleId = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();
  const schemaName = getTenantSchema(params.tenantId);

  // Insert the rule
  const result = await db.query<PolicyRuleRow>(
    `INSERT INTO ${schemaName}.policy_rules
      (rule_id, tenant_id, name, description, dsl_source, policy_graph, priority, status, conditions, outcomes, version, effective_from, effective_to, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', '{}', '{}', 1, $8, $9, $10, $11, $11)
     RETURNING *`,
    [
      ruleId,
      params.tenantId,
      params.name,
      params.description ?? null,
      params.dslSource,
      JSON.stringify(params.policyGraph),
      params.priority,
      params.effectiveFrom ?? null,
      params.effectiveTo ?? null,
      params.createdBy,
      now,
    ]
  );

  // Create the initial version record
  await db.query(
    `INSERT INTO ${schemaName}.policy_rule_versions
      (version_id, rule_id, version, dsl_source, policy_graph, change_description, changed_by, created_at)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7)`,
    [
      versionId,
      ruleId,
      params.dslSource,
      JSON.stringify(params.policyGraph),
      'Initial version',
      params.createdBy,
      now,
    ]
  );

  return mapRowToRule(result.rows[0]);
}

/**
 * Get a policy rule by ID.
 */
export async function getRuleById(
  db: DatabaseClient,
  tenantId: string,
  ruleId: string
): Promise<PolicyRule | null> {
  const schemaName = getTenantSchema(tenantId);

  const result = await db.query<PolicyRuleRow>(
    `SELECT * FROM ${schemaName}.policy_rules WHERE rule_id = $1 AND tenant_id = $2`,
    [ruleId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRule(result.rows[0]);
}

/**
 * Activate a policy rule (set status to 'active').
 */
export async function activateRule(
  db: DatabaseClient,
  tenantId: string,
  ruleId: string
): Promise<PolicyRule | null> {
  const schemaName = getTenantSchema(tenantId);

  const result = await db.query<PolicyRuleRow>(
    `UPDATE ${schemaName}.policy_rules
     SET status = 'active', updated_at = $1
     WHERE rule_id = $2 AND tenant_id = $3
     RETURNING *`,
    [new Date().toISOString(), ruleId, tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToRule(result.rows[0]);
}

/**
 * List all versions of a policy rule with pagination.
 */
export async function listVersions(
  db: DatabaseClient,
  tenantId: string,
  ruleId: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ versions: PolicyRuleVersion[]; total: number }> {
  const schemaName = getTenantSchema(tenantId);

  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${schemaName}.policy_rule_versions WHERE rule_id = $1`,
    [ruleId]
  );

  const result = await db.query<PolicyRuleVersionRow>(
    `SELECT * FROM ${schemaName}.policy_rule_versions
     WHERE rule_id = $1
     ORDER BY version DESC
     LIMIT $2 OFFSET $3`,
    [ruleId, limit, offset]
  );

  return {
    versions: result.rows.map(mapRowToVersion),
    total: parseInt(countResult.rows[0].count, 10),
  };
}

/**
 * Get a specific version of a policy rule.
 */
export async function getVersion(
  db: DatabaseClient,
  tenantId: string,
  ruleId: string,
  version: number
): Promise<PolicyRuleVersion | null> {
  const schemaName = getTenantSchema(tenantId);

  const result = await db.query<PolicyRuleVersionRow>(
    `SELECT * FROM ${schemaName}.policy_rule_versions
     WHERE rule_id = $1 AND version = $2`,
    [ruleId, version]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToVersion(result.rows[0]);
}

/**
 * Rollback a rule to a previous version.
 * Copies the target version's DSL/graph to the current rule and increments the version number.
 */
export async function rollbackToVersion(
  db: DatabaseClient,
  tenantId: string,
  ruleId: string,
  targetVersion: number,
  changedBy: string
): Promise<PolicyRule | null> {
  const schemaName = getTenantSchema(tenantId);

  // Get the target version
  const targetVersionRow = await getVersion(db, tenantId, ruleId, targetVersion);
  if (!targetVersionRow) {
    return null;
  }

  // Get current rule to determine new version number
  const currentRule = await getRuleById(db, tenantId, ruleId);
  if (!currentRule) {
    return null;
  }

  const newVersion = currentRule.version + 1;
  const now = new Date().toISOString();

  // Update the rule with the target version's data
  const result = await db.query<PolicyRuleRow>(
    `UPDATE ${schemaName}.policy_rules
     SET dsl_source = $1, policy_graph = $2, version = $3, updated_at = $4
     WHERE rule_id = $5 AND tenant_id = $6
     RETURNING *`,
    [
      targetVersionRow.dslSource,
      JSON.stringify(targetVersionRow.policyGraph),
      newVersion,
      now,
      ruleId,
      tenantId,
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Create a new version record for the rollback
  const versionId = randomUUID();
  await db.query(
    `INSERT INTO ${schemaName}.policy_rule_versions
      (version_id, rule_id, version, dsl_source, policy_graph, change_description, changed_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      versionId,
      ruleId,
      newVersion,
      targetVersionRow.dslSource,
      JSON.stringify(targetVersionRow.policyGraph),
      `Rollback to version ${targetVersion}`,
      changedBy,
      now,
    ]
  );

  return mapRowToRule(result.rows[0]);
}

/**
 * Get all active rules for a tenant (used for bundle compilation).
 */
export async function getActiveRules(
  db: DatabaseClient,
  tenantId: string
): Promise<PolicyRule[]> {
  const schemaName = getTenantSchema(tenantId);

  const result = await db.query<PolicyRuleRow>(
    `SELECT * FROM ${schemaName}.policy_rules
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY priority DESC`,
    [tenantId]
  );

  return result.rows.map(mapRowToRule);
}

// --- Helpers ---

/**
 * Derive the tenant schema name from the tenant ID.
 */
function getTenantSchema(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`;
}

function mapRowToRule(row: PolicyRuleRow): PolicyRule {
  return {
    ruleId: row.rule_id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description ?? undefined,
    dslSource: row.dsl_source,
    policyGraph: JSON.parse(row.policy_graph) as PolicyGraph,
    priority: row.priority,
    status: row.status as PolicyRule['status'],
    conditions: JSON.parse(row.conditions) as Record<string, unknown>,
    outcomes: JSON.parse(row.outcomes) as Record<string, unknown>,
    version: row.version,
    effectiveFrom: row.effective_from ?? undefined,
    effectiveTo: row.effective_to ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRowToVersion(row: PolicyRuleVersionRow): PolicyRuleVersion {
  return {
    versionId: row.version_id,
    ruleId: row.rule_id,
    version: row.version,
    dslSource: row.dsl_source,
    policyGraph: JSON.parse(row.policy_graph) as PolicyGraph,
    changeDescription: row.change_description ?? undefined,
    changedBy: row.changed_by,
    createdAt: row.created_at,
  };
}
