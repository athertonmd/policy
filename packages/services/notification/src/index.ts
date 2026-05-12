/**
 * Notification Service
 * Multi-channel notification delivery including email with actionable approval links.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

// Handlers
export { handler as sendApprovalNotificationHandler } from './handlers/send-approval-notification.js';
export { handler as sendNotificationHandler } from './handlers/send-notification.js';
export { handler as processEmailActionHandler } from './handlers/process-email-action.js';
export { handler as processEmailReplyHandler } from './handlers/process-email-reply.js';
export { handler as configurePreferencesHandler } from './handlers/configure-preferences.js';
export { handler as sendEscalationNotificationHandler } from './handlers/send-escalation-notification.js';
export { handler as sendCompletionNotificationHandler } from './handlers/send-completion-notification.js';
export { handler as dutyOfCareHandler } from './handlers/duty-of-care.js';
export type {
  TravellerItinerary,
  ItinerarySegment,
  DutyOfCareConfig,
  DisruptionAlert,
  DutyOfCareEventDetail,
  WebhookDeliveryResult,
} from './handlers/duty-of-care.js';

// Libraries
export {
  generateActionLinks,
  validateActionToken,
  type ActionLinkPayload,
  type GeneratedActionLink,
  type ValidatedPayload,
} from './lib/action-link-generator.js';

export {
  sendEmail,
  sendTrackedEmail,
  type EmailMessage,
  type SendResult,
} from './lib/email-sender.js';

export {
  scheduleReminders,
  cancelReminders,
  type ReminderScheduleConfig,
  type ScheduledReminder,
} from './lib/reminder-scheduler.js';

export {
  renderTemplate,
  TEMPLATE_IDS,
  type TemplateData,
  type RenderedTemplate,
} from './lib/templates.js';

export {
  validateEmailActionToken,
  verifySenderEmail,
  parseReplyAction,
  type ParsedReplyAction,
  type TokenValidationResult,
  type TokenValidationError,
  type TokenValidationOutcome,
} from './lib/email-action-validator.js';

export {
  type NotificationChannel,
  type QuietHours,
  type NotificationPreferences,
  type ConfigurePreferencesRequest,
  type ConfigurePreferencesResponse,
} from './handlers/configure-preferences.js';
