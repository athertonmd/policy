/**
 * Tenant Management Service
 * Handles provisioning, configuration, and lifecycle management of tenants.
 */

// Handlers
export { handler as provisionTenantHandler } from './handlers/provision-tenant.js';
export { handler as updateTenantConfigHandler } from './handlers/update-tenant-config.js';
export { handler as decommissionTenantHandler } from './handlers/decommission-tenant.js';
export { handler as getTenantHandler } from './handlers/get-tenant.js';
export { handler as listTenantsHandler } from './handlers/list-tenants.js';

// Library utilities
export { createDatabaseClient, withDatabase } from './lib/database.js';
export { provisionTenantResources, generateSchemaName } from './lib/provisioning.js';
export { rollbackProvisioning, cleanupDecommissionedTenant } from './lib/rollback.js';

// Migration runner
export { runMigrations, getMigrationStatus } from './lib/migration-runner.js';
export type { Migration, MigrationRecord, MigrationRunResult } from './lib/migration-runner.js';
export { getAllMigrations } from './lib/migrations/index.js';

// Schema migration utilities
export {
  runTenantSchemaMigration,
  dropTenantSchema,
  listTenantTables,
  validateTenantSchema,
  EXPECTED_TENANT_TABLES,
} from './lib/tenant-schema-migration.js';
