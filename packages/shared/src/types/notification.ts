/**
 * Notification Service types
 */

import { TripSummary } from './approval';

export interface ApprovalNotificationRequest {
  approverId: string;
  workflowId: string;
  tripSummary: TripSummary;
  actionLinks: ActionLink[];
  expiresAt: string;
  reminderSchedule?: string[];
}

export interface ActionLink {
  action: 'approve' | 'reject' | 'request_info';
  url: string;
  token: string;
  expiresAt: string;
}

export interface NotificationRequest {
  tenantId: string;
  recipientId: string;
  channel: NotificationChannel;
  templateId: string;
  templateData: Record<string, unknown>;
  priority: 'low' | 'normal' | 'high';
}

export type NotificationChannel = 'email' | 'in_app' | 'push';

export interface EmailActionRequest {
  token: string;
  action: 'approve' | 'reject' | 'request_info';
  comment?: string;
}

export interface ApprovalActionResult {
  success: boolean;
  workflowId: string;
  action: string;
  processedAt: string;
  message?: string;
}

export interface NotificationPreferences {
  email: boolean;
  inApp: boolean;
  push: boolean;
  reminderFrequencyHours: number;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}
