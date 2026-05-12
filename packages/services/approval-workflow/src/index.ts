/**
 * Approval Workflow Service
 * Orchestrates approval workflows using Step Functions with escalation, delegation, and SLA management.
 */

export {
  generateSingleStageDefinition,
  generateMultiStageSequentialDefinition,
  generateMultiStageParallelDefinition,
  generateConditionalDefinition,
  createStateMachineDefinition,
} from './state-machines/index.js';

export type {
  WorkflowTemplateType,
  WorkflowLambdaConfig,
  CreateStateMachineParams,
  SingleStageParams,
  MultiStageSequentialParams,
  SequentialStageConfig,
  MultiStageParallelParams,
  ConditionalWorkflowParams,
  ConditionalBranchConfig,
} from './state-machines/index.js';

// Handler exports
export { handler as initiateWorkflowHandler } from './handlers/initiate-workflow.js';
export { handler as submitActionHandler } from './handlers/submit-action.js';
export { handler as escalationHandler } from './handlers/escalation-handler.js';
export { handler as autoApprovalHandler } from './handlers/auto-approval.js';
export { handler as configureDelegationHandler } from './handlers/configure-delegation.js';
export { handler as configureTemplateHandler } from './handlers/configure-template.js';
export { handler as listPendingApprovalsHandler } from './handlers/list-pending-approvals.js';
export { handler as requestOverrideHandler } from './handlers/request-override.js';
export { handler as approveOverrideHandler } from './handlers/approve-override.js';
export { handler as listOverridesHandler } from './handlers/list-overrides.js';
export { handler as tmcDashboardHandler, bulkActionHandler as tmcBulkActionHandler, workloadHandler as tmcWorkloadHandler } from './handlers/tmc-dashboard.js';
export type {
  QueueItem,
  QueueItemType,
  QueueResponse,
  QueueSummary,
  BulkActionRequest,
  BulkActionResult,
  WorkloadDistribution,
} from './handlers/tmc-dashboard.js';

// Library exports
export { withDatabase, createDatabaseClient } from './lib/database.js';
export type { DatabaseClient, QueryResult } from './lib/database.js';
export {
  createWorkflow,
  getWorkflow,
  updateWorkflowStatus,
  recordAction,
  getWorkflowTemplate,
  storeTaskToken,
  getTaskToken,
  toApprovalWorkflow,
} from './lib/workflow-repository.js';

// Delegation utilities
export {
  createDelegation,
  findActiveDelegation,
} from './handlers/configure-delegation.js';
export type { DelegationRecord } from './handlers/configure-delegation.js';

// Override utilities
export {
  REASON_CATEGORIES,
  checkOverrideFrequencyLimit,
} from './handlers/request-override.js';
export type {
  OverrideRecord,
  ReasonCategory,
  OverrideFrequencyConfig,
} from './handlers/request-override.js';
export type { OverrideListResponse } from './handlers/list-overrides.js';
