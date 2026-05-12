import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock AWS SDK clients - use vi.hoisted to avoid initialization order issues
const mockDynamoSend = vi.hoisted(() => vi.fn());
const mockSnsSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-dynamodb', async () => {
  const actual = await vi.importActual('@aws-sdk/client-dynamodb');
  return {
    ...actual,
    DynamoDBClient: vi.fn().mockImplementation(() => ({
      send: mockDynamoSend,
    })),
  };
});

vi.mock('@aws-sdk/client-sns', async () => {
  const actual = await vi.importActual('@aws-sdk/client-sns');
  return {
    ...actual,
    SNSClient: vi.fn().mockImplementation(() => ({
      send: mockSnsSend,
    })),
  };
});

import {
  checkLockoutStatus,
  recordFailedAttempt,
  clearLockout,
} from './account-lockout.js';

describe('account-lockout', () => {
  beforeEach(() => {
    mockDynamoSend.mockReset();
    mockSnsSend.mockReset();
  });

  describe('checkLockoutStatus', () => {
    it('should return not locked when no record exists', async () => {
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });

      const result = await checkLockoutStatus('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(0);
    });

    it('should return locked when lockedUntil is in the future', async () => {
      const futureTime = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '3' },
          firstFailureAt: { N: (Math.floor(Date.now() / 1000) - 60).toString() },
          lockedUntil: { N: futureTime.toString() },
          lastAttemptAt: { N: Math.floor(Date.now() / 1000).toString() },
        },
      });

      const result = await checkLockoutStatus('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(true);
      expect(result.remainingLockoutSeconds).toBeGreaterThan(0);
      expect(result.failedAttempts).toBe(3);
    });

    it('should clear record and return not locked when lock has expired', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '3' },
          firstFailureAt: { N: (pastTime - 300).toString() },
          lockedUntil: { N: pastTime.toString() },
          lastAttemptAt: { N: (pastTime - 10).toString() },
        },
      });
      // DeleteItem call for clearing the record
      mockDynamoSend.mockResolvedValueOnce({});

      const result = await checkLockoutStatus('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(0);
    });

    it('should clear record when failure window has expired', async () => {
      const oldTime = Math.floor(Date.now() / 1000) - 400; // 6+ minutes ago (beyond 5-min window)
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '2' },
          firstFailureAt: { N: oldTime.toString() },
          lastAttemptAt: { N: (oldTime + 30).toString() },
        },
      });
      // DeleteItem call
      mockDynamoSend.mockResolvedValueOnce({});

      const result = await checkLockoutStatus('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(0);
    });
  });

  describe('recordFailedAttempt', () => {
    it('should start a new failure window on first attempt', async () => {
      // GetItem returns no existing record
      mockDynamoSend.mockResolvedValueOnce({ Item: undefined });
      // PutItem saves the new record
      mockDynamoSend.mockResolvedValueOnce({});

      const result = await recordFailedAttempt('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
    });

    it('should increment attempts within the failure window', async () => {
      const recentTime = Math.floor(Date.now() / 1000) - 60; // 1 minute ago
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '1' },
          firstFailureAt: { N: recentTime.toString() },
          lastAttemptAt: { N: recentTime.toString() },
        },
      });
      // PutItem saves updated record
      mockDynamoSend.mockResolvedValueOnce({});

      const result = await recordFailedAttempt('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(2);
    });

    it('should lock account after 3 failed attempts within 5 minutes', async () => {
      const recentTime = Math.floor(Date.now() / 1000) - 120; // 2 minutes ago
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '2' },
          firstFailureAt: { N: recentTime.toString() },
          lastAttemptAt: { N: (recentTime + 60).toString() },
        },
      });
      // PutItem saves locked record
      mockDynamoSend.mockResolvedValueOnce({});
      // SNS notification (may or may not be called depending on env var)
      mockSnsSend.mockResolvedValueOnce({});

      const result = await recordFailedAttempt('user-1', 'us-east-1_pool123', 'tenant-abc');

      expect(result.isLocked).toBe(true);
      expect(result.failedAttempts).toBe(3);
      expect(result.remainingLockoutSeconds).toBeGreaterThan(0);
      expect(result.remainingLockoutSeconds).toBeLessThanOrEqual(900); // 15 minutes max
    });

    it('should start a new window if previous window expired', async () => {
      const oldTime = Math.floor(Date.now() / 1000) - 400; // beyond 5-min window
      mockDynamoSend.mockResolvedValueOnce({
        Item: {
          pk: { S: 'us-east-1_pool123#user-1' },
          sk: { S: 'LOCKOUT' },
          failedAttempts: { N: '2' },
          firstFailureAt: { N: oldTime.toString() },
          lastAttemptAt: { N: (oldTime + 30).toString() },
        },
      });
      // PutItem saves new record (reset)
      mockDynamoSend.mockResolvedValueOnce({});

      const result = await recordFailedAttempt('user-1', 'us-east-1_pool123');

      expect(result.isLocked).toBe(false);
      expect(result.failedAttempts).toBe(1);
    });
  });

  describe('clearLockout', () => {
    it('should delete the lockout record from DynamoDB', async () => {
      mockDynamoSend.mockResolvedValueOnce({});

      await expect(clearLockout('user-1', 'us-east-1_pool123')).resolves.toBeUndefined();
      expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    });
  });
});
