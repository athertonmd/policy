/**
 * Lambda handler: Process inbound email replies for approval actions.
 * Triggered by SES receipt rule when an approver replies to a notification email.
 *
 * Parses the email body for APPROVE/REJECT/INFO keywords,
 * verifies the sender matches the designated approver,
 * and submits the action to the approval workflow service.
 *
 * Requirements: 9.2, 27.4, 27.5
 */
import type { SESEvent, SESEventRecord, Context } from 'aws-lambda';

import { parseReplyAction, verifySenderEmail } from '../lib/email-action-validator.js';
import { sendEmail } from '../lib/email-sender.js';

const APPROVAL_API_URL = process.env.APPROVAL_API_URL ?? '';
const PLATFORM_UI_URL = process.env.PLATFORM_UI_URL ?? 'https://app.travel-policy.example.com';

/**
 * Expected custom headers added to outbound notification emails:
 * - X-Workflow-Id: The approval workflow ID
 * - X-Stage-Number: The current stage number
 * - X-Approver-Id: The designated approver's ID
 * - X-Tenant-Id: The tenant ID
 * - X-Approver-Email: The expected approver email for verification
 */
interface WorkflowContext {
  workflowId: string;
  stageNumber: number;
  approverId: string;
  tenantId: string;
  approverEmail: string;
}

export async function handler(event: SESEvent, _context: Context): Promise<void> {
  const requestId = _context.awsRequestId;

  console.log('Processing inbound email reply', {
    requestId,
    recordCount: event.Records.length,
  });

  for (const record of event.Records) {
    await processRecord(record, requestId);
  }
}

async function processRecord(record: SESEventRecord, requestId: string): Promise<void> {
  const sesMessage = record.ses;
  const mail = sesMessage.mail;
  const senderEmail = mail.source;
  const subject = mail.commonHeaders?.subject ?? '';
  const messageId = mail.messageId;

  console.log('Processing email record', {
    requestId,
    messageId,
    senderEmail,
    subject,
  });

  // Extract workflow context from email headers
  const workflowContext = extractWorkflowContext(mail.headers);

  if (!workflowContext) {
    // Try extracting from subject line as fallback
    const subjectContext = extractWorkflowContextFromSubject(subject);
    if (!subjectContext) {
      console.warn('Could not extract workflow context from email', {
        requestId,
        messageId,
        senderEmail,
      });
      return;
    }
    // Use subject-based context (limited info)
    console.log('Extracted workflow context from subject', {
      requestId,
      workflowId: subjectContext.workflowId,
    });
  }

  const context = workflowContext ?? extractWorkflowContextFromSubject(subject);
  if (!context) {
    return;
  }

  // Verify sender email matches the designated approver
  if (!verifySenderEmail(senderEmail, context.approverEmail)) {
    console.warn('Sender email does not match designated approver', {
      requestId,
      messageId,
      senderEmail,
      expectedApprover: context.approverEmail,
      workflowId: context.workflowId,
    });
    // Log and ignore — do not process actions from unauthorized senders
    return;
  }

  // Parse the email body for action keywords
  const emailBody = extractEmailBody(record);
  const parsedAction = parseReplyAction(emailBody);

  if (!parsedAction) {
    console.log('No valid action keyword found in reply', {
      requestId,
      messageId,
      senderEmail,
      workflowId: context.workflowId,
    });

    // Send a reply explaining valid commands
    await sendHelpReply(senderEmail, context.workflowId);
    return;
  }

  console.log('Parsed reply action', {
    requestId,
    messageId,
    action: parsedAction.action,
    keyword: parsedAction.keyword,
    workflowId: context.workflowId,
  });

  // Submit the approval action
  try {
    await submitApprovalAction({
      workflowId: context.workflowId,
      stageNumber: context.stageNumber,
      approverId: context.approverId,
      action: parsedAction.action,
      tenantId: context.tenantId,
      source: 'email',
    });

    console.log('Reply-based approval action submitted', {
      requestId,
      messageId,
      workflowId: context.workflowId,
      action: parsedAction.action,
    });
  } catch (error) {
    console.error('Failed to submit reply-based approval action', {
      requestId,
      messageId,
      workflowId: context.workflowId,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/**
 * Extract workflow context from custom email headers.
 */
function extractWorkflowContext(
  headers: Array<{ name: string; value: string }> | undefined
): WorkflowContext | null {
  if (!headers || !Array.isArray(headers)) {
    return null;
  }

  const headerMap = new Map<string, string>();
  for (const header of headers) {
    headerMap.set(header.name.toLowerCase(), header.value);
  }

  const workflowId = headerMap.get('x-workflow-id');
  const stageNumberStr = headerMap.get('x-stage-number');
  const approverId = headerMap.get('x-approver-id');
  const tenantId = headerMap.get('x-tenant-id');
  const approverEmail = headerMap.get('x-approver-email');

  if (!workflowId || !stageNumberStr || !approverId || !tenantId || !approverEmail) {
    return null;
  }

  const stageNumber = parseInt(stageNumberStr, 10);
  if (isNaN(stageNumber)) {
    return null;
  }

  return { workflowId, stageNumber, approverId, tenantId, approverEmail };
}

/**
 * Extract workflow context from the email subject line.
 * Expected format: "[Approval Required] Trip Request - WF:{workflowId}"
 */
function extractWorkflowContextFromSubject(subject: string): WorkflowContext | null {
  const workflowMatch = subject.match(/WF:([a-zA-Z0-9-]+)/);
  if (!workflowMatch) {
    return null;
  }

  // Subject-based extraction provides limited context
  // In production, we'd look up the workflow to get full context
  return {
    workflowId: workflowMatch[1],
    stageNumber: 1, // Default; would be resolved from workflow state
    approverId: '', // Would be resolved from workflow state
    tenantId: '', // Would be resolved from workflow state
    approverEmail: '', // Cannot verify sender without full context
  };
}

/**
 * Extract the email body text from the SES event record.
 * SES stores the raw email in S3; for the Lambda event, we get basic content.
 */
function extractEmailBody(record: SESEventRecord): string {
  // In the SES Lambda event, the content is available via the receipt
  // For full body parsing, the raw email would be fetched from S3
  // Here we use what's available in the event
  const content = (record as unknown as { ses: { content?: string } }).ses.content;
  if (content) {
    return extractTextFromRawEmail(content);
  }

  // Fallback: use subject as a simple indicator (limited)
  return record.ses.mail.commonHeaders?.subject ?? '';
}

/**
 * Extract plain text body from a raw email string.
 * Handles multipart MIME by finding the text/plain section.
 */
function extractTextFromRawEmail(rawEmail: string): string {
  // Look for text/plain content in multipart email
  const textPlainMatch = rawEmail.match(
    /Content-Type:\s*text\/plain[^\r\n]*\r?\n\r?\n([\s\S]*?)(?:\r?\n--|\r?\n\r?\n--)/i
  );
  if (textPlainMatch) {
    return textPlainMatch[1].trim();
  }

  // If not multipart, try to get body after headers
  const headerBodySplit = rawEmail.split(/\r?\n\r?\n/);
  if (headerBodySplit.length > 1) {
    return headerBodySplit.slice(1).join('\n\n').trim();
  }

  return rawEmail;
}

/**
 * Submit the approval action to the approval workflow service.
 */
async function submitApprovalAction(params: {
  workflowId: string;
  stageNumber: number;
  approverId: string;
  action: string;
  tenantId: string;
  source: string;
}): Promise<void> {
  const apiUrl = APPROVAL_API_URL || process.env.APPROVAL_API_URL;

  if (!apiUrl) {
    console.log('No APPROVAL_API_URL configured, logging action', params);
    return;
  }

  const response = await fetch(`${apiUrl}/v1/approvals/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': params.tenantId,
      'X-Source': params.source,
    },
    body: JSON.stringify({
      workflowId: params.workflowId,
      stageNumber: params.stageNumber,
      approverId: params.approverId,
      action: params.action,
      comment: `Action taken via email reply (keyword-based)`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Approval API returned ${response.status}: ${body}`);
  }
}

/**
 * Send a help reply to the sender explaining valid commands.
 */
async function sendHelpReply(recipientEmail: string, workflowId: string): Promise<void> {
  try {
    await sendEmail({
      to: recipientEmail,
      subject: `Re: Approval Action - How to respond`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">How to respond by email</h2>
          <p style="color: #475569;">To take action on this approval request, reply with one of the following keywords as the first word in your reply:</p>
          <ul style="color: #475569;">
            <li><strong>APPROVE</strong> — Approve the trip request</li>
            <li><strong>REJECT</strong> — Reject the trip request</li>
            <li><strong>INFO</strong> — Request more information</li>
          </ul>
          <p style="color: #475569;">Alternatively, you can take action directly in the platform:</p>
          <p><a href="${PLATFORM_UI_URL}/approvals/${workflowId}" style="color: #2563eb;">View in Platform →</a></p>
        </div>
      `,
      text: `How to respond by email\n\nTo take action on this approval request, reply with one of the following keywords as the first word in your reply:\n\n- APPROVE — Approve the trip request\n- REJECT — Reject the trip request\n- INFO — Request more information\n\nAlternatively, you can take action directly in the platform:\n${PLATFORM_UI_URL}/approvals/${workflowId}`,
    });
  } catch (error) {
    console.error('Failed to send help reply', {
      recipientEmail,
      workflowId,
      error: error instanceof Error ? error.message : error,
    });
  }
}
