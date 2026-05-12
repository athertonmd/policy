/**
 * Schedules reminder notifications at configurable intervals.
 * Uses EventBridge Scheduler to send reminders while approval is pending.
 *
 * Requirements: 9.4
 */
import {
  SchedulerClient,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  type FlexibleTimeWindowMode,
} from '@aws-sdk/client-scheduler';

export interface ReminderScheduleConfig {
  workflowId: string;
  stageNumber: number;
  approverId: string;
  tenantId: string;
  intervalHours: number;
  maxReminders: number;
  targetArn: string;
  roleArn: string;
}

export interface ScheduledReminder {
  scheduleName: string;
  scheduleArn?: string;
  nextFireAt: string;
}

const schedulerClient = new SchedulerClient({});

const SCHEDULE_GROUP = process.env.REMINDER_SCHEDULE_GROUP ?? 'approval-reminders';

/**
 * Schedule reminder notifications at the configured interval.
 * Creates an EventBridge Scheduler rate-based schedule that invokes
 * the notification Lambda at each interval.
 */
export async function scheduleReminders(
  config: ReminderScheduleConfig
): Promise<ScheduledReminder> {
  const scheduleName = buildScheduleName(config.workflowId, config.stageNumber, config.approverId);

  const firstFireAt = new Date(Date.now() + config.intervalHours * 60 * 60 * 1000);

  const input = {
    workflowId: config.workflowId,
    stageNumber: config.stageNumber,
    approverId: config.approverId,
    tenantId: config.tenantId,
    reminderCount: 1,
    maxReminders: config.maxReminders,
  };

  await schedulerClient.send(
    new CreateScheduleCommand({
      Name: scheduleName,
      GroupName: SCHEDULE_GROUP,
      ScheduleExpression: `rate(${config.intervalHours} hours)`,
      ScheduleExpressionTimezone: 'UTC',
      StartDate: firstFireAt,
      FlexibleTimeWindow: {
        Mode: 'OFF' as FlexibleTimeWindowMode,
      },
      Target: {
        Arn: config.targetArn,
        RoleArn: config.roleArn,
        Input: JSON.stringify(input),
      },
      State: 'ENABLED',
      Description: `Approval reminder for workflow ${config.workflowId} stage ${config.stageNumber}`,
    })
  );

  return {
    scheduleName,
    nextFireAt: firstFireAt.toISOString(),
  };
}

/**
 * Cancel scheduled reminders for a workflow stage (e.g., when approval is completed).
 */
export async function cancelReminders(
  workflowId: string,
  stageNumber: number,
  approverId: string
): Promise<void> {
  const scheduleName = buildScheduleName(workflowId, stageNumber, approverId);

  try {
    await schedulerClient.send(
      new DeleteScheduleCommand({
        Name: scheduleName,
        GroupName: SCHEDULE_GROUP,
      })
    );
  } catch (error: unknown) {
    // Ignore ResourceNotFoundException — schedule may already be deleted
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return;
    }
    throw error;
  }
}

/**
 * Build a deterministic schedule name from workflow context.
 */
function buildScheduleName(workflowId: string, stageNumber: number, approverId: string): string {
  // Schedule names must be 1-64 chars, alphanumeric, hyphens, underscores
  const sanitized = `reminder-${workflowId}-s${stageNumber}-${approverId}`
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 64);
  return sanitized;
}
