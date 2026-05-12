/**
 * Lambda handler: Send generic platform notifications.
 * Supports: workflow completed, escalation, budget threshold, etc.
 * Sends email via SES.
 *
 * Requirements: 9.3, 9.5
 */
import type { EventBridgeEvent, Context } from 'aws-lambda';

import { sendTrackedEmail } from '../lib/email-sender.js';
import { renderTemplate } from '../lib/templates.js';

interface NotificationEventDetail {
  tenantId: string;
  recipientEmail: string;
  recipientName?: string;
  templateId: string;
  templateData: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  workflowId?: string;
  correlationId?: string;
}

/**
 * Generic notification handler for various platform events.
 * Triggered by EventBridge events with detail-type 'PlatformNotification'.
 */
export async function handler(
  event: EventBridgeEvent<'PlatformNotification', NotificationEventDetail>,
  _context: Context
): Promise<void> {
  const detail = event.detail;
  const startTime = Date.now();

  console.log('Processing PlatformNotification event', {
    tenantId: detail.tenantId,
    templateId: detail.templateId,
    recipientEmail: detail.recipientEmail,
    priority: detail.priority ?? 'normal',
    correlationId: detail.correlationId,
  });

  if (!detail.recipientEmail) {
    console.error('Missing recipient email in notification event');
    throw new Error('Missing recipient email in notification event');
  }

  if (!detail.templateId) {
    console.error('Missing templateId in notification event');
    throw new Error('Missing templateId in notification event');
  }

  // Render the email template
  const templateData = {
    ...detail.templateData,
    approverName: detail.recipientName ?? (detail.templateData.approverName as string | undefined),
    travellerName: detail.templateData.travellerName as string | undefined,
  };

  const rendered = renderTemplate(detail.templateId, templateData);

  // Send the email via SES
  const sendResult = await sendTrackedEmail(
    {
      to: detail.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    {
      notificationType: detail.templateId,
      workflowId: detail.workflowId,
      tenantId: detail.tenantId,
    }
  );

  const totalElapsed = Date.now() - startTime;

  console.log('Notification sent', {
    templateId: detail.templateId,
    messageId: sendResult.messageId,
    recipientEmail: detail.recipientEmail,
    elapsedMs: totalElapsed,
  });

  if (totalElapsed > 60_000) {
    console.warn('Notification SLA breached: exceeded 60-second target', {
      templateId: detail.templateId,
      elapsedMs: totalElapsed,
    });
  }
}
