/**
 * Account Lockout - Pre-Authentication Lambda Trigger
 *
 * Implements account lockout after 3 consecutive failed authentication
 * attempts within a 5-minute window. Locked accounts are held for 15 minutes.
 *
 * This module uses DynamoDB to track failed attempts per user, providing
 * a custom lockout mechanism that works alongside Cognito's built-in
 * advanced security features.
 *
 * Requirement 2.6: IF an authentication attempt fails three consecutive times
 * within 5 minutes, THEN THE Platform SHALL lock the account for 15 minutes
 * and notify the Tenant administrator.
 */
import type { PreAuthenticationTriggerEvent, PreAuthenticationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient, GetItemCommand, PutItemCommand, DeleteItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

const dynamoClient = new DynamoDBClient({});
const snsClient = new SNSClient({});

const LOCKOUT_TABLE = process.env.LOCKOUT_TABLE ?? 'AuthLockout';
const ADMIN_NOTIFICATION_TOPIC_ARN = process.env.ADMIN_NOTIFICATION_TOPIC_ARN ?? '';
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_WINDOW_SECONDS = 5 * 60; // 5 minutes
const LOCKOUT_DURATION_SECONDS = 15 * 60; // 15 minutes

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LockoutRecord {
  userId: string;
  failedAttempts: number;
  firstFailureAt: number; // epoch seconds
  lockedUntil?: number; // epoch seconds
  lastAttemptAt: number; // epoch seconds
}

export interface LockoutCheckResult {
  isLocked: boolean;
  remainingLockoutSeconds?: number;
  failedAttempts: number;
}

// ─── Pre-Authentication Trigger Handler ──────────────────────────────────────

/**
 * Cognito Pre-Authentication Lambda trigger.
 * Checks if the user account is currently locked out before allowing authentication.
 * If locked, throws an error that Cognito surfaces to the client.
 */
export const preAuthenticationHandler: PreAuthenticationTriggerHandler = async (
  event: PreAuthenticationTriggerEvent
) => {
  const userId = event.userName;
  const userPoolId = event.userPoolId;

  const lockoutStatus = await checkLockoutStatus(userId, userPoolId);

  if (lockoutStatus.isLocked) {
    const remainingMinutes = Math.ceil((lockoutStatus.remainingLockoutSeconds ?? 0) / 60);
    throw new Error(
      `Account is locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`
    );
  }

  return event;
};

// ─── Core Lockout Logic ──────────────────────────────────────────────────────

/**
 * Checks whether a user account is currently locked out.
 */
export async function checkLockoutStatus(
  userId: string,
  userPoolId: string
): Promise<LockoutCheckResult> {
  const record = await getLockoutRecord(userId, userPoolId);

  if (!record) {
    return { isLocked: false, failedAttempts: 0 };
  }

  const now = Math.floor(Date.now() / 1000);

  // Check if currently locked
  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      isLocked: true,
      remainingLockoutSeconds: record.lockedUntil - now,
      failedAttempts: record.failedAttempts,
    };
  }

  // If lock has expired, clear the record
  if (record.lockedUntil && record.lockedUntil <= now) {
    await clearLockoutRecord(userId, userPoolId);
    return { isLocked: false, failedAttempts: 0 };
  }

  // Check if the failure window has expired
  if (now - record.firstFailureAt > LOCKOUT_WINDOW_SECONDS) {
    await clearLockoutRecord(userId, userPoolId);
    return { isLocked: false, failedAttempts: 0 };
  }

  return { isLocked: false, failedAttempts: record.failedAttempts };
}

/**
 * Records a failed authentication attempt for a user.
 * If the threshold is reached within the window, locks the account.
 * Returns the updated lockout status.
 */
export async function recordFailedAttempt(
  userId: string,
  userPoolId: string,
  tenantId?: string
): Promise<LockoutCheckResult> {
  const now = Math.floor(Date.now() / 1000);
  const existing = await getLockoutRecord(userId, userPoolId);

  let record: LockoutRecord;

  if (!existing || now - existing.firstFailureAt > LOCKOUT_WINDOW_SECONDS) {
    // Start a new failure window
    record = {
      userId,
      failedAttempts: 1,
      firstFailureAt: now,
      lastAttemptAt: now,
    };
  } else {
    // Increment within existing window
    record = {
      ...existing,
      failedAttempts: existing.failedAttempts + 1,
      lastAttemptAt: now,
    };
  }

  // Check if we've hit the lockout threshold
  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_SECONDS;

    // Notify tenant administrator
    await notifyAdminOfLockout(userId, userPoolId, tenantId);
  }

  await saveLockoutRecord(userId, userPoolId, record);

  if (record.lockedUntil && record.lockedUntil > now) {
    return {
      isLocked: true,
      remainingLockoutSeconds: record.lockedUntil - now,
      failedAttempts: record.failedAttempts,
    };
  }

  return { isLocked: false, failedAttempts: record.failedAttempts };
}

/**
 * Clears the lockout state for a user (e.g., after successful authentication
 * or manual admin unlock).
 */
export async function clearLockout(userId: string, userPoolId: string): Promise<void> {
  await clearLockoutRecord(userId, userPoolId);
}

// ─── DynamoDB Operations ─────────────────────────────────────────────────────

async function getLockoutRecord(
  userId: string,
  userPoolId: string
): Promise<LockoutRecord | null> {
  const response = await dynamoClient.send(
    new GetItemCommand({
      TableName: LOCKOUT_TABLE,
      Key: {
        pk: { S: `${userPoolId}#${userId}` },
        sk: { S: 'LOCKOUT' },
      },
    })
  );

  if (!response.Item) {
    return null;
  }

  return {
    userId,
    failedAttempts: parseInt(response.Item.failedAttempts?.N ?? '0', 10),
    firstFailureAt: parseInt(response.Item.firstFailureAt?.N ?? '0', 10),
    lockedUntil: response.Item.lockedUntil?.N
      ? parseInt(response.Item.lockedUntil.N, 10)
      : undefined,
    lastAttemptAt: parseInt(response.Item.lastAttemptAt?.N ?? '0', 10),
  };
}

async function saveLockoutRecord(
  userId: string,
  userPoolId: string,
  record: LockoutRecord
): Promise<void> {
  const item: Record<string, AttributeValue> = {
    pk: { S: `${userPoolId}#${userId}` },
    sk: { S: 'LOCKOUT' },
    failedAttempts: { N: record.failedAttempts.toString() },
    firstFailureAt: { N: record.firstFailureAt.toString() },
    lastAttemptAt: { N: record.lastAttemptAt.toString() },
    // TTL: auto-expire records after lockout duration + window
    ttl: { N: (record.lastAttemptAt + LOCKOUT_DURATION_SECONDS + LOCKOUT_WINDOW_SECONDS).toString() },
  };

  if (record.lockedUntil) {
    item.lockedUntil = { N: record.lockedUntil.toString() };
  }

  await dynamoClient.send(
    new PutItemCommand({
      TableName: LOCKOUT_TABLE,
      Item: item,
    })
  );
}

async function clearLockoutRecord(userId: string, userPoolId: string): Promise<void> {
  await dynamoClient.send(
    new DeleteItemCommand({
      TableName: LOCKOUT_TABLE,
      Key: {
        pk: { S: `${userPoolId}#${userId}` },
        sk: { S: 'LOCKOUT' },
      },
    })
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

async function notifyAdminOfLockout(
  userId: string,
  userPoolId: string,
  tenantId?: string
): Promise<void> {
  if (!ADMIN_NOTIFICATION_TOPIC_ARN) {
    console.warn('ADMIN_NOTIFICATION_TOPIC_ARN not configured; skipping lockout notification');
    return;
  }

  try {
    await snsClient.send(
      new PublishCommand({
        TopicArn: ADMIN_NOTIFICATION_TOPIC_ARN,
        Subject: 'Account Locked - Failed Authentication Attempts',
        Message: JSON.stringify({
          event: 'ACCOUNT_LOCKED',
          userId,
          userPoolId,
          tenantId: tenantId ?? 'unknown',
          reason: `Account locked after ${MAX_FAILED_ATTEMPTS} failed attempts within ${LOCKOUT_WINDOW_SECONDS / 60} minutes`,
          lockoutDurationMinutes: LOCKOUT_DURATION_SECONDS / 60,
          timestamp: new Date().toISOString(),
        }),
        MessageAttributes: {
          eventType: { DataType: 'String', StringValue: 'ACCOUNT_LOCKED' },
          ...(tenantId ? { tenantId: { DataType: 'String', StringValue: tenantId } } : {}),
        },
      })
    );
  } catch (error) {
    // Log but don't fail authentication flow due to notification failure
    console.error('Failed to send lockout notification:', error);
  }
}
