/**
 * Registry of all per-tenant schema migrations.
 * Migrations are applied in version order during tenant provisioning
 * and when upgrading existing tenant schemas.
 */
import type { Migration } from '../migration-runner.js';
import { migration001CreateBaseTables } from './001-create-base-tables.js';
import { migration002EnableRLS } from './002-enable-rls.js';

/**
 * Returns all registered migrations in version order.
 */
export function getAllMigrations(): Migration[] {
  return [migration001CreateBaseTables, migration002EnableRLS];
}
