/**
 * Versioned migration runner for per-tenant schemas.
 * Tracks applied migrations and supports forward-only execution.
 */
import type { DatabaseClient } from './database.js';

export interface Migration {
  version: number;
  name: string;
  up: (db: DatabaseClient, schemaName: string) => Promise<void>;
}

export interface MigrationRecord {
  version: number;
  name: string;
  applied_at: string;
}

export interface MigrationRunResult {
  applied: MigrationRecord[];
  skipped: number;
  errors: Array<{ version: number; name: string; error: string }>;
}

/**
 * Ensures the migration tracking table exists within the tenant schema.
 */
async function ensureMigrationTable(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS "${schemaName}"._schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * Gets the list of already-applied migration versions for a tenant schema.
 */
async function getAppliedMigrations(
  db: DatabaseClient,
  schemaName: string
): Promise<number[]> {
  const result = await db.query<{ version: number }>(
    `SELECT version FROM "${schemaName}"._schema_migrations ORDER BY version ASC`
  );
  return result.rows.map((row) => row.version);
}

/**
 * Records a migration as applied in the tracking table.
 */
async function recordMigration(
  db: DatabaseClient,
  schemaName: string,
  migration: Migration
): Promise<void> {
  await db.query(
    `INSERT INTO "${schemaName}"._schema_migrations (version, name) VALUES ($1, $2)`,
    [migration.version, migration.name]
  );
}

/**
 * Runs all pending migrations for a tenant schema in version order.
 * Migrations that have already been applied are skipped.
 * Each migration runs in its own implicit transaction (single statement).
 *
 * @param db - Database client with schema-owner privileges
 * @param schemaName - The validated tenant schema name
 * @param migrations - Ordered list of migrations to apply
 * @returns Result indicating which migrations were applied, skipped, or errored
 */
export async function runMigrations(
  db: DatabaseClient,
  schemaName: string,
  migrations: Migration[]
): Promise<MigrationRunResult> {
  // Validate schema name
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  // Ensure migration tracking table exists
  await ensureMigrationTable(db, schemaName);

  // Get already-applied versions
  const appliedVersions = await getAppliedMigrations(db, schemaName);

  // Sort migrations by version
  const sortedMigrations = [...migrations].sort(
    (a, b) => a.version - b.version
  );

  const result: MigrationRunResult = {
    applied: [],
    skipped: 0,
    errors: [],
  };

  for (const migration of sortedMigrations) {
    if (appliedVersions.includes(migration.version)) {
      result.skipped++;
      continue;
    }

    try {
      await migration.up(db, schemaName);
      await recordMigration(db, schemaName, migration);
      result.applied.push({
        version: migration.version,
        name: migration.name,
        applied_at: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push({
        version: migration.version,
        name: migration.name,
        error: errorMessage,
      });
      // Stop on first error to maintain consistency
      break;
    }
  }

  return result;
}

/**
 * Gets the current migration status for a tenant schema.
 */
export async function getMigrationStatus(
  db: DatabaseClient,
  schemaName: string
): Promise<{
  applied: MigrationRecord[];
  pending: Array<{ version: number; name: string }>;
  currentVersion: number;
}> {
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  await ensureMigrationTable(db, schemaName);

  const result = await db.query<MigrationRecord>(
    `SELECT version, name, applied_at::text as applied_at FROM "${schemaName}"._schema_migrations ORDER BY version ASC`
  );

  const appliedVersions = new Set(result.rows.map((r) => r.version));
  const { getAllMigrations } = await import('./migrations/index.js');
  const allMigrations = getAllMigrations();

  const pending = allMigrations
    .filter((m) => !appliedVersions.has(m.version))
    .map((m) => ({ version: m.version, name: m.name }));

  const currentVersion =
    result.rows.length > 0
      ? result.rows[result.rows.length - 1].version
      : 0;

  return {
    applied: result.rows,
    pending,
    currentVersion,
  };
}
