import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.hoisted for variables referenced inside vi.mock
const mockSend = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-dynamodb', () => {
  return {
    DynamoDBClient: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    GetItemCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'GetItem' })),
    PutItemCommand: vi.fn().mockImplementation((input) => ({ input, _type: 'PutItem' })),
    ConditionalCheckFailedException: class ConditionalCheckFailedException extends Error {
      constructor() {
        super('Conditional check failed');
        this.name = 'ConditionalCheckFailedException';
      }
    },
  };
});

import { checkIdempotency, recordIdempotency } from './idempotency.js';

beforeEach(() => {
  mockSend.mockReset();
});

describe('checkIdempotency', () => {
  it('returns true when item exists in DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({
      Item: {
        integrationId: { S: 'integration-1' },
        idempotencyKey: { S: 'key-abc' },
        processedAt: { S: '2024-01-01T00:00:00.000Z' },
      },
    });

    const result = await checkIdempotency('integration-1', 'key-abc');
    expect(result).toBe(true);
  });

  it('returns false when item does not exist in DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await checkIdempotency('integration-1', 'key-new');
    expect(result).toBe(false);
  });

  it('passes correct table name and key to DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({});

    await checkIdempotency('int-123', 'key-456');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual({
      TableName: 'WebhookIdempotency',
      Key: {
        integrationId: { S: 'int-123' },
        idempotencyKey: { S: 'key-456' },
      },
    });
  });
});

describe('recordIdempotency', () => {
  it('stores a record with TTL in DynamoDB', async () => {
    mockSend.mockResolvedValueOnce({});

    await recordIdempotency('integration-1', 'key-abc');

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.TableName).toBe('WebhookIdempotency');
    expect(command.input.Item.integrationId).toEqual({ S: 'integration-1' });
    expect(command.input.Item.idempotencyKey).toEqual({ S: 'key-abc' });
    expect(command.input.Item.processedAt.S).toBeDefined();
    expect(command.input.Item.ttl.N).toBeDefined();
    // TTL should be approximately 7 days from now
    const ttlValue = parseInt(command.input.Item.ttl.N, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;
    expect(ttlValue).toBeGreaterThan(nowSeconds);
    expect(ttlValue).toBeLessThanOrEqual(nowSeconds + sevenDaysSeconds + 1);
  });

  it('uses conditional expression to prevent overwrites', async () => {
    mockSend.mockResolvedValueOnce({});

    await recordIdempotency('integration-1', 'key-abc');

    const command = mockSend.mock.calls[0][0];
    expect(command.input.ConditionExpression).toBe(
      'attribute_not_exists(integrationId) AND attribute_not_exists(idempotencyKey)'
    );
  });

  it('does not throw when ConditionalCheckFailedException occurs (duplicate)', async () => {
    const error = new Error('Conditional check failed');
    error.name = 'ConditionalCheckFailedException';
    Object.setPrototypeOf(error, (await import('@aws-sdk/client-dynamodb')).ConditionalCheckFailedException.prototype);
    mockSend.mockRejectedValueOnce(error);

    // Should not throw
    await expect(recordIdempotency('integration-1', 'key-abc')).resolves.toBeUndefined();
  });

  it('rethrows non-conditional-check errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('Network error'));

    await expect(recordIdempotency('integration-1', 'key-abc')).rejects.toThrow('Network error');
  });
});
