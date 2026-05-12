/**
 * Email templates for notification service.
 * Provides HTML and plain text versions for:
 * - Approval request
 * - Reminder
 * - Escalation
 * - Workflow completed
 *
 * Requirements: 9.1, 9.4, 9.5
 */

export interface TemplateData {
  approverName?: string;
  travellerName?: string;
  tripOrigin?: string;
  tripDestination?: string;
  departureDate?: string;
  returnDate?: string;
  totalCost?: string;
  currency?: string;
  tripType?: string;
  workflowId?: string;
  approveUrl?: string;
  rejectUrl?: string;
  requestInfoUrl?: string;
  expiresAt?: string;
  escalationReason?: string;
  originalApproverName?: string;
  outcome?: string;
  conditions?: string;
  reminderCount?: number;
  slaDeadline?: string;
  [key: string]: unknown;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Render an email template by ID with the given data.
 */
export function renderTemplate(templateId: string, data: TemplateData): RenderedTemplate {
  const renderer = templateRegistry[templateId];
  if (!renderer) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return renderer(data);
}

type TemplateRenderer = (data: TemplateData) => RenderedTemplate;

const templateRegistry: Record<string, TemplateRenderer> = {
  'approval-request': renderApprovalRequest,
  'approval-reminder': renderApprovalReminder,
  'approval-escalation': renderApprovalEscalation,
  'workflow-completed': renderWorkflowCompleted,
};

function renderApprovalRequest(data: TemplateData): RenderedTemplate {
  const subject = `Action Required: Approve trip for ${data.travellerName ?? 'traveller'} to ${data.tripDestination ?? 'destination'}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">Trip Approval Required</h2>
  <p>Hi ${escapeHtml(data.approverName ?? 'Approver')},</p>
  <p>A trip request requires your approval:</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Traveller</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.travellerName ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Route</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.tripOrigin ?? '')} → ${escapeHtml(data.tripDestination ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Dates</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.departureDate ?? '')}${data.returnDate ? ` – ${escapeHtml(data.returnDate)}` : ''}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Cost</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.totalCost ?? '')} ${escapeHtml(data.currency ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Type</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.tripType ?? '')}</td></tr>
  </table>
  <div style="margin: 24px 0;">
    <a href="${escapeHtml(data.approveUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Approve</a>
    <a href="${escapeHtml(data.rejectUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Reject</a>
    <a href="${escapeHtml(data.requestInfoUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #ffc107; color: #333; text-decoration: none; border-radius: 4px;">Request Info</a>
  </div>
  <p style="color: #666; font-size: 12px;">This link expires at ${escapeHtml(data.expiresAt ?? '')}. Workflow ID: ${escapeHtml(data.workflowId ?? '')}</p>
</body>
</html>`;

  const text = `Trip Approval Required

Hi ${data.approverName ?? 'Approver'},

A trip request requires your approval:

Traveller: ${data.travellerName ?? ''}
Route: ${data.tripOrigin ?? ''} → ${data.tripDestination ?? ''}
Dates: ${data.departureDate ?? ''}${data.returnDate ? ` – ${data.returnDate}` : ''}
Cost: ${data.totalCost ?? ''} ${data.currency ?? ''}
Type: ${data.tripType ?? ''}

Actions:
- Approve: ${data.approveUrl ?? ''}
- Reject: ${data.rejectUrl ?? ''}
- Request Info: ${data.requestInfoUrl ?? ''}

This link expires at ${data.expiresAt ?? ''}. Workflow ID: ${data.workflowId ?? ''}`;

  return { subject, html, text };
}

function renderApprovalReminder(data: TemplateData): RenderedTemplate {
  const reminderLabel = data.reminderCount ? `(Reminder #${data.reminderCount})` : '(Reminder)';
  const subject = `${reminderLabel} Pending approval: trip for ${data.travellerName ?? 'traveller'} to ${data.tripDestination ?? 'destination'}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #e67e22;">Reminder: Trip Approval Pending</h2>
  <p>Hi ${escapeHtml(data.approverName ?? 'Approver')},</p>
  <p>This is a reminder that a trip request is still awaiting your approval.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Traveller</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.travellerName ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Route</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.tripOrigin ?? '')} → ${escapeHtml(data.tripDestination ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">SLA Deadline</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.slaDeadline ?? '')}</td></tr>
  </table>
  <div style="margin: 24px 0;">
    <a href="${escapeHtml(data.approveUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Approve</a>
    <a href="${escapeHtml(data.rejectUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Reject</a>
    <a href="${escapeHtml(data.requestInfoUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #ffc107; color: #333; text-decoration: none; border-radius: 4px;">Request Info</a>
  </div>
  <p style="color: #666; font-size: 12px;">This link expires at ${escapeHtml(data.expiresAt ?? '')}.</p>
</body>
</html>`;

  const text = `Reminder: Trip Approval Pending

Hi ${data.approverName ?? 'Approver'},

This is a reminder that a trip request is still awaiting your approval.

Traveller: ${data.travellerName ?? ''}
Route: ${data.tripOrigin ?? ''} → ${data.tripDestination ?? ''}
SLA Deadline: ${data.slaDeadline ?? ''}

Actions:
- Approve: ${data.approveUrl ?? ''}
- Reject: ${data.rejectUrl ?? ''}
- Request Info: ${data.requestInfoUrl ?? ''}

This link expires at ${data.expiresAt ?? ''}.`;

  return { subject, html, text };
}

function renderApprovalEscalation(data: TemplateData): RenderedTemplate {
  const subject = `Escalation: Trip approval for ${data.travellerName ?? 'traveller'} requires your attention`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #dc3545;">Escalated Approval Request</h2>
  <p>Hi ${escapeHtml(data.approverName ?? 'Approver')},</p>
  <p>A trip approval has been escalated to you.</p>
  <p><strong>Reason:</strong> ${escapeHtml(data.escalationReason ?? 'SLA deadline exceeded')}</p>
  ${data.originalApproverName ? `<p><strong>Originally assigned to:</strong> ${escapeHtml(data.originalApproverName)}</p>` : ''}
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Traveller</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.travellerName ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Route</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.tripOrigin ?? '')} → ${escapeHtml(data.tripDestination ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Cost</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.totalCost ?? '')} ${escapeHtml(data.currency ?? '')}</td></tr>
  </table>
  <div style="margin: 24px 0;">
    <a href="${escapeHtml(data.approveUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Approve</a>
    <a href="${escapeHtml(data.rejectUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin-right: 8px;">Reject</a>
    <a href="${escapeHtml(data.requestInfoUrl ?? '#')}" style="display: inline-block; padding: 12px 24px; background: #ffc107; color: #333; text-decoration: none; border-radius: 4px;">Request Info</a>
  </div>
  <p style="color: #666; font-size: 12px;">This link expires at ${escapeHtml(data.expiresAt ?? '')}.</p>
</body>
</html>`;

  const text = `Escalated Approval Request

Hi ${data.approverName ?? 'Approver'},

A trip approval has been escalated to you.

Reason: ${data.escalationReason ?? 'SLA deadline exceeded'}
${data.originalApproverName ? `Originally assigned to: ${data.originalApproverName}` : ''}

Traveller: ${data.travellerName ?? ''}
Route: ${data.tripOrigin ?? ''} → ${data.tripDestination ?? ''}
Cost: ${data.totalCost ?? ''} ${data.currency ?? ''}

Actions:
- Approve: ${data.approveUrl ?? ''}
- Reject: ${data.rejectUrl ?? ''}
- Request Info: ${data.requestInfoUrl ?? ''}

This link expires at ${data.expiresAt ?? ''}.`;

  return { subject, html, text };
}

function renderWorkflowCompleted(data: TemplateData): RenderedTemplate {
  const outcomeLabel = data.outcome === 'approved' ? 'Approved' : 'Rejected';
  const subject = `Trip ${outcomeLabel}: ${data.tripOrigin ?? ''} → ${data.tripDestination ?? ''}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: ${data.outcome === 'approved' ? '#28a745' : '#dc3545'};">Trip ${escapeHtml(outcomeLabel)}</h2>
  <p>Hi ${escapeHtml(data.travellerName ?? 'Traveller')},</p>
  <p>Your trip request has been <strong>${escapeHtml(outcomeLabel.toLowerCase())}</strong>.</p>
  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Route</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.tripOrigin ?? '')} → ${escapeHtml(data.tripDestination ?? '')}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Dates</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.departureDate ?? '')}${data.returnDate ? ` – ${escapeHtml(data.returnDate)}` : ''}</td></tr>
    <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Cost</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(data.totalCost ?? '')} ${escapeHtml(data.currency ?? '')}</td></tr>
  </table>
  ${data.conditions ? `<p><strong>Conditions:</strong> ${escapeHtml(data.conditions)}</p>` : ''}
  <p style="color: #666; font-size: 12px;">Workflow ID: ${escapeHtml(data.workflowId ?? '')}</p>
</body>
</html>`;

  const text = `Trip ${outcomeLabel}

Hi ${data.travellerName ?? 'Traveller'},

Your trip request has been ${outcomeLabel.toLowerCase()}.

Route: ${data.tripOrigin ?? ''} → ${data.tripDestination ?? ''}
Dates: ${data.departureDate ?? ''}${data.returnDate ? ` – ${data.returnDate}` : ''}
Cost: ${data.totalCost ?? ''} ${data.currency ?? ''}
${data.conditions ? `\nConditions: ${data.conditions}` : ''}

Workflow ID: ${data.workflowId ?? ''}`;

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const TEMPLATE_IDS = {
  APPROVAL_REQUEST: 'approval-request',
  APPROVAL_REMINDER: 'approval-reminder',
  APPROVAL_ESCALATION: 'approval-escalation',
  WORKFLOW_COMPLETED: 'workflow-completed',
} as const;
