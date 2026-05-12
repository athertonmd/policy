import { createHash } from 'crypto';
import { getLatestEntry } from './audit-repository.js';

/**
 * The genesis hash used as the previousHash for the first entry in a tenant's audit chain.
 */
export const GENESIS_HASH = '0'.repeat(64);

/**
 * Calculates the SHA-256 integrity hash for an audit entry.
 * The hash chains the previous entry's hash with the current event data,
 * creating a tamper-evident linked chain.
 *
 * @param previousHash - The integrityHash of the previous audit entry (or GENESIS_HASH for the first entry)
 * @param eventData - The serialized event data to include in the hash
 * @returns The hex-encoded SHA-256 hash
 */
export function calculateIntegrityHash(previousHash: string, eventData: string): string {
  return createHash('sha256')
    .update(previousHash + eventData)
    .digest('hex');
}

/**
 * Retrieves the latest integrity hash for a tenant's audit chain.
 * If no previous entries exist, returns the GENESIS_HASH.
 *
 * @param tenantId - The tenant identifier
 * @returns The most recent integrityHash or GENESIS_HASH if no entries exist
 */
export async function getLatestHash(tenantId: string): Promise<string> {
  const latestEntry = await getLatestEntry(tenantId);
  if (!latestEntry) {
    return GENESIS_HASH;
  }
  return latestEntry.integrityHash;
}
