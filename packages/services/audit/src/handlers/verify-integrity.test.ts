import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import type { AuditEntry } from '@travel-policy/shared';
import { verifyHashChain, serializeEventData } from './verify-integrity.js';
import { calculateIntegrityHash, GENESIS_HASH } from '../lib/hash-chain.js';

/**
 * Helper to create a valid audit entry with correct hash chain linkage.
 */
function createValidEntry(
  overrides: Partial<AuditEntry> & { previousHash: string }
): AuditEntry {
  const base: AuditEntry = {
    eventId: overrides.eventId || 'evt-1',
    tenantId: overrides.tenantId || 'tenant-1',
    timestamp: overrides.timestamp || '2024-01-01T00:00:00.000Z',
    userId: overrides.userId || 'user-1',
    actionType: overrides.actionType || 'policy_decision',
    resourceType: overrides.resourceType || 'trip',
    resourceId: overrides.resourceId || 'trip-1',
    outcome: overrides.outcome || 'success',
    sourceIp: overrides.sourceIp || '10.0.0.1',
    correlationId: overrides.correlationId || 'corr-1',
    metadata: overrides.metadata,
    integrityHash: '', // will be computed
    previousHash: overrides.previousHash,
  };

  const eventData = serializeEventData(base);
  base.integrityHash = calculateIntegrityHash(base.previousHash, eventData);

  return base;
}

/**
 * Helper to build a valid chain of entries.
 */
function buildValidChain(count: number): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let previousHash = GENESIS_HASH;

  for (let i = 0; i < count; i++) {
    const entry = createValidEntry({
      eventId: `evt-${i + 1}`,
      timestamp: `2024-01-0${i + 1}T00:00:00.000Z`,
      userId: `user-${(i % 3) + 1}`,
      actionType: i % 2 === 0 ? 'policy_decision' : 'approval_action',
      resourceId: `resource-${i + 1}`,
      correlationId: `corr-${i + 1}`,
      previousHash,
    });
    previousHash = entry.integrityHash;
    entries.push(entry);
  }

  return entries;
}

describe('serializeEventData', () => {
  it('serializes entry fields in deterministic order', () => {
    const entry: AuditEntry = {
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
      metadata: { key: 'value' },
      integrityHash: 'somehash',
      previousHash: 'prevhash',
    };

    const result = serializeEventData(entry);
    const parsed = JSON.parse(result);

    // Should include event data fields but NOT integrityHash or previousHash
    expect(parsed.eventId).toBe('evt-1');
    expect(parsed.tenantId).toBe('tenant-1');
    expect(parsed.timestamp).toBe('2024-01-01T00:00:00.000Z');
    expect(parsed.userId).toBe('user-1');
    expect(parsed.actionType).toBe('policy_decision');
    expect(parsed.resourceType).toBe('trip');
    expect(parsed.resourceId).toBe('trip-1');
    expect(parsed.outcome).toBe('success');
    expect(parsed.sourceIp).toBe('10.0.0.1');
    expect(parsed.correlationId).toBe('corr-1');
    expect(parsed.metadata).toEqual({ key: 'value' });
    expect(parsed.integrityHash).toBeUndefined();
    expect(parsed.previousHash).toBeUndefined();
  });

  it('handles entries without metadata', () => {
    const entry: AuditEntry = {
      eventId: 'evt-1',
      tenantId: 'tenant-1',
      timestamp: '2024-01-01T00:00:00.000Z',
      userId: 'user-1',
      actionType: 'authentication',
      resourceType: 'session',
      resourceId: 'session-1',
      outcome: 'success',
      sourceIp: '192.168.1.1',
      correlationId: 'corr-1',
      integrityHash: 'hash',
      previousHash: 'prev',
    };

    const result = serializeEventData(entry);
    const parsed = JSON.parse(result);
    expect(parsed.metadata).toBeUndefined();
  });
});

describe('verifyHashChain', () => {
  it('returns zero counts for empty entries array', () => {
    const result = verifyHashChain([]);
    expect(result).toEqual({
      totalEntries: 0,
      validEntries: 0,
      invalidEntries: 0,
    });
  });

  it('validates a single valid entry with genesis hash', () => {
    const entries = buildValidChain(1);
    const result = verifyHashChain(entries);

    expect(result.totalEntries).toBe(1);
    expect(result.validEntries).toBe(1);
    expect(result.invalidEntries).toBe(0);
    expect(result.firstInvalidEntry).toBeUndefined();
  });

  it('validates a chain of multiple valid entries', () => {
    const entries = buildValidChain(5);
    const result = verifyHashChain(entries);

    expect(result.totalEntries).toBe(5);
    expect(result.validEntries).toBe(5);
    expect(result.invalidEntries).toBe(0);
    expect(result.firstInvalidEntry).toBeUndefined();
  });

  it('detects a tampered integrityHash', () => {
    const entries = buildValidChain(3);
    // Tamper with the second entry's integrityHash
    entries[1] = { ...entries[1], integrityHash: 'tampered_hash_value' };

    const result = verifyHashChain(entries);

    expect(result.totalEntries).toBe(3);
    expect(result.invalidEntries).toBeGreaterThanOrEqual(1);
    expect(result.firstInvalidEntry).toBe('evt-2');
  });

  it('detects a broken chain (previousHash mismatch)', () => {
    const entries = buildValidChain(3);
    // Break the chain by modifying entry[2]'s previousHash
    const brokenEntry = createValidEntry({
      eventId: 'evt-3',
      timestamp: '2024-01-03T00:00:00.000Z',
      userId: 'user-3',
      actionType: 'policy_decision',
      resourceId: 'resource-3',
      correlationId: 'corr-3',
      previousHash: 'wrong_previous_hash',
    });
    entries[2] = brokenEntry;

    const result = verifyHashChain(entries);

    expect(result.invalidEntries).toBeGreaterThanOrEqual(1);
    expect(result.firstInvalidEntry).toBe('evt-3');
  });

  it('detects tampered event data (modified userId)', () => {
    const entries = buildValidChain(3);
    // Tamper with the event data of the second entry without updating the hash
    entries[1] = { ...entries[1], userId: 'hacker' };

    const result = verifyHashChain(entries);

    expect(result.invalidEntries).toBeGreaterThanOrEqual(1);
    expect(result.firstInvalidEntry).toBe('evt-2');
  });

  it('reports the first invalid entry when multiple are invalid', () => {
    const entries = buildValidChain(5);
    // Tamper with entries 2 and 4
    entries[1] = { ...entries[1], integrityHash: 'bad_hash_1' };
    entries[3] = { ...entries[3], integrityHash: 'bad_hash_2' };

    const result = verifyHashChain(entries);

    expect(result.firstInvalidEntry).toBe('evt-2');
    expect(result.invalidEntries).toBeGreaterThanOrEqual(2);
  });

  it('validates entries with metadata correctly', () => {
    const entry = createValidEntry({
      eventId: 'evt-meta',
      previousHash: GENESIS_HASH,
      metadata: { policyId: 'pol-1', ruleCount: 5, nested: { key: 'val' } },
    });

    const result = verifyHashChain([entry]);

    expect(result.totalEntries).toBe(1);
    expect(result.validEntries).toBe(1);
    expect(result.invalidEntries).toBe(0);
  });

  it('correctly handles chain where first entry has non-genesis previousHash', () => {
    // This simulates querying a subset of the chain (not from the beginning)
    const someHash = calculateIntegrityHash(GENESIS_HASH, 'some prior data');
    const entry = createValidEntry({
      eventId: 'evt-mid',
      previousHash: someHash,
    });

    // Single entry with non-genesis previousHash is still valid
    // (we can't verify chain continuity for the first entry in a subset)
    const result = verifyHashChain([entry]);

    expect(result.totalEntries).toBe(1);
    expect(result.validEntries).toBe(1);
    expect(result.invalidEntries).toBe(0);
  });
});
