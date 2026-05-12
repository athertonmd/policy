/**
 * Approval Workflow types
 */

import { Obligation } from './policy';

export interface ApprovalWorkflow {
  workflowId: string;
  tenantId: string;
  status: ApprovalWorkflowStatus;
  currentStage: number;
  stages: ApprovalStage[];
  initiatedAt: string;
  completedAt?: string;
  stepFunctionExecutionArn: string;
}

export type ApprovalWorkflowStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'escalated'
  | 'expired'
  | 'cancelled';

export interface ApprovalStage {
  stageNumber: number;
  type: ApprovalStageType;
  approvers: ApproverAssignment[];
  status: ApprovalStageStatus;
  slaDeadline: string;
  escalationTarget?: string;
}

export type ApprovalStageType = 'single' | 'parallel' | 'conditional';

export type ApprovalStageStatus = 'pending' | 'approved' | 'rejected' | 'skipped';

export interface ApproverAssignment {
  approverId: string;
  approverName: string;
  role: string;
  assignedAt: string;
  respondedAt?: string;
  action?: ApprovalAction;
  comment?: string;
}

export type ApprovalAction = 'approve' | 'reject' | 'request_info' | 'delegate' | 'escalate';

export interface InitiateApprovalRequest {
  tenantId: string;
  decisionId: string;
  tripRequestId: string;
  travellerId: string;
  obligations: Obligation[];
  workflowTemplateId: string;
  priority: 'normal' | 'urgent';
}

export interface ApprovalActionRequest {
  workflowId: string;
  stageNumber: number;
  approverId: string;
  action: ApprovalAction;
  comment?: string;
  delegateToId?: string;
}

export interface WorkflowTemplate {
  templateId: string;
  tenantId: string;
  name: string;
  description?: string;
  stages: StageDefinition[];
  escalationRules: EscalationRule[];
  autoApprovalConditions?: AutoApprovalCondition[];
  slaConfig: SLAConfig;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageDefinition {
  stageNumber: number;
  type: ApprovalStageType;
  approverRules: ApproverRule[];
  requiredApprovals: number;
  slaHours: number;
}

export interface ApproverRule {
  type: 'role' | 'specific_user' | 'manager' | 'cost_centre_owner';
  value: string;
}

export interface EscalationRule {
  triggerAfterHours: number;
  escalateTo: ApproverRule;
  notifyOriginalApprover: boolean;
}

export interface AutoApprovalCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface SLAConfig {
  defaultSlaHours: number;
  urgentSlaHours: number;
  reminderIntervalHours: number;
  maxEscalations: number;
}

export interface DelegationRequest {
  approverId: string;
  delegateId: string;
  startDate: string;
  endDate: string;
  scope: 'all' | 'specific_templates';
  templateIds?: string[];
}

export interface Delegation {
  delegationId: string;
  approverId: string;
  delegateId: string;
  startDate: string;
  endDate: string;
  scope: 'all' | 'specific_templates';
  templateIds?: string[];
  isActive: boolean;
  createdAt: string;
}

export interface ApprovalTask {
  workflowId: string;
  stageNumber: number;
  tripSummary: TripSummary;
  travellerName: string;
  requestedAt: string;
  slaDeadline: string;
  priority: 'normal' | 'urgent';
  status: ApprovalStageStatus;
}

export interface TripSummary {
  tripId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  totalCost: string;
  currency: string;
  tripType: string;
}

export interface ApprovalFilter {
  status?: ApprovalStageStatus;
  priority?: 'normal' | 'urgent';
  fromDate?: string;
  toDate?: string;
}
