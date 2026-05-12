/**
 * Migration 002: Enable Row-Level Security on all tenant tables.
 * Provides an additional layer of isolation beyond schema separation.
 * RLS policies ensure that even if search_path is misconfigured,
 * cross-tenant data access is blocked.
 */
import type { Migration } from '../migration-runner.js';
import type { DatabaseClient } from '../database.js';

const TENANT_TABLES = [
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
] as const;

async function up(db: DatabaseClient, schemaName: string): Promise<void> {
  const s = `"${schemaName}"`;

  for (const table of TENANT_TABLES) {
    // Enable RLS on the table
    await db.query(`ALTER TABLE ${s}."${table}" ENABLE ROW LEVEL SECURITY`);

    // Force RLS for table owner as well (prevents bypassing)
    await db.query(
      `ALTER TABLE ${s}."${table}" FORCE ROW LEVEL SECURITY`
    );

    // Create a policy that allows access only when the session variable
    // app.current_tenant_schema matches this schema name.
    // This ensures that even with direct schema access, the connection
    // must have the correct tenant context set.
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = '${schemaName}'
            AND tablename = '${table}'
            AND policyname = 'tenant_isolation_policy'
        ) THEN
          EXECUTE format(
            'CREATE POLICY tenant_isolation_policy ON ${s}."${table}" FOR ALL USING (current_setting(''app.current_tenant_schema'', true) = ''${schemaName}'')'
          );
        END IF;
      END;
      $$
    `);

    // Create a permissive policy for the superuser/migration role
    // so that migrations and admin operations can still access data
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = '${schemaName}'
            AND tablename = '${table}'
            AND policyname = 'superuser_bypass_policy'
        ) THEN
          EXECUTE format(
            'CREATE POLICY superuser_bypass_policy ON ${s}."${table}" FOR ALL TO rds_superuser USING (true)'
          );
        END IF;
      END;
      $$
    `);
  }
}

export const migration002EnableRLS: Migration = {
  version: 2,
  name: 'enable-row-level-security',
  up,
};
