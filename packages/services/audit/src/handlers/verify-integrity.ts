import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { AuditEntry, IntegrityReport } from '@travel-policy/shared';
import { calculateIntegrityHash, GENESIS_HASH } from '../lib/hash-chain.js';
import { queryByTimeRange } from '../lib/audit-repository.js';

/**
 * Serializes an audit entry's event data in the same deterministic format
 * used during recording, so the hash can be recomputed for verification.
 */
export function serializeEventData(entry: AuditEntry): string {
  return JSON.stringify({
    eventId: entry.eventId,
    timestamp: entry.timestamp,
    tenantId: entry.tenantId,
    userId: entry.userId,
    actionType: entry.actionType,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    outcome: entry.outcome,
    sourceIp: entry.sourceIp,
    correlationId: entry.correlationId,
    metadata: entry.metadata,
  });
}

/**
 * Verifies the integrity of a sequence of audit entries by recomputing
 * the hash chain and comparing against stored hashes.
 *
 * For each entry:
 * 1. Recompute SHA256(previousHash + eventData)
 * 2. Compare with stored integrityHash
 * 3. Verify previousHash matches the prior entry's integrityHash (chain continuity)
 *
 * @returns An integrity report with counts of valid/invalid entries
 */
export function verifyHashChain(entries: AuditEntry[]): {
  totalEntries: number;
  validEntries: number;
  invalidEntries: number;
  firstInvalidEntry?: string;
} {
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      validEntries: 0,
      invalidEntries: 0,
    };
  }

  let validEntries = 0;
  let invalidEntries = 0;
  let firstInvalidEntry: string | undefined;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const eventData = serializeEventData(entry);

    // Recompute the hash using the entry's stored previousHash
    const expectedHash = calculateIntegrityHash(entry.previousHash, eventData);

    // Check if the stored integrityHash matches the recomputed hash
    const hashValid = expectedHash === entry.integrityHash;

    // Check chain continuity: entry's previousHash should match prior entry's integrityHash
    let chainValid = true;
    if (i > 0) {
      const previousEntry = entries[i - 1];
      chainValid = entry.previousHash === previousEntry.integrityHash;
    }

    if (hashValid && chainValid) {
      validEntries++;
    } else {
      invalidEntries++;
      if (!firstInvalidEntry) {
        firstInvalidEntry = entry.eventId;
      }
    }
  }

  return {
    totalEntries: entries.length,
    validEntries,
    invalidEntries,
    firstInvalidEntry,
  };
}

/**
 * Core verification logic: fetches all entries in range and verifies the hash chain.
 */
export async function verifyIntegrity(
  tenantId: string,
  fromDate: string,
  toDate: string
): Promise<IntegrityReport> {
  // Fetch all entries in the date range (in chronological order)
  const allEntries: AuditEntry[] = [];
  let nextToken: string | undefined;

  do {
    const result = await queryByTimeRange(tenantId, fromDate, toDate, 1000, nextToken);
    allEntries.push(...result.items);
    nextToken = result.nextToken;
  } while (nextToken);

  const verification = verifyHashChain(allEntries);

  return {
    tenantId,
    fromDate,
    toDate,
    totalEntries: verification.totalEntries,
    validEntries: verification.validEntries,
    invalidEntries: verification.invalidEntries,
    brokenChainAt: verification.firstInvalidEntry,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Lambda handler for POST /v1/audit/verify
 * Body: { tenantId, from, to }
 */
export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is required' }),
      };
    }

    const { tenantId, from, to } = JSON.parse(event.body);

    if (!tenantId || !from || !to) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields: tenantId, from, to',
        }),
      };
    }

    const report = await verifyIntegrity(tenantId, from, to);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    };
  } catch (error) {
    console.error('Failed to verify audit integrity:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
