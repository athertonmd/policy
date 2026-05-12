/**
 * POST /v1/profiles/{travellerId}/export
 *
 * Collects all personal data for the specified traveller across all tables.
 * Generates a machine-readable JSON export, uploads to S3, and returns
 * a presigned download URL.
 *
 * Must be completable within 72 hours (can be async with status polling).
 *
 * Requirements: 20.3
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  extractClaimsFromEvent,
  extractTenantIdFromClaims,
  resolveTenantContext,
  scopeConnectionToTenant,
  resetConnectionScope,
} from '@travel-policy/shared';
import { createDatabaseClient, type DatabaseClient } from '../lib/database.js';
import { decryptField } from '../lib/pii-encryption.js';

const s3Client = new S3Client({});
const eventBridgeClient = new EventBridgeClient({});

interface PersonalDataExport {
  exportId: string;
  travellerId: string;
  tenantId: string;
  generatedAt: string;
  format: 'json';
  dataCategories: {
    profile: Record<string, unknown> | null;
    preferences: Record<string, unknown> | null;
    loyaltyProgrammes: unknown[] | null;
    policyDecisions: unknown[];
    approvalWorkflows: unknown[];
    approvalActions: unknown[];
    policyOverrides: unknown[];
  };
}

/**
 * Collects all personal data for a traveller from the tenant schema.
 */
async function collectPersonalData(
  db: DatabaseClient,
  schemaName: string,
  travellerId: string,
  kmsKeyArn: string
): Promise<PersonalDataExport['dataCategories']> {
  // Fetch profile data
  const profileResult = await db.query<Record<string, unknown>>(
    `SELECT traveller_id, employee_id, email, full_name, department,
            cost_centre, seniority_level, region, manager_id,
            preferences, loyalty_programmes,
            passport_details_encrypted, emergency_contact_encrypted,
            status, created_at, updated_at
     FROM "${schemaName}".traveller_profiles
     WHERE traveller_id = $1`,
    [travellerId]
  );

  let profile: Record<string, unknown> | null = null;
  let preferences: Record<string, unknown> | null = null;
  let loyaltyProgrammes: unknown[] | null = null;

  if (profileResult.rowCount > 0) {
    const row = profileResult.rows[0];
    profile = {
      travellerId: row.traveller_id,
      employeeId: row.employee_id,
      email: row.email,
      fullName: row.full_name,
      department: row.department,
      costCentre: row.cost_centre,
      seniorityLevel: row.seniority_level,
      region: row.region,
      managerId: row.manager_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    // Decrypt PII fields for export
    if (row.passport_details_encrypted && kmsKeyArn) {
      try {
        profile.passportDetails = await decryptField(
          row.passport_details_encrypted as string,
          kmsKeyArn
        );
      } catch {
        profile.passportDetails = '[encrypted - decryption unavailable]';
      }
    }

    if (row.emergency_contact_encrypted && kmsKeyArn) {
      try {
        profile.emergencyContact = await decryptField(
          row.emergency_contact_encrypted as string,
          kmsKeyArn
        );
      } catch {
        profile.emergencyContact = '[encrypted - decryption unavailable]';
      }
    }

    preferences = row.preferences
      ? (typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences)
      : null;

    loyaltyProgrammes = row.loyalty_programmes
      ? (typeof row.loyalty_programmes === 'string' ? JSON.parse(row.loyalty_programmes) : row.loyalty_programmes)
      : null;
  }

  // Fetch policy decisions
  const decisionsResult = await db.query<Record<string, unknown>>(
    `SELECT decision_id, trip_id, decision_point, result, winning_rules,
            reasons, obligations, alternatives, duration_ms, evaluated_at
     FROM "${schemaName}".policy_decisions
     WHERE traveller_id = $1
     ORDER BY evaluated_at DESC`,
    [travellerId]
  );

  // Fetch approval workflows
  const workflowsResult = await db.query<Record<string, unknown>>(
    `SELECT workflow_id, decision_id, trip_request_id, template_id,
            status, current_stage, stages, priority, initiated_at, completed_at
     FROM "${schemaName}".approval_workflows
     WHERE traveller_id = $1
     ORDER BY initiated_at DESC`,
    [travellerId]
  );

  // Fetch approval actions where the traveller was the approver
  const actionsResult = await db.query<Record<string, unknown>>(
    `SELECT aa.action_id, aa.workflow_id, aa.stage_number, aa.action,
            aa.comment, aa.source, aa.acted_at
     FROM "${schemaName}".approval_actions aa
     WHERE aa.approver_id = $1
     ORDER BY aa.acted_at DESC`,
    [travellerId]
  );

  // Fetch policy overrides requested by the traveller
  const overridesResult = await db.query<Record<string, unknown>>(
    `SELECT override_id, decision_id, reason_category, justification,
            status, approved_by, approved_at, created_at
     FROM "${schemaName}".policy_overrides
     WHERE requested_by = $1
     ORDER BY created_at DESC`,
    [travellerId]
  );

  return {
    profile,
    preferences,
    loyaltyProgrammes,
    policyDecisions: decisionsResult.rows,
    approvalWorkflows: workflowsResult.rows,
    approvalActions: actionsResult.rows,
    policyOverrides: overridesResult.rows,
  };
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const travellerId = event.pathParameters?.travellerId;
    if (!travellerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing travellerId path parameter' }),
      };
    }

    // Extract JWT claims and tenant context
    const claims = extractClaimsFromEvent(event as Parameters<typeof extractClaimsFromEvent>[0]);
    const tenantId = extractTenantIdFromClaims(claims);

    const db = await createDatabaseClient();
    try {
      const tenantContext = await resolveTenantContext(db, tenantId);
      await scopeConnectionToTenant(db, tenantContext.schemaName);

      // Verify the profile exists
      const existsResult = await db.query(
        `SELECT traveller_id FROM "${tenantContext.schemaName}".traveller_profiles WHERE traveller_id = $1`,
        [travellerId]
      );

      if (existsResult.rowCount === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Profile not found' }),
        };
      }

      const kmsKeyArn = process.env.TENANT_KMS_KEY_ARN || '';

      // Collect all personal data
      const dataCategories = await collectPersonalData(
        db,
        tenantContext.schemaName,
        travellerId,
        kmsKeyArn
      );

      await resetConnectionScope(db);

      // Build the export document
      const exportId = `export-${travellerId}-${Date.now()}`;
      const exportDocument: PersonalDataExport = {
        exportId,
        travellerId,
        tenantId,
        generatedAt: new Date().toISOString(),
        format: 'json',
        dataCategories,
      };

      // Upload to S3
      const bucketName = process.env.DATA_EXPORT_BUCKET || 'travel-policy-data-exports';
      const s3Key = `exports/${tenantId}/${travellerId}/${exportId}.json`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
          Body: JSON.stringify(exportDocument, null, 2),
          ContentType: 'application/json',
          ServerSideEncryption: 'aws:kms',
          SSEKMSKeyId: kmsKeyArn || undefined,
          Metadata: {
            'tenant-id': tenantId,
            'traveller-id': travellerId,
            'export-id': exportId,
          },
        })
      );

      // Generate presigned download URL (valid for 24 hours)
      const presignedUrl = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucketName,
          Key: s3Key,
        }),
        { expiresIn: 86400 } // 24 hours
      );

      // Publish data export event for audit
      const eventBusName = process.env.EVENT_BUS_NAME || 'travel-policy-platform';
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.traveller-profile',
              DetailType: 'ProfileUpdated',
              Detail: JSON.stringify({
                tenantId,
                travellerId,
                action: 'data-export',
                exportId,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: eventBusName,
            },
          ],
        })
      );

      console.log('Personal data export completed:', {
        exportId,
        travellerId,
        tenantId,
      });

      return {
        statusCode: 200,
        body: JSON.stringify({
          exportId,
          travellerId,
          status: 'completed',
          downloadUrl: presignedUrl,
          expiresAt: new Date(Date.now() + 86400 * 1000).toISOString(),
          generatedAt: exportDocument.generatedAt,
          format: 'json',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    } finally {
      await db.end();
    }
  } catch (error) {
    const err = error as Error;

    if (err.name === 'TenantContextError') {
      const statusCode = (err as { statusCode?: number }).statusCode || 403;
      return {
        statusCode,
        body: JSON.stringify({ error: err.message }),
      };
    }

    console.error('Error exporting personal data:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
