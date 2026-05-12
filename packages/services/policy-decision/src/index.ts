/**
 * Policy Decision Service
 * Evaluates trip requests against tenant-configured policy rules.
 */

// Engine exports
export { evaluatePolicy } from './engine/policy-evaluator.js';
export type { EvaluationResult } from './engine/policy-evaluator.js';
export { evaluateCondition, resolveField, compareValues } from './engine/condition-evaluator.js';
export type { EvaluationInput } from './engine/condition-evaluator.js';
export {
  loadPolicyGraph,
  invalidateCache,
  invalidateAllCaches,
  getCacheStats,
} from './engine/bundle-loader.js';
export type { BundleCacheEntry, BundleLoaderConfig } from './engine/bundle-loader.js';
export {
  resolveConflicts,
  winningRulesToOutcomes,
} from './engine/conflict-resolver.js';
export type {
  ConflictResolutionStrategy,
  RuleOutcome,
  ConflictResolutionResult,
} from './engine/conflict-resolver.js';
export { calculateBudgetStatus, loadBudgetConfig } from './engine/budget-calculator.js';
export type { BudgetConfig, BudgetCalculationInput } from './engine/budget-calculator.js';
export {
  calculateCarbonImpact,
  estimateOfferEmissions,
} from './engine/carbon-calculator.js';
export type { CarbonCalculationInput } from './engine/carbon-calculator.js';

// Handler exports
export { handler as evaluatePolicyHandler } from './handlers/evaluate-policy.js';
export { handler as evaluateBatchHandler } from './handlers/evaluate-batch.js';
export { handler as bundleRefreshHandler } from './handlers/bundle-refresh.js';
