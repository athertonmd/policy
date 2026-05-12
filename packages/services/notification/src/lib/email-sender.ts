/**
 * Wrapper around AWS SES v2 (SendEmailCommand).
 * Supports HTML and text email templates.
 * Handles bounce/complaint tracking.
 *
 * Requirements: 9.1
 */
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from '@aws-sdk/client-sesv2';

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tags?: Record<string, string>;
}

export interface SendResult {
  messageId: string;
  success: boolean;
  timestamp: string;
}

const sesClient = new SESv2Client({});

const DEFAULT_FROM_ADDRESS = process.env.NOTIFICATION_FROM_ADDRESS ?? 'noreply@travel-policy.example.com';

/**
 * Send an email via SES v2.
 */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const fromAddress = message.from ?? DEFAULT_FROM_ADDRESS;

  const input: SendEmailCommandInput = {
    FromEmailAddress: fromAddress,
    Destination: {
      ToAddresses: [message.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: message.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: message.html,
            Charset: 'UTF-8',
          },
          Text: {
            Data: message.text,
            Charset: 'UTF-8',
          },
        },
      },
    },
    EmailTags: message.tags
      ? Object.entries(message.tags).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
    ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
  };

  const result = await sesClient.send(new SendEmailCommand(input));

  return {
    messageId: result.MessageId ?? '',
    success: true,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send an email with bounce/complaint tracking tags.
 * Adds standard tags for tracking notification type and workflow context.
 */
export async function sendTrackedEmail(
  message: EmailMessage,
  context: {
    notificationType: string;
    workflowId?: string;
    tenantId?: string;
  }
): Promise<SendResult> {
  const tags: Record<string, string> = {
    ...message.tags,
    NotificationType: context.notificationType,
  };

  if (context.workflowId) {
    tags['WorkflowId'] = context.workflowId;
  }
  if (context.tenantId) {
    tags['TenantId'] = context.tenantId;
  }

  return sendEmail({ ...message, tags });
}
