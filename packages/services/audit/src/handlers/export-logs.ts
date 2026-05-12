import { randomUUID } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AuditEntry, AuditExportRequest } from '@travel-policy/shared';
import { queryByTimeRange } from '../lib/audit-repository.js';

const s3Client = new S3Client({});

const EXPORT_BUCKET = process.env.AUDIT_EXPORT_BUCKET || 'audit-exports';
const PRESIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

/**
 * Converts an array of audit entries to CSV format.
 */
export function entriesToCsv(entries: AuditEntry[]): string {
  const headers = [
    'eventId',
    'tenantId',
    'timestamp',
    'userId',
    'actionType',
    'resourceType',
    'resourceId',
    'outcome',
    'sourceIp',
    'correlationId',
    'integrityHash',
    'previousHash',
    'metadata',
  ];

  const rows = entries.map((entry) => {
    return [
      entry.eventId,
      entry.tenantId,
      entry.timestamp,
      entry.userId,
      entry.actionType,
      entry.resourceType,
      entry.resourceId,
      entry.outcome,
      entry.sourceIp,
      entry.correlationId,
      entry.integrityHash,
      entry.previousHash,
      entry.metadata ? JSON.stringify(entry.metadata).replace(/"/g, '""') : '',
    ]
      .map((field) => `"${field}"`)
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Fetches all audit entries for the given date range by paginating through results.
 */
async function fetchAllEntries(
  tenantId: string,
  from: string,
  to: string
): Promise<AuditEntry[]> {
  const allEntries: AuditEntry[] = [];
  let nextToken: string | undefined;

  do {
    const result = await queryByTimeRange(tenantId, from, to, 1000, nextToken);
    allEntries.push(...result.items);
    nextToken = result.nextToken;
  } while (nextToken);

  return allEntries;
}

/**
 * Core export logic: fetches entries, formats them, uploads to S3, returns presigned URL.
 */
export async function exportLogs(request: AuditExportRequest): Promise<{
  jobId: string;
  downloadUrl: string;
  totalEntries: number;
  expiresAt: string;
}> {
  const jobId = randomUUID();
  const { tenantId, fromDate, toDate, format } = request;

  // Fetch all entries in the date range
  const entries = await fetchAllEntries(tenantId, fromDate, toDate);

  // Format the data
  let body: string;
  let contentType: string;
  let fileExtension: string;

  if (format === 'csv') {
    body = entriesToCsv(entries);
    contentType = 'text/csv';
    fileExtension = 'csv';
  } else {
    body = JSON.stringify({ entries, exportedAt: new Date().toISOString(), totalEntries: entries.length }, null, 2);
    contentType = 'application/json';
    fileExtension = 'json';
  }

  // Upload to S3
  const s3Key = `exports/${tenantId}/${jobId}.${fileExtension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
      Metadata: {
        tenantId,
        fromDate,
        toDate,
        format,
        totalEntries: String(entries.length),
      },
    })
  );

  // Generate presigned URL for download
  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: EXPORT_BUCKET,
      Key: s3Key,
    }),
    { expiresIn: PRESIGNED_URL_EXPIRY_SECONDS }
  );

  const expiresAt = new Date(
    Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * 1000
  ).toISOString();

  return {
    jobId,
    downloadUrl,
    totalEntries: entries.length,
    expiresAt,
  };
}

/**
 * Lambda handler for POST /v1/audit/export
 * Body: { tenantId, fromDate, toDate, format, filters? }
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

    const request: AuditExportRequest = JSON.parse(event.body);

    // Validate required fields
    if (!request.tenantId || !request.fromDate || !request.toDate || !request.format) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields: tenantId, fromDate, toDate, format',
        }),
      };
    }

    if (!['json', 'csv'].includes(request.format)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: "Format must be 'json' or 'csv'",
        }),
      };
    }

    const result = await exportLogs(request);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Failed to export audit logs:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
