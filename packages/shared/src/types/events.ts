/**
 * Domain Event types (EventBridge)
 */

export interface DomainEvent {
  version: '1.0';
  id: string;
  source: 'travel-policy-platform';
  'detail-type': EventType;
  time: string;
  region: string;
  detail: EventDetail;
}

export interface EventDetail {
  tenantId: string;
  correlationId: string;
  aggregateId: string;
  aggregateType: string;
  payload: Record<string, unknown>;
}

export type EventType =
  | 'PolicyDecisionMade'
  | 'ApprovalWorkflowInitiated'
  | 'ApprovalActionTaken'
  | 'ApprovalWorkflowCompleted'
  | 'ApprovalEscalated'
  | 'BookingReceived'
  | 'BookingValidated'
  | 'ProfileUpdated'
  | 'BudgetThresholdBreached'
  | 'PolicyRuleChanged'
  | 'TenantProvisioned'
  | 'ComplianceAlertRaised';
