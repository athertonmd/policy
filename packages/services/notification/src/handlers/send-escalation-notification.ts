/**
 * Lambda handler: Send escalation notifications.
 * EventBridge handler for ApprovalEscalated events.
 * Sends notification to BOTH the original approver (informing them of escalation)
 * and the escalation target (requesting their action).
 * Uses the escalation email template with action links for the escalation target.
 *
 * Requirements: 9.3, 9.5
 */
import type { EventBridgeEvent, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { generateActionLinks } from '../lib/action-link-generator.js';
import { sendTrackedEmail } from '../lib/email-sender.js';
import { renderTemplate, TEMPLATE_IDS } from '../lib/templates.js';

const secretsClient = new SecretsManagerClient({});

const ACTION_LINK_SECRET_ARN = process.env.ACTION_LINK_SECRET_ARN ?? '';
const ACTION_LINK_BASE_URL = process.env.ACTION_LINK_BASE_URL ?? '';

interface ApprovalEscalatedDetail {
  workflowId: string;
  tenantId: string;
  tripRequestId: string;
  stageNumber: number;
  escalationReason: string;
  timestamp: string;
  originalApprover: {
    approverId: string;
    approverName: string;
    approverEmail: string;
  };
  escalationTarget: {
    approverId: string;
    approverName: string;
    approverEmail: string;
  };
  tripSummary: {
    tripId: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    totalCost: string;
    currency: string;
    tripType: string;
  };
  travellerName: string;
}

let cachedSecret: string | null = null;

async function getActionLinkSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  if (!ACTION_LINK_SECRET_ARN) {
    return process.env.ACTION_LINK_SECRET ?? 'dev-secret-key';
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: ACTION_LINK_SECRET_ARN })
  );
  cachedSecret = result.SecretString ?? '';
  return cachedSecret;
}

/**
 * EventBridge handler for ApprovalEscalated events.
 * Sends notifications to both the original approver and the escalation target.
 */
export async function handler(
  event: EventBridgeEvent<'ApprovalEscalated', ApprovalEscalatedDetail>,
  _context: Context
): Promise<void> {
  const detail = event.detail;
  const startTime = Date.now();

  console.log('Processing ApprovalEscalated event', {
    workflowId: detail.workflowId,
    tenantId: detail.tenantId,
    escalationReason: detail.escalationReason,
    originalApproverId: detail.originalApprover.approverId,
    escalationTargetId: detail.escalationTarget.approverId,
  });

  // Validate required fields
  if (!detail.originalApprover?.approverEmail) {
    console.error('Missing original approver email in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing original approver email in event detail');
  }

  if (!detail.escalationTarget?.approverEmail) {
    console.error('Missing escalation target email in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing escalation target email in event detail');
  }

  if (!detail.tripSummary) {
    console.error('Missing trip summary in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing trip summary in event detail');
  }

  const secret = await getActionLinkSecret();

  // Generate action links for the escalation target
  const actionLinks = await generateActionLinks(
    {
      workflowId: detail.workflowId,
      stageNumber: detail.stageNumber,
      action: 'approve',
      approverId: detail.escalationTarget.approverId,
      tenantId: detail.tenantId,
    },
    {
      secret,
      baseUrl: ACTION_LINK_BASE_URL,
      expiryHours: 24,
    }
  );

  const approveLink = actionLinks.find((l) => l.action === 'approve');
  const rejectLink = actionLinks.find((l) => l.action === 'reject');
  const requestInfoLink = actionLinks.find((l) => l.action === 'request_info');

  // 1. Send notification to the escalation target (requesting their action)
  const escalationTargetTemplate = renderTemplate(TEMPLATE_IDS.APPROVAL_ESCALATION, {
    approverName: detail.escalationTarget.approverName,
    travellerName: detail.travellerName,
    tripOrigin: detail.tripSummary.origin,
    tripDestination: detail.tripSummary.destination,
    departureDate: detail.tripSummary.departureDate,
    returnDate: detail.tripSummary.returnDate,
    totalCost: detail.tripSummary.totalCost,
    currency: detail.tripSummary.currency,
    escalationReason: detail.escalationReason,
    originalApproverName: detail.originalApprover.approverName,
    workflowId: detail.workflowId,
    approveUrl: approveLink?.url ?? '',
    rejectUrl: rejectLink?.url ?? '',
    requestInfoUrl: requestInfoLink?.url ?? '',
    expiresAt: approveLink?.expiresAt ?? '',
  });

  const escalationTargetResult = await sendTrackedEmail(
    {
      to: detail.escalationTarget.approverEmail,
      subject: escalationTargetTemplate.subject,
      html: escalationTargetTemplate.html,
      text: escalationTargetTemplate.text,
    },
    {
      notificationType: 'escalation-target',
      workflowId: detail.workflowId,
      tenantId: detail.tenantId,
    }
  );

  console.log('Escalation notification sent to target', {
    workflowId: detail.workflowId,
    messageId: escalationTargetResult.messageId,
    escalationTargetId: detail.escalationTarget.approverId,
  });

  // 2. Send notification to the original approver (informing them of escalation)
  const originalApproverTemplate = renderTemplate(TEMPLATE_IDS.APPROVAL_ESCALATION, {
    approverName: detail.originalApprover.approverName,
    travellerName: detail.travellerName,
    tripOrigin: detail.tripSummary.origin,
    tripDestination: detail.tripSummary.destination,
    totalCost: detail.tripSummary.totalCost,
    currency: detail.tripSummary.currency,
    escalationReason: detail.escalationReason,
    originalApproverName: detail.originalApprover.approverName,
    workflowId: detail.workflowId,
    // No action links for the original approver — they are being informed, not asked to act
    approveUrl: '',
    rejectUrl: '',
    requestInfoUrl: '',
    expiresAt: '',
  });

  // Override subject for the original approver to clarify it's informational
  const originalApproverSubject = `Notice: Your pending approval for ${detail.travellerName} has been escalated`;

  const originalApproverResult = await sendTrackedEmail(
    {
      to: detail.originalApprover.approverEmail,
      subject: originalApproverSubject,
      html: originalApproverTemplate.html,
      text: originalApproverTemplate.text,
    },
    {
      notificationType: 'escalation-notice',
      workflowId: detail.workflowId,
      tenantId: detail.tenantId,
    }
  );

  console.log('Escalation notice sent to original approver', {
    workflowId: detail.workflowId,
    messageId: originalApproverResult.messageId,
    originalApproverId: detail.originalApprover.approverId,
  });

  const totalElapsed = Date.now() - startTime;

  console.log('Escalation notifications complete', {
    workflowId: detail.workflowId,
    elapsedMs: totalElapsed,
  });

  if (totalElapsed > 60_000) {
    console.warn('Notification SLA breached: exceeded 60-second target', {
      workflowId: detail.workflowId,
      elapsedMs: totalElapsed,
    });
  }
}
