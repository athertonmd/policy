import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { AuditEvent, AuditEntry } from '@travel-policy/shared';
import { calculateIntegrityHash, getLatestHash } from '../lib/hash-chain.js';
import { writeAuditEntry } from '../lib/audit-repository.js';

/**
 * Default retention period in years.
 * Audit logs are retained for 7 years per requirement 11.5.
 */
const DEFAULT_RETENTION_YEARS = 7;

/**
 * Calculates the TTL (expiresAt) for an audit entry based on retention configuration.
 *
 * @param retentionYears - Number of years to retain the entry
 * @returns Unix timestamp in seconds for DynamoDB TTL
 */
export function calculateTTL(retentionYears: number = DEFAULT_RETENTION_YEARS): number {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + retentionYears);
  return Math.floor(expiresAt.getTime() / 1000);
}

/**
 * Core logic for recording an audit event.
 * Creates an immutable audit entry with SHA-256 hash chain integrity.
 *
 * @param event - The audit event to record
 * @param retentionYears - Optional retention period override
 * @returns The created audit entry
 */
export async function recordAuditEvent(
  event: AuditEvent,
  retentionYears?: number
): Promise<AuditEntry> {
  const eventId = randomUUID();
  const timestamp = new Date().toISOString();

  // Get the previous hash to maintain the chain
  const previousHash = await getLatestHash(event.tenantId);

  // Serialize event data for hash calculation (deterministic JSON)
  const eventData = JSON.stringify({
    eventId,
    timestamp,
    tenantId: event.tenantId,
    userId: event.userId,
    actionType: event.actionType,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome,
    sourceIp: event.sourceIp,
    correlationId: event.correlationId,
    metadata: event.metadata,
  });

  // Calculate integrity hash: SHA256(previousHash + eventData)
  const integrityHash = calculateIntegrityHash(previousHash, eventData);

  const entry: AuditEntry = {
    eventId,
    timestamp,
    tenantId: event.tenantId,
    userId: event.userId,
    actionType: event.actionType,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    outcome: event.outcome,
    sourceIp: event.sourceIp,
    correlationId: event.correlationId,
    metadata: event.metadata,
    integrityHash,
    previousHash,
  };

  const expiresAt = calculateTTL(retentionYears);

  await writeAuditEntry({ ...entry, expiresAt });

  return entry;
}

/**
 * Lambda handler for recording audit events via direct API call.
 * Accepts an AuditEvent in the request body and persists it to the AuditLog table.
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

    const auditEvent: AuditEvent = JSON.parse(event.body);

    // Validate required fields
    const requiredFields: (keyof AuditEvent)[] = [
      'tenantId',
      'userId',
      'actionType',
      'resourceType',
      'resourceId',
      'outcome',
      'sourceIp',
      'correlationId',
    ];

    const missingFields = requiredFields.filter(
      (field) => !auditEvent[field]
    );

    if (missingFields.length > 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields',
          missingFields,
        }),
      };
    }

    const entry = await recordAuditEvent(auditEvent);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    };
  } catch (error) {
    console.error('Failed to record audit event:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
