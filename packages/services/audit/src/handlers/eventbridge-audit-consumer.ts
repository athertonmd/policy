import type { EventBridgeEvent, Context } from 'aws-lambda';
import type { AuditEvent, AuditActionType } from '@travel-policy/shared';
import { recordAuditEvent } from './record-event.js';

/**
 * EventBridge event detail structure for platform domain events.
 */
interface PlatformEventDetail {
  tenantId: string;
  userId?: string;
  actionType?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'failure' | 'denied';
  sourceIp?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Maps an EventBridge detail-type to an AuditActionType.
 * Platform domain events are mapped to their corresponding audit action types.
 */
function mapDetailTypeToActionType(detailType: string): AuditActionType {
  const mapping: Record<string, AuditActionType> = {
    'PolicyDecisionMade': 'policy_decision',
    'PolicyDecision': 'policy_decision',
    'ApprovalActionTaken': 'approval_action',
    'ApprovalAction': 'approval_action',
    'ApprovalWorkflowCompleted': 'approval_action',
    'ApprovalWorkflowInitiated': 'approval_action',
    'ConfigurationChanged': 'config_change',
    'ConfigChange': 'config_change',
    'PolicyRuleActivated': 'config_change',
    'PolicyRuleUpdated': 'config_change',
    'UserAuthenticated': 'authentication',
    'AuthenticationFailed': 'authentication',
    'Authentication': 'authentication',
    'DataAccessed': 'data_access',
    'DataAccess': 'data_access',
    'DataExported': 'data_export',
    'DataExport': 'data_export',
    'UserProvisioned': 'user_provisioning',
    'UserDeactivated': 'user_provisioning',
    'UserProvisioning': 'user_provisioning',
    'PolicyOverrideRequested': 'policy_override',
    'PolicyOverrideApproved': 'policy_override',
    'PolicyOverride': 'policy_override',
  };

  return mapping[detailType] || 'data_access';
}

/**
 * Maps an EventBridge event to an AuditEvent format.
 */
function mapToAuditEvent(
  event: EventBridgeEvent<'any', PlatformEventDetail>
): AuditEvent {
  const detail = event.detail;

  return {
    tenantId: detail.tenantId || 'unknown',
    userId: detail.userId || 'system',
    actionType: (detail.actionType as AuditActionType) || mapDetailTypeToActionType(event['detail-type']),
    resourceType: detail.resourceType || event['detail-type'],
    resourceId: detail.resourceId || event.id,
    outcome: detail.outcome || 'success',
    sourceIp: detail.sourceIp || 'internal',
    correlationId: detail.correlationId || event.id,
    metadata: {
      ...detail.metadata,
      eventBridgeSource: event.source,
      eventBridgeDetailType: event['detail-type'],
      eventBridgeTime: event.time,
    },
  };
}

/**
 * Lambda handler that subscribes to EventBridge platform domain events
 * and records them as audit entries.
 *
 * This handler captures all platform events for automatic audit logging,
 * ensuring comprehensive audit coverage without requiring each service
 * to explicitly call the audit API.
 */
export async function handler(
  event: EventBridgeEvent<'any', PlatformEventDetail>,
  _context: Context
): Promise<void> {
  try {
    const auditEvent = mapToAuditEvent(event);
    await recordAuditEvent(auditEvent);

    console.info('Audit event recorded from EventBridge', {
      detailType: event['detail-type'],
      source: event.source,
      tenantId: auditEvent.tenantId,
      actionType: auditEvent.actionType,
    });
  } catch (error) {
    console.error('Failed to record audit event from EventBridge:', {
      error,
      detailType: event['detail-type'],
      source: event.source,
      eventId: event.id,
    });
    // Re-throw to trigger EventBridge retry/DLQ
    throw error;
  }
}
