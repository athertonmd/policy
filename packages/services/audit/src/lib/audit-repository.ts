import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { AuditEntry } from '@travel-policy/shared';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AUDIT_LOG_TABLE_NAME || 'AuditLog';

/**
 * DynamoDB item representation of an audit entry.
 */
export interface AuditLogItem {
  tenantId: string;
  'timestamp#eventId': string;
  eventId: string;
  timestamp: string;
  userId: string;
  actionType: string;
  'actionType#timestamp': string;
  'userId#timestamp': string;
  resourceType: string;
  resourceId: string;
  outcome: string;
  sourceIp: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
  integrityHash: string;
  previousHash: string;
  expiresAt: number;
}

/**
 * Writes an audit entry to the DynamoDB AuditLog table.
 * Includes all required fields plus GSI sort keys and TTL.
 */
export async function writeAuditEntry(entry: AuditEntry & { expiresAt: number }): Promise<void> {
  const item: AuditLogItem = {
    tenantId: entry.tenantId,
    'timestamp#eventId': `${entry.timestamp}#${entry.eventId}`,
    eventId: entry.eventId,
    timestamp: entry.timestamp,
    userId: entry.userId,
    actionType: entry.actionType,
    'actionType#timestamp': `${entry.actionType}#${entry.timestamp}`,
    'userId#timestamp': `${entry.userId}#${entry.timestamp}`,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    outcome: entry.outcome,
    sourceIp: entry.sourceIp,
    correlationId: entry.correlationId,
    integrityHash: entry.integrityHash,
    previousHash: entry.previousHash,
    expiresAt: entry.expiresAt,
  };

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    item.metadata = entry.metadata;
  }

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    })
  );
}

/**
 * Retrieves the most recent audit entry for a tenant.
 * Used to get the latest integrityHash for chain continuation.
 *
 * @returns The latest AuditEntry or null if no entries exist
 */
export async function getLatestEntry(tenantId: string): Promise<AuditEntry | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'tenantId = :tenantId',
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
      },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) {
    return null;
  }

  const item = result.Items[0];
  return {
    eventId: item.eventId as string,
    tenantId: item.tenantId as string,
    timestamp: item.timestamp as string,
    userId: item.userId as string,
    actionType: item.actionType as AuditEntry['actionType'],
    resourceType: item.resourceType as string,
    resourceId: item.resourceId as string,
    outcome: item.outcome as AuditEntry['outcome'],
    sourceIp: item.sourceIp as string,
    correlationId: item.correlationId as string,
    metadata: item.metadata as Record<string, unknown> | undefined,
    integrityHash: item.integrityHash as string,
    previousHash: item.previousHash as string,
  };
}

/**
 * Queries audit entries by time range for a tenant.
 * Returns entries in chronological order with optional pagination.
 */
export async function queryByTimeRange(
  tenantId: string,
  from: string,
  to: string,
  limit?: number,
  nextToken?: string
): Promise<{ items: AuditEntry[]; nextToken?: string }> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression:
        'tenantId = :tenantId AND #sortKey BETWEEN :from AND :to',
      ExpressionAttributeNames: {
        '#sortKey': 'timestamp#eventId',
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':from': from,
        ':to': `${to}\uffff`,
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: nextToken ? JSON.parse(Buffer.from(nextToken, 'base64').toString()) : undefined,
    })
  );

  const items: AuditEntry[] = (result.Items || []).map((item) => ({
    eventId: item.eventId as string,
    tenantId: item.tenantId as string,
    timestamp: item.timestamp as string,
    userId: item.userId as string,
    actionType: item.actionType as AuditEntry['actionType'],
    resourceType: item.resourceType as string,
    resourceId: item.resourceId as string,
    outcome: item.outcome as AuditEntry['outcome'],
    sourceIp: item.sourceIp as string,
    correlationId: item.correlationId as string,
    metadata: item.metadata as Record<string, unknown> | undefined,
    integrityHash: item.integrityHash as string,
    previousHash: item.previousHash as string,
  }));

  const encodedNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { items, nextToken: encodedNextToken };
}
