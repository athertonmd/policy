/**
 * Lambda handler: Approve or reject a policy override.
 * POST /v1/overrides/{overrideId}/approve
 *
 * Updates the override status to 'approved' or 'rejected',
 * records the decision in the audit trail with full context,
 * and publishes a PolicyOverrideApproved event to EventBridge.
 *
 * Requirements: 10.2, 10.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';
import type { OverrideRecord } from './request-override.js';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

/**
 * Get an override record by ID.
 */
async function getOverride(
  db: DatabaseClient,
  tenantId: string,
  overrideId: string
): Promise<OverrideRecord | null> {
  const result = await db.query<OverrideRecord>(
    `SELECT
       override_id AS "overrideId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       requested_by AS "requestedBy",
       reason_category AS "reasonCategory",
       justification,
       status,
       approved_by AS "approvedBy",
       approver_comment AS "approverComment",
       workflow_id AS "workflowId",
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM "${tenantId}".policy_overrides
     WHERE override_id = $1`,
    [overrideId]
  );

  return result.rows[0] ?? null;
}

/**
 * Update override status to approved or rejected.
 */
async function updateOverrideStatus(
  db: DatabaseClient,
  tenantId: string,
  overrideId: string,
  status: 'approved' | 'rejected',
  approverId: string,
  comment: string | null
): Promise<OverrideRecord | null> {
  const now = new Date().toISOString();

  const result = await db.query<OverrideRecord>(
    `UPDATE "${tenantId}".policy_overrides
     SET status = $2,
         approved_by = $3,
         approver_comment = $4,
         updated_at = $5
     WHERE override_id = $1
     RETURNING
       override_id AS "overrideId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       requested_by AS "requestedBy",
       reason_category AS "reasonCategory",
       justification,
       status,
       approved_by AS "approvedBy",
       approver_comment AS "approverComment",
       workflow_id AS "workflowId",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [overrideId, status, approverId, comment, now]
  );

  return result.rows[0] ?? null;
}

/**
 * Record the override approval in the audit trail.
 */
async function recordOverrideAudit(
  db: DatabaseClient,
  tenantId: string,
  override: OverrideRecord,
  approverId: string,
  action: 'approved' | 'rejected',
  comment: string | null
): Promise<void> {
  const now = new Date().toISOString();
  const auditId = crypto.randomUUID();

  try {
    await db.query(
      `INSERT INTO "${tenantId}".override_audit_trail
        (audit_id, override_id, tenant_id, action, actor_id, reason_category,
         justification, decision_id, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        auditId,
        override.overrideId,
        tenantId,
        action,
        approverId,
        override.reasonCategory,
        override.justification,
        override.decisionId,
        comment,
        now,
      ]
    );
  } catch (error) {
    // Audit table may not exist yet; log but don't fail the operation
    console.warn('Failed to record override audit trail:', error);
  }
}

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    // Extract overrideId from path parameters
    const overrideId = event.pathParameters?.overrideId;
    if (!overrideId) {
      return errorResponse(400, 'MISSING_OVERRIDE_ID', 'Override ID is required in path', requestId);
    }

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const body = JSON.parse(event.body) as {
      approverId?: string;
      action?: 'approve' | 'reject';
      comment?: string;
    };

    // Validate required fields
    if (!body.approverId) {
      return errorResponse(
        400,
        'MISSING_FIELDS',
        'approverId is required',
        requestId
      );
    }

    // Default action to 'approve' for backward compatibility
    const action = body.action ?? 'approve';
    if (action !== 'approve' && action !== 'reject') {
      return errorResponse(
        400,
        'INVALID_ACTION',
        'action must be either "approve" or "reject"',
        requestId
      );
    }

    const result = await withDatabase(async (db) => {
      // 1. Get the override record
      const override = await getOverride(db, tenantId, overrideId);
      if (!override) {
        return { error: 'OVERRIDE_NOT_FOUND' as const };
      }

      // 2. Validate override is in pending state
      if (override.status !== 'pending') {
        return { error: 'OVERRIDE_NOT_PENDING' as const, currentStatus: override.status };
      }

      // 3. Update the override status
      const status = action === 'approve' ? 'approved' : 'rejected';
      const updatedOverride = await updateOverrideStatus(
        db,
        tenantId,
        overrideId,
        status,
        body.approverId!,
        body.comment ?? null
      );

      if (!updatedOverride) {
        return { error: 'UPDATE_FAILED' as const };
      }

      // 4. Record in audit trail
      await recordOverrideAudit(
        db,
        tenantId,
        updatedOverride,
        body.approverId!,
        status,
        body.comment ?? null
      );

      return { override: updatedOverride };
    });

    if ('error' in result) {
      switch (result.error) {
        case 'OVERRIDE_NOT_FOUND':
          return errorResponse(404, 'OVERRIDE_NOT_FOUND', 'Override not found', requestId);
        case 'OVERRIDE_NOT_PENDING':
          return errorResponse(
            409,
            'OVERRIDE_NOT_PENDING',
            `Override is already in '${(result as { currentStatus: string }).currentStatus}' state`,
            requestId
          );
        case 'UPDATE_FAILED':
          return errorResponse(500, 'UPDATE_FAILED', 'Failed to update override', requestId);
        default:
          return errorResponse(500, 'UNKNOWN_ERROR', 'An unexpected error occurred', requestId);
      }
    }

    const { override: updatedOverride } = result as { override: OverrideRecord };

    // 5. Publish PolicyOverrideApproved/Rejected event
    const eventType = action === 'approve' ? 'PolicyOverrideApproved' : 'PolicyOverrideRejected';
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.approval-workflow',
              DetailType: eventType,
              Detail: JSON.stringify({
                overrideId,
                tenantId,
                decisionId: updatedOverride.decisionId,
                requestedBy: updatedOverride.requestedBy,
                reasonCategory: updatedOverride.reasonCategory,
                approverId: body.approverId,
                action,
                comment: body.comment ?? null,
                requestId,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );
    } catch (eventError) {
      console.error(`Failed to publish ${eventType} event:`, eventError);
    }

    return successResponse(200, updatedOverride, requestId);
  } catch (error) {
    console.error('Approve override failed:', error);
    return errorResponse(
      500,
      'OVERRIDE_APPROVAL_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
