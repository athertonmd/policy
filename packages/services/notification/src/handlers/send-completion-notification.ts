/**
 * Lambda handler: Send workflow completion notification.
 * EventBridge handler for ApprovalWorkflowCompleted events.
 * Sends notification to the traveller with the outcome (approved/rejected).
 * Includes any obligations or conditions attached to the approval.
 * Uses the workflow-completed email template.
 *
 * Requirements: 9.3, 9.5
 */
import type { EventBridgeEvent, Context } from 'aws-lambda';

import { sendTrackedEmail } from '../lib/email-sender.js';
import { renderTemplate, TEMPLATE_IDS } from '../lib/templates.js';

interface ApprovalWorkflowCompletedDetail {
  workflowId: string;
  tenantId: string;
  tripRequestId: string;
  travellerId: string;
  outcome: 'approved' | 'rejected';
  timestamp: string;
  traveller: {
    travellerId: string;
    travellerName: string;
    travellerEmail: string;
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
  obligations?: string[];
  conditions?: string[];
  rejectionReason?: string;
}

/**
 * EventBridge handler for ApprovalWorkflowCompleted events.
 * Notifies the traveller of the workflow outcome with details.
 */
export async function handler(
  event: EventBridgeEvent<'ApprovalWorkflowCompleted', ApprovalWorkflowCompletedDetail>,
  _context: Context
): Promise<void> {
  const detail = event.detail;
  const startTime = Date.now();

  console.log('Processing ApprovalWorkflowCompleted event', {
    workflowId: detail.workflowId,
    tenantId: detail.tenantId,
    outcome: detail.outcome,
    travellerId: detail.travellerId,
  });

  // Validate required fields
  if (!detail.traveller?.travellerEmail) {
    console.error('Missing traveller email in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing traveller email in event detail');
  }

  if (!detail.tripSummary) {
    console.error('Missing trip summary in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing trip summary in event detail');
  }

  if (!detail.outcome) {
    console.error('Missing outcome in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing outcome in event detail');
  }

  // Build conditions string from obligations and conditions arrays
  const conditionParts: string[] = [];
  if (detail.obligations && detail.obligations.length > 0) {
    conditionParts.push(...detail.obligations);
  }
  if (detail.conditions && detail.conditions.length > 0) {
    conditionParts.push(...detail.conditions);
  }
  if (detail.rejectionReason) {
    conditionParts.push(detail.rejectionReason);
  }

  const conditionsText = conditionParts.length > 0 ? conditionParts.join('; ') : undefined;

  // Render the workflow-completed email template
  const rendered = renderTemplate(TEMPLATE_IDS.WORKFLOW_COMPLETED, {
    travellerName: detail.traveller.travellerName,
    tripOrigin: detail.tripSummary.origin,
    tripDestination: detail.tripSummary.destination,
    departureDate: detail.tripSummary.departureDate,
    returnDate: detail.tripSummary.returnDate,
    totalCost: detail.tripSummary.totalCost,
    currency: detail.tripSummary.currency,
    outcome: detail.outcome,
    conditions: conditionsText,
    workflowId: detail.workflowId,
  });

  // Send the email via SES
  const sendResult = await sendTrackedEmail(
    {
      to: detail.traveller.travellerEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    {
      notificationType: 'workflow-completed',
      workflowId: detail.workflowId,
      tenantId: detail.tenantId,
    }
  );

  const totalElapsed = Date.now() - startTime;

  console.log('Completion notification sent to traveller', {
    workflowId: detail.workflowId,
    messageId: sendResult.messageId,
    travellerId: detail.travellerId,
    outcome: detail.outcome,
    elapsedMs: totalElapsed,
  });

  if (totalElapsed > 60_000) {
    console.warn('Notification SLA breached: exceeded 60-second target', {
      workflowId: detail.workflowId,
      elapsedMs: totalElapsed,
    });
  }
}
