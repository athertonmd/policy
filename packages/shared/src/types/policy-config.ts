/**
 * Policy Configuration and DSL types
 */

import { Money } from './common';

export interface CompilationResult {
  success: boolean;
  policyGraph?: PolicyGraph;
  errors?: DSLError[];
  warnings?: DSLWarning[];
}

export interface DSLError {
  type: 'syntax' | 'semantic';
  message: string;
  line: number;
  column: number;
  expected?: string[];
}

export interface DSLWarning {
  type: string;
  message: string;
  line: number;
  column: number;
}

export interface PolicyGraph {
  graphId: string;
  version: number;
  rootNodeId: string;
  nodes: PolicyNode[];
  edges: PolicyEdge[];
  metadata: PolicyGraphMetadata;
}

export interface PolicyGraphMetadata {
  createdAt: string;
  compiledFrom: string;
  checksum: string;
  rules?: PolicyRuleMetadata[];
}

export interface PolicyRuleMetadata {
  name: string;
  priority: number | null;
  entryNodeId: string;
}

export interface PolicyNode {
  nodeId: string;
  type: PolicyNodeType;
  operator?: 'and' | 'or' | 'not';
  condition?: PolicyCondition;
  action?: PolicyAction;
  terminal?: PolicyTerminal;
}

export type PolicyNodeType = 'condition' | 'action' | 'gate' | 'terminal';

export interface PolicyCondition {
  field: string;
  operator: ComparisonOp;
  value: unknown;
  valueType: 'literal' | 'reference' | 'function';
}

export type ComparisonOp =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'matches'
  | 'between';

export interface PolicyAction {
  type: 'approve' | 'reject' | 'review' | 'warn' | 'suggest_alternative' | 'add_obligation';
  params: Record<string, unknown>;
}

export interface PolicyTerminal {
  result: 'approve' | 'reject' | 'review';
  reasons: string[];
  obligations: import('./policy').Obligation[];
}

export interface PolicyEdge {
  fromNodeId: string;
  toNodeId: string;
  condition?: 'true' | 'false' | 'default';
  priority?: number;
}

export interface PolicyRule {
  ruleId: string;
  tenantId: string;
  name: string;
  description?: string;
  dslSource: string;
  policyGraph: PolicyGraph;
  priority: number;
  status: PolicyRuleStatus;
  conditions: Record<string, unknown>;
  outcomes: Record<string, unknown>;
  version: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type PolicyRuleStatus = 'draft' | 'active' | 'inactive' | 'archived';

export interface PolicyRuleInput {
  name: string;
  description?: string;
  dslSource: string;
  priority: number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface PolicyRuleVersion {
  versionId: string;
  ruleId: string;
  version: number;
  dslSource: string;
  policyGraph: PolicyGraph;
  changeDescription?: string;
  changedBy: string;
  createdAt: string;
}

export interface SimulationRequest {
  draftRules: PolicyRule[];
  historicalTripIds?: string[];
  dateRange?: DateRange;
  sampleSize?: number;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface SimulationReport {
  simulationId: string;
  totalTripsEvaluated: number;
  tripsAffected: number;
  approvalRateChange: number;
  rejectionRateChange: number;
  estimatedCostImpact: Money;
  changedOutcomes: ChangedOutcome[];
  completedAt: string;
}

export interface ChangedOutcome {
  tripId: string;
  previousResult: 'approve' | 'reject' | 'review';
  newResult: 'approve' | 'reject' | 'review';
  reason: string;
}
