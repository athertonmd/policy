/**
 * Policy Configuration Service
 * Manages policy rules, DSL compilation, versioning, and simulation.
 */
export * from './dsl/index.js';
export * from './rego/index.js';

// Handlers
export { handler as compileDSLHandler } from './handlers/compile-dsl.js';
export { handler as saveRuleHandler } from './handlers/save-rule.js';
export { handler as activateVersionHandler } from './handlers/activate-version.js';
export { handler as listVersionsHandler } from './handlers/list-versions.js';
export { handler as rollbackVersionHandler } from './handlers/rollback-version.js';

// Library utilities
export { createDatabaseClient, withDatabase } from './lib/database.js';
export * from './lib/rule-repository.js';
