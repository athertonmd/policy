import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// Must use vi.hoisted for variables referenced inside vi.mock
const mockGetLatestEntry = vi.hoisted(() => vi.fn());

vi.mock('./audit-repository.js', () => ({
  getLatestEntry: mockGetLatestEntry,
}));

import { calculateIntegrityHash, getLatestHash, GENESIS_HASH } from './hash-chain.js';

beforeEach(() => {
  mockGetLatestEntry.mockReset();
});

describe('GENESIS_HASH', () => {
  it('is a 64-character string of zeros', () => {
    expect(GENESIS_HASH).toBe('0'.repeat(64));
    expect(GENESIS_HASH.length).toBe(64);
  });
});

describe('calculateIntegrityHash', () => {
  it('returns a valid SHA-256 hex string', () => {
    const result = calculateIntegrityHash('previoushash', 'eventdata');
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces deterministic output for same inputs', () => {
    const hash1 = calculateIntegrityHash('abc', 'def');
    const hash2 = calculateIntegrityHash('abc', 'def');
    expect(hash1).toBe(hash2);
  });

  it('produces different output for different previousHash', () => {
    const hash1 = calculateIntegrityHash('hash1', 'samedata');
    const hash2 = calculateIntegrityHash('hash2', 'samedata');
    expect(hash1).not.toBe(hash2);
  });

  it('produces different output for different eventData', () => {
    const hash1 = calculateIntegrityHash('samehash', 'data1');
    const hash2 = calculateIntegrityHash('samehash', 'data2');
    expect(hash1).not.toBe(hash2);
  });

  it('matches manual SHA-256 calculation of previousHash + eventData', () => {
    const previousHash = 'abc123';
    const eventData = '{"key":"value"}';
    const expected = createHash('sha256')
      .update(previousHash + eventData)
      .digest('hex');

    const result = calculateIntegrityHash(previousHash, eventData);
    expect(result).toBe(expected);
  });

  it('handles empty previousHash (genesis case)', () => {
    const result = calculateIntegrityHash('', 'eventdata');
    const expected = createHash('sha256').update('eventdata').digest('hex');
    expect(result).toBe(expected);
  });

  it('handles GENESIS_HASH as previousHash', () => {
    const result = calculateIntegrityHash(GENESIS_HASH, 'eventdata');
    const expected = createHash('sha256')
      .update(GENESIS_HASH + 'eventdata')
      .digest('hex');
    expect(result).toBe(expected);
  });
});

describe('getLatestHash', () => {
  it('returns GENESIS_HASH when no previous entries exist', async () => {
    mockGetLatestEntry.mockResolvedValueOnce(null);

    const result = await getLatestHash('tenant-1');
    expect(result).toBe(GENESIS_HASH);
    expect(mockGetLatestEntry).toHaveBeenCalledWith('tenant-1');
  });

  it('returns the integrityHash from the latest entry', async () => {
    const mockEntry = {
      eventId: 'evt-1',
      tenantId: 'tenant-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      userId: 'user-1',
      actionType: 'policy_decision',
      resourceType: 'trip',
      resourceId: 'trip-1',
      outcome: 'success',
      sourceIp: '10.0.0.1',
      correlationId: 'corr-1',
      integrityHash: 'abc123def456',
      previousHash: GENESIS_HASH,
    };
    mockGetLatestEntry.mockResolvedValueOnce(mockEntry);

    const result = await getLatestHash('tenant-1');
    expect(result).toBe('abc123def456');
  });

  it('passes the correct tenantId to getLatestEntry', async () => {
    mockGetLatestEntry.mockResolvedValueOnce(null);

    await getLatestHash('my-tenant-id');
    expect(mockGetLatestEntry).toHaveBeenCalledWith('my-tenant-id');
  });
});
