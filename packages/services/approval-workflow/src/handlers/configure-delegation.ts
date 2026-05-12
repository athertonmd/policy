/**
 * Lambda handler: Configure approval delegation.
 * POST /v1/approvals/delegations
 *
 * Allows an approver to designate a substitute during absence periods.
 * When an approval is routed to an approver with an active delegation,
 * it will be redirected to the delegate.
 *
 * Requirements: 8.6, 8.7
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { randomUUID } from 'node:crypto';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, extractUserId, successResponse, errorResponse } from './shared.js';

export interface DelegationRecord {
  delegationId: string;
  tenantId: string;
  approverId: string;
  delegateToId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

/**
 * Create a delegation record in the tenant's delegations table.
 */
export async function createDelegation(
  db: DatabaseClient,
  tenantId: string,
  delegation: Omit<DelegationRecord, 'createdAt'>
): Promise<DelegationRecord> {
  const now = new Date().toISOString();

  const result = await db.query<DelegationRecord>(
    `INSERT INTO "${tenantId}".approval_delegations
      (delegation_id, tenant_id, approver_id, delegate_to_id, start_date, end_date, reason, is_active, created_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING
       delegation_id AS "delegationId",
       tenant_id AS "tenantId",
       approver_id AS "approverId",
       delegate_to_id AS "delegateToId",
       start_date AS "startDate",
       end_date AS "endDate",
       reason,
       is_active AS "isActive",
       created_at AS "createdAt",
       created_by AS "createdBy"`,
    [
      delegation.delegationId,
      tenantId,
      delegation.approverId,
      delegation.delegateToId,
      delegation.startDate,
      delegation.endDate,
      delegation.reason ?? null,
      delegation.isActive,
      now,
      delegation.createdBy,
    ]
  );

  return result.rows[0];
}

/**
 * Find an active delegation for a given approver at a specific point in time.
 */
export async function findActiveDelegation(
  db: DatabaseClient,
  tenantId: string,
  approverId: string,
  atDate?: string
): Promise<DelegationRecord | null> {
  const checkDate = atDate ?? new Date().toISOString();

  const result = await db.query<DelegationRecord>(
    `SELECT
       delegation_id AS "delegationId",
       tenant_id AS "tenantId",
       approver_id AS "approverId",
       delegate_to_id AS "delegateToId",
       start_date AS "startDate",
       end_date AS "endDate",
       reason,
       is_active AS "isActive",
       created_at AS "createdAt",
       created_by AS "createdBy"
     FROM "${tenantId}".approval_delegations
     WHERE approver_id = $1
       AND is_active = true
       AND start_date <= $2
       AND end_date >= $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [approverId, checkDate]
  );

  return result.rows[0] ?? null;
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

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const body = JSON.parse(event.body) as {
      approverId?: string;
      delegateToId?: string;
      startDate?: string;
      endDate?: string;
      reason?: string;
    };

    // Validate required fields
    if (!body.approverId || !body.delegateToId || !body.startDate || !body.endDate) {
      return errorResponse(
        400,
        'MISSING_FIELDS',
        'approverId, delegateToId, startDate, and endDate are required',
        requestId
      );
    }

    // Validate date range
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return errorResponse(
        400,
        'INVALID_DATES',
        'startDate and endDate must be valid ISO date strings',
        requestId
      );
    }

    if (endDate <= startDate) {
      return errorResponse(
        400,
        'INVALID_DATE_RANGE',
        'endDate must be after startDate',
        requestId
      );
    }

    // Cannot delegate to self
    if (body.approverId === body.delegateToId) {
      return errorResponse(
        400,
        'SELF_DELEGATION',
        'An approver cannot delegate to themselves',
        requestId
      );
    }

    const userId = extractUserId(event);
    const delegationId = randomUUID();

    const delegation = await withDatabase(async (db) => {
      // Deactivate any existing overlapping delegations for this approver
      await db.query(
        `UPDATE "${tenantId}".approval_delegations
         SET is_active = false
         WHERE approver_id = $1
           AND is_active = true
           AND start_date <= $2
           AND end_date >= $3`,
        [body.approverId, body.endDate, body.startDate]
      );

      // Create the new delegation
      return createDelegation(db, tenantId, {
        delegationId,
        tenantId,
        approverId: body.approverId!,
        delegateToId: body.delegateToId!,
        startDate: body.startDate!,
        endDate: body.endDate!,
        reason: body.reason ?? null,
        isActive: true,
        createdBy: userId,
      });
    });

    return successResponse(201, delegation, requestId);
  } catch (error) {
    console.error('Configure delegation failed:', error);
    return errorResponse(
      500,
      'DELEGATION_CONFIGURATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
