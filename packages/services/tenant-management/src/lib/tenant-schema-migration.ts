/**
 * Per-tenant schema migration runner.
 * Creates all tables defined in the design document within a tenant's isolated schema.
 * Includes row-level security policies and connection scoping for data isolation.
 */
import type { DatabaseClient } from './database.js';

/**
 * SQL statements for creating the full per-tenant schema.
 * Each statement creates a single table or index within the tenant's schema.
 */
function getTenantMigrationStatements(schemaName: string): string[] {
  const s = `"${schemaName}"`;

  return [
    // 1. traveller_profiles
    `CREATE TABLE IF NOT EXISTS ${s}.traveller_profiles (
      traveller_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id VARCHAR(100) NOT NULL UNIQUE,
      email VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      department VARCHAR(100),
      cost_centre VARCHAR(50),
      seniority_level VARCHAR(50),
      region VARCHAR(50),
      manager_id UUID REFERENCES ${s}.traveller_profiles(traveller_id),
      preferences JSONB DEFAULT '{}',
      loyalty_programmes JSONB DEFAULT '[]',
      passport_details_encrypted BYTEA,
      emergency_contact_encrypted BYTEA,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 2. policy_rules
    `CREATE TABLE IF NOT EXISTS ${s}.policy_rules (
      rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      dsl_source TEXT NOT NULL,
      policy_graph JSONB NOT NULL,
      opa_bundle_ref VARCHAR(512),
      priority INTEGER NOT NULL DEFAULT 100,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      conditions JSONB NOT NULL,
      outcomes JSONB NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      effective_from TIMESTAMPTZ,
      effective_to TIMESTAMPTZ,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 3. policy_rule_versions
    `CREATE TABLE IF NOT EXISTS ${s}.policy_rule_versions (
      version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      rule_id UUID NOT NULL REFERENCES ${s}.policy_rules(rule_id),
      version INTEGER NOT NULL,
      dsl_source TEXT NOT NULL,
      policy_graph JSONB NOT NULL,
      change_description TEXT,
      changed_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(rule_id, version)
    )`,

    // 4. policy_decisions
    `CREATE TABLE IF NOT EXISTS ${s}.policy_decisions (
      decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      trip_id UUID,
      decision_point VARCHAR(100) NOT NULL,
      traveller_id UUID NOT NULL REFERENCES ${s}.traveller_profiles(traveller_id),
      request_payload JSONB NOT NULL,
      result VARCHAR(20) NOT NULL CHECK (result IN ('approve', 'reject', 'review')),
      winning_rules JSONB NOT NULL DEFAULT '[]',
      reasons JSONB NOT NULL DEFAULT '[]',
      obligations JSONB NOT NULL DEFAULT '[]',
      alternatives JSONB DEFAULT '[]',
      budget_status JSONB,
      carbon_impact JSONB,
      duration_ms INTEGER NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Indexes for policy_decisions
    `CREATE INDEX IF NOT EXISTS idx_decisions_trip ON ${s}.policy_decisions(trip_id)`,
    `CREATE INDEX IF NOT EXISTS idx_decisions_traveller ON ${s}.policy_decisions(traveller_id)`,
    `CREATE INDEX IF NOT EXISTS idx_decisions_evaluated ON ${s}.policy_decisions(evaluated_at)`,

    // 5. approval_workflows
    `CREATE TABLE IF NOT EXISTS ${s}.approval_workflows (
      workflow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id UUID NOT NULL REFERENCES ${s}.policy_decisions(decision_id),
      trip_request_id UUID,
      traveller_id UUID NOT NULL REFERENCES ${s}.traveller_profiles(traveller_id),
      template_id UUID NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      current_stage INTEGER NOT NULL DEFAULT 1,
      stages JSONB NOT NULL,
      step_function_execution_arn VARCHAR(512),
      priority VARCHAR(10) NOT NULL DEFAULT 'normal',
      initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      sla_deadline TIMESTAMPTZ NOT NULL
    )`,

    // Indexes for approval_workflows
    `CREATE INDEX IF NOT EXISTS idx_workflows_status ON ${s}.approval_workflows(status)`,
    `CREATE INDEX IF NOT EXISTS idx_workflows_traveller ON ${s}.approval_workflows(traveller_id)`,

    // 6. approval_actions
    `CREATE TABLE IF NOT EXISTS ${s}.approval_actions (
      action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workflow_id UUID NOT NULL REFERENCES ${s}.approval_workflows(workflow_id),
      stage_number INTEGER NOT NULL,
      approver_id UUID NOT NULL REFERENCES ${s}.traveller_profiles(traveller_id),
      action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'reject', 'request_info', 'delegate', 'escalate')),
      comment TEXT,
      source VARCHAR(20) NOT NULL DEFAULT 'ui' CHECK (source IN ('ui', 'email', 'api', 'auto')),
      acted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 7. workflow_templates
    `CREATE TABLE IF NOT EXISTS ${s}.workflow_templates (
      template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      stages JSONB NOT NULL,
      escalation_rules JSONB NOT NULL DEFAULT '[]',
      auto_approval_conditions JSONB DEFAULT '[]',
      sla_config JSONB NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_by UUID NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 8. budgets
    `CREATE TABLE IF NOT EXISTS ${s}.budgets (
      budget_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      scope_type VARCHAR(20) NOT NULL CHECK (scope_type IN ('tenant', 'department', 'cost_centre', 'project')),
      scope_value VARCHAR(100) NOT NULL,
      period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'annual')),
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'GBP',
      warning_threshold DECIMAL(5, 2) NOT NULL DEFAULT 80.00,
      current_utilisation DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      owner_id UUID REFERENCES ${s}.traveller_profiles(traveller_id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 9. policy_overrides
    `CREATE TABLE IF NOT EXISTS ${s}.policy_overrides (
      override_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      decision_id UUID NOT NULL REFERENCES ${s}.policy_decisions(decision_id),
      requested_by UUID NOT NULL REFERENCES ${s}.traveller_profiles(traveller_id),
      reason_category VARCHAR(50) NOT NULL,
      justification TEXT NOT NULL,
      approval_workflow_id UUID REFERENCES ${s}.approval_workflows(workflow_id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      approved_by UUID REFERENCES ${s}.traveller_profiles(traveller_id),
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // 10. integrations
    `CREATE TABLE IF NOT EXISTS ${s}.integrations (
      integration_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_type VARCHAR(20) NOT NULL,
      source_name VARCHAR(255) NOT NULL,
      auth_config_encrypted BYTEA NOT NULL,
      payload_mapping JSONB NOT NULL,
      retry_policy JSONB NOT NULL DEFAULT '{"maxRetries": 5, "backoffMultiplier": 2}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      last_health_check TIMESTAMPTZ,
      health_status VARCHAR(20) DEFAULT 'unknown',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,

    // Auto-update trigger function for the tenant schema
    `CREATE OR REPLACE FUNCTION ${s}.update_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql`,

    // Apply updated_at triggers to all tables with updated_at column
    `DO $$
    DECLARE
      tbl TEXT;
    BEGIN
      FOR tbl IN
        SELECT table_name FROM information_schema.columns
        WHERE table_schema = '${schemaName}' AND column_name = 'updated_at'
      LOOP
        EXECUTE format(
          'CREATE TRIGGER IF NOT EXISTS trg_%I_updated_at BEFORE UPDATE ON "${schemaName}".%I FOR EACH ROW EXECUTE FUNCTION "${schemaName}".update_updated_at()',
          tbl, tbl
        );
      END LOOP;
    END;
    $$`,
  ];
}

/**
 * SQL statements for enabling row-level security on all tenant tables.
 * This provides an additional layer of isolation beyond schema separation.
 */
function getRowLevelSecurityStatements(schemaName: string): string[] {
  const s = `"${schemaName}"`;
  const tables = [
    'traveller_profiles',
    'policy_rules',
    'policy_rule_versions',
    'policy_decisions',
    'approval_workflows',
    'approval_actions',
    'workflow_templates',
    'budgets',
    'policy_overrides',
    'integrations',
  ];

  const statements: string[] = [];

  for (const table of tables) {
    // Enable RLS on the table
    statements.push(`ALTER TABLE ${s}."${table}" ENABLE ROW LEVEL SECURITY`);

    // Create a policy that allows access only when the search_path includes this schema.
    // The tenant_app role is used by the application; the policy ensures that even if
    // search_path is misconfigured, RLS blocks cross-tenant access.
    statements.push(
      `DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = '${schemaName}' AND tablename = '${table}' AND policyname = 'tenant_isolation_policy'
        ) THEN
          EXECUTE format(
            'CREATE POLICY tenant_isolation_policy ON "${schemaName}"."${table}" FOR ALL USING (current_setting(''app.current_tenant_schema'', true) = ''${schemaName}'')'
          );
        END IF;
      END;
      $$`
    );
  }

  return statements;
}

/**
 * Runs the full per-tenant schema migration.
 * Creates all tables, indexes, triggers, and row-level security policies.
 *
 * @param db - Database client with superuser or schema-owner privileges
 * @param schemaName - The validated schema name for the tenant
 */
export async function runTenantSchemaMigration(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  // Validate schema name to prevent SQL injection
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  // Create the schema
  await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Run all table creation statements
  const migrationStatements = getTenantMigrationStatements(schemaName);
  for (const statement of migrationStatements) {
    await db.query(statement);
  }

  // Enable row-level security
  const rlsStatements = getRowLevelSecurityStatements(schemaName);
  for (const statement of rlsStatements) {
    await db.query(statement);
  }

  // Set the tenant schema session variable for RLS enforcement
  await db.query(
    `ALTER DATABASE CURRENT SET app.current_tenant_schema = ''`
  );
}

/**
 * Drops a tenant schema and all its contents.
 * Used during decommissioning or rollback of failed provisioning.
 *
 * @param db - Database client with schema-owner privileges
 * @param schemaName - The schema to drop
 */
export async function dropTenantSchema(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Lists all tables in a tenant schema. Useful for health checks and diagnostics.
 */
export async function listTenantTables(
  db: DatabaseClient,
  schemaName: string
): Promise<string[]> {
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  const result = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
    [schemaName]
  );

  return result.rows.map((row) => row.table_name);
}

/**
 * Expected tables that should exist in a fully provisioned tenant schema.
 */
export const EXPECTED_TENANT_TABLES = [
  'approval_actions',
  'approval_workflows',
  'budgets',
  'integrations',
  'policy_decisions',
  'policy_overrides',
  'policy_rule_versions',
  'policy_rules',
  'traveller_profiles',
  'workflow_templates',
] as const;

/**
 * Validates that a tenant schema has all expected tables.
 * Returns a list of missing tables, or an empty array if all are present.
 */
export async function validateTenantSchema(
  db: DatabaseClient,
  schemaName: string
): Promise<string[]> {
  const existingTables = await listTenantTables(db, schemaName);
  const missing = EXPECTED_TENANT_TABLES.filter(
    (table) => !existingTables.includes(table)
  );
  return missing;
}
