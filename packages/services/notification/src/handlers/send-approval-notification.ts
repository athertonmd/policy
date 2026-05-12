/**
 * Lambda handler: Send approval notification.
 * EventBridge handler triggered by ApprovalWorkflowInitiated events.
 * Sends email to the assigned approver with trip summary and action links.
 * Action links are JWT-signed URLs with 24h expiry (approve, reject, request-info).
 * Must send within 60 seconds of the event.
 *
 * Requirements: 9.1, 9.4, 9.5
 */
import type { EventBridgeEvent, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { generateActionLinks } from '../lib/action-link-generator.js';
import { sendTrackedEmail } from '../lib/email-sender.js';
import { renderTemplate, TEMPLATE_IDS } from '../lib/templates.js';
import { scheduleReminders } from '../lib/reminder-scheduler.js';

const secretsClient = new SecretsManagerClient({});

const ACTION_LINK_SECRET_ARN = process.env.ACTION_LINK_SECRET_ARN ?? '';
const ACTION_LINK_BASE_URL = process.env.ACTION_LINK_BASE_URL ?? '';
const REMINDER_TARGET_ARN = process.env.REMINDER_TARGET_ARN ?? '';
const REMINDER_ROLE_ARN = process.env.REMINDER_ROLE_ARN ?? '';
const DEFAULT_REMINDER_INTERVAL_HOURS = parseInt(process.env.REMINDER_INTERVAL_HOURS ?? '4', 10);
const DEFAULT_MAX_REMINDERS = parseInt(process.env.MAX_REMINDERS ?? '3', 10);

interface ApprovalWorkflowInitiatedDetail {
  workflowId: string;
  tenantId: string;
  tripRequestId: string;
  travellerId: string;
  priority: 'normal' | 'urgent';
  templateId: string;
  requestId: string;
  timestamp: string;
  // Enriched fields (populated by the event or looked up)
  approver?: {
    approverId: string;
    approverName: string;
    approverEmail: string;
  };
  tripSummary?: {
    tripId: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate?: string;
    totalCost: string;
    currency: string;
    tripType: string;
  };
  travellerName?: string;
  stageNumber?: number;
  reminderIntervalHours?: number;
  maxReminders?: number;
}

let cachedSecret: string | null = null;

async function getActionLinkSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  if (!ACTION_LINK_SECRET_ARN) {
    // Fallback for local development
    return process.env.ACTION_LINK_SECRET ?? 'dev-secret-key';
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: ACTION_LINK_SECRET_ARN })
  );
  cachedSecret = result.SecretString ?? '';
  return cachedSecret;
}

export async function handler(
  event: EventBridgeEvent<'ApprovalWorkflowInitiated', ApprovalWorkflowInitiatedDetail>,
  _context: Context
): Promise<void> {
  const detail = event.detail;
  const startTime = Date.now();

  console.log('Processing ApprovalWorkflowInitiated event', {
    workflowId: detail.workflowId,
    tenantId: detail.tenantId,
    requestId: detail.requestId,
  });

  // Validate required fields
  if (!detail.approver?.approverId || !detail.approver?.approverEmail) {
    console.error('Missing approver information in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing approver information in event detail');
  }

  if (!detail.tripSummary) {
    console.error('Missing trip summary in event detail', {
      workflowId: detail.workflowId,
    });
    throw new Error('Missing trip summary in event detail');
  }

  const secret = await getActionLinkSecret();
  const stageNumber = detail.stageNumber ?? 1;

  // Generate secure action links with 24h expiry
  const actionLinks = await generateActionLinks(
    {
      workflowId: detail.workflowId,
      stageNumber,
      action: 'approve', // Base payload; individual actions are generated per link
      approverId: detail.approver.approverId,
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

  // Render the approval request email template
  const rendered = renderTemplate(TEMPLATE_IDS.APPROVAL_REQUEST, {
    approverName: detail.approver.approverName,
    travellerName: detail.travellerName ?? 'Unknown Traveller',
    tripOrigin: detail.tripSummary.origin,
    tripDestination: detail.tripSummary.destination,
    departureDate: detail.tripSummary.departureDate,
    returnDate: detail.tripSummary.returnDate,
    totalCost: detail.tripSummary.totalCost,
    currency: detail.tripSummary.currency,
    tripType: detail.tripSummary.tripType,
    workflowId: detail.workflowId,
    approveUrl: approveLink?.url ?? '',
    rejectUrl: rejectLink?.url ?? '',
    requestInfoUrl: requestInfoLink?.url ?? '',
    expiresAt: approveLink?.expiresAt ?? '',
  });

  // Send the email via SES
  const sendResult = await sendTrackedEmail(
    {
      to: detail.approver.approverEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    {
      notificationType: 'approval-request',
      workflowId: detail.workflowId,
      tenantId: detail.tenantId,
    }
  );

  console.log('Approval notification sent', {
    workflowId: detail.workflowId,
    messageId: sendResult.messageId,
    approverId: detail.approver.approverId,
    elapsedMs: Date.now() - startTime,
  });

  // Schedule reminders at configurable intervals
  const reminderIntervalHours = detail.reminderIntervalHours ?? DEFAULT_REMINDER_INTERVAL_HOURS;
  const maxReminders = detail.maxReminders ?? DEFAULT_MAX_REMINDERS;

  if (REMINDER_TARGET_ARN && REMINDER_ROLE_ARN) {
    try {
      const reminder = await scheduleReminders({
        workflowId: detail.workflowId,
        stageNumber,
        approverId: detail.approver.approverId,
        tenantId: detail.tenantId,
        intervalHours: reminderIntervalHours,
        maxReminders,
        targetArn: REMINDER_TARGET_ARN,
        roleArn: REMINDER_ROLE_ARN,
      });

      console.log('Reminder scheduled', {
        workflowId: detail.workflowId,
        scheduleName: reminder.scheduleName,
        nextFireAt: reminder.nextFireAt,
      });
    } catch (reminderError) {
      // Log but don't fail the notification — reminders are best-effort
      console.error('Failed to schedule reminders', {
        workflowId: detail.workflowId,
        error: reminderError,
      });
    }
  }

  const totalElapsed = Date.now() - startTime;
  if (totalElapsed > 60_000) {
    console.warn('Notification SLA breached: exceeded 60-second target', {
      workflowId: detail.workflowId,
      elapsedMs: totalElapsed,
    });
  }
}
