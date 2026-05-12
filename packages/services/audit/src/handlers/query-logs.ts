import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { AuditEntry, AuditActionType } from '@travel-policy/shared';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.AUDIT_LOG_TABLE_NAME || 'AuditLog';
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_DATE_RANGE_DAYS = 90;

/**
 * Validates that the date range does not exceed 90 days.
 */
function validateDateRange(from: string, to: string): boolean {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffMs = toDate.getTime() - fromDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= MAX_DATE_RANGE_DAYS;
}

/**
 * Maps a DynamoDB item to an AuditEntry.
 */
function mapItemToEntry(item: Record<string, unknown>): AuditEntry {
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
 * Queries audit logs by action type using the tenantId-actionType-index GSI.
 */
async function queryByActionType(
  tenantId: string,
  actionType: string,
  from: string,
  to: string,
  limit: number,
  nextToken?: string
): Promise<{ items: AuditEntry[]; nextToken?: string }> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'tenantId-actionType-index',
      KeyConditionExpression:
        'tenantId = :tenantId AND #sortKey BETWEEN :from AND :to',
      ExpressionAttributeNames: {
        '#sortKey': 'actionType#timestamp',
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':from': `${actionType}#${from}`,
        ':to': `${actionType}#${to}\uffff`,
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: nextToken
        ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
        : undefined,
    })
  );

  const items = (result.Items || []).map(mapItemToEntry);
  const encodedNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { items, nextToken: encodedNextToken };
}

/**
 * Queries audit logs by user ID using the tenantId-userId-index GSI.
 */
async function queryByUserId(
  tenantId: string,
  userId: string,
  from: string,
  to: string,
  limit: number,
  nextToken?: string
): Promise<{ items: AuditEntry[]; nextToken?: string }> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'tenantId-userId-index',
      KeyConditionExpression:
        'tenantId = :tenantId AND #sortKey BETWEEN :from AND :to',
      ExpressionAttributeNames: {
        '#sortKey': 'userId#timestamp',
      },
      ExpressionAttributeValues: {
        ':tenantId': tenantId,
        ':from': `${userId}#${from}`,
        ':to': `${userId}#${to}\uffff`,
      },
      ScanIndexForward: true,
      Limit: limit,
      ExclusiveStartKey: nextToken
        ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
        : undefined,
    })
  );

  const items = (result.Items || []).map(mapItemToEntry);
  const encodedNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { items, nextToken: encodedNextToken };
}

/**
 * Queries audit logs by time range using the primary table.
 */
async function queryByTimeRange(
  tenantId: string,
  from: string,
  to: string,
  limit: number,
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
      ExclusiveStartKey: nextToken
        ? JSON.parse(Buffer.from(nextToken, 'base64').toString())
        : undefined,
    })
  );

  const items = (result.Items || []).map(mapItemToEntry);
  const encodedNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return { items, nextToken: encodedNextToken };
}

/**
 * Core query logic that selects the appropriate index based on filters.
 */
export async function queryLogs(params: {
  tenantId: string;
  from: string;
  to: string;
  actionType?: string;
  userId?: string;
  limit?: number;
  nextToken?: string;
}): Promise<{ items: AuditEntry[]; nextToken?: string }> {
  const limit = Math.min(params.limit || DEFAULT_LIMIT, MAX_LIMIT);

  // Use the most selective GSI based on provided filters
  if (params.actionType) {
    return queryByActionType(
      params.tenantId,
      params.actionType,
      params.from,
      params.to,
      limit,
      params.nextToken
    );
  }

  if (params.userId) {
    return queryByUserId(
      params.tenantId,
      params.userId,
      params.from,
      params.to,
      limit,
      params.nextToken
    );
  }

  return queryByTimeRange(
    params.tenantId,
    params.from,
    params.to,
    limit,
    params.nextToken
  );
}

/**
 * Lambda handler for GET /v1/audit/logs
 * Query params: tenantId, from, to, actionType, userId, limit, nextToken
 */
export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const params = event.queryStringParameters || {};

    const tenantId = params.tenantId;
    const from = params.from;
    const to = params.to;

    if (!tenantId || !from || !to) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required query parameters: tenantId, from, to',
        }),
      };
    }

    if (!validateDateRange(from, to)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: `Date range must not exceed ${MAX_DATE_RANGE_DAYS} days and 'from' must be before 'to'`,
        }),
      };
    }

    const actionType = params.actionType as AuditActionType | undefined;
    const userId = params.userId;
    const limit = params.limit ? parseInt(params.limit, 10) : undefined;
    const nextToken = params.nextToken;

    const result = await queryLogs({
      tenantId,
      from,
      to,
      actionType,
      userId,
      limit,
      nextToken,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: result.items,
        nextToken: result.nextToken,
        count: result.items.length,
      }),
    };
  } catch (error) {
    console.error('Failed to query audit logs:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
