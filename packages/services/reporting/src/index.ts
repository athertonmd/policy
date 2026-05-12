/**
 * Reporting & Budget Tracking Service — Barrel exports
 */

// Handlers — Budget CRUD
export {
  createBudgetHandler,
  listBudgetsHandler,
  getBudgetHandler,
  updateBudgetHandler,
  deleteBudgetHandler,
} from './handlers/budget-crud';

export { handler as budgetUtilisationUpdaterHandler } from './handlers/budget-utilisation-updater';

// Handlers — Reporting & Analytics
export { generateSpendReportHandler } from './handlers/spend-report';
export { generateCarbonReportHandler, calculateEmissions } from './handlers/carbon-report';
export { getApprovalAnalyticsHandler } from './handlers/approval-analytics';
export { getComplianceMetricsHandler } from './handlers/compliance-metrics';
export { scheduleReportHandler, convertToCSV } from './handlers/schedule-report';
export { complianceRatesHandler, leakageDetectionHandler, effectivenessReportHandler } from './handlers/compliance-monitoring';
export type {
  ComplianceRate,
  PolicyLeakage,
  ComplianceAlert,
  PolicyEffectivenessReport,
  RuleEffectiveness,
} from './handlers/compliance-monitoring';

// Repository
export {
  createBudget,
  getBudgetById,
  listBudgets,
  updateBudget,
  deactivateBudget,
  incrementUtilisation,
  findBudgetsForScope,
  findApplicableBudgets,
  type BudgetRecord,
  type CreateBudgetInput,
  type UpdateBudgetInput,
  type BudgetListFilter,
  type UtilisationUpdateResult,
} from './lib/budget-repository';

// Database
export {
  createDatabaseClient,
  getDatabaseCredentials,
  withDatabase,
  type DatabaseClient,
  type DatabaseCredentials,
  type QueryResult,
} from './lib/database';
