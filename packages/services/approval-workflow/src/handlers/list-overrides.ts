/**
 * Lambda handler: List policy overrides with filtering.
 * GET /v1/overrides
 *
 * Returns a paginated list of active and historical policy overrides
 * with filtering by tenant, time period, override type, and approver.
 *
 * Requirements: 10.4
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';
import type { OverrideRecord } from './request-override.js';
import { REASON_CATEGORIES, type ReasonCategory } from './request-override.js';

export interface OverrideListResponse {
  items: OverrideRecord[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

interface OverrideFilters {
  status?: string;
  reasonCategory?: string;
  requestedBy?: string;
  approvedBy?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

/**
 * Query overrides with dynamic filtering and pagination.
 */
async function queryOverrides(
  db: DatabaseClient,
  tenantId: string,
  filters: OverrideFilters
): Promise<OverrideListResponse> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  // Build dynamic WHERE conditions
  if (filters.status) {
    conditions.push(`status = $${paramIndex}`);
    params.push(filters.status);
    paramIndex++;
  }

  if (filters.reasonCategory) {
    conditions.push(`reason_category = $${paramIndex}`);
    params.push(filters.reasonCategory);
    paramIndex++;
  }

  if (filters.requestedBy) {
    conditions.push(`requested_by = $${paramIndex}`);
    params.push(filters.requestedBy);
    paramIndex++;
  }

  if (filters.approvedBy) {
    conditions.push(`approved_by = $${paramIndex}`);
    params.push(filters.approvedBy);
    paramIndex++;
  }

  if (filters.from) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(filters.from);
    paramIndex++;
  }

  if (filters.to) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(filters.to);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total matching records
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM "${tenantId}".policy_overrides
     ${whereClause}`,
    params
  );

  const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Query with pagination
  const offset = (filters.page - 1) * filters.pageSize;
  const dataParams = [...params, filters.pageSize, offset];
  const limitParamIdx = paramIndex;
  const offsetParamIdx = paramIndex + 1;

  const dataResult = await db.query<OverrideRecord>(
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
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
    dataParams
  );

  return {
    items: dataResult.rows,
    pagination: {
      page: filters.page,
      pageSize: filters.pageSize,
      totalCount,
      totalPages: Math.ceil(totalCount / filters.pageSize),
    },
  };
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

    // Extract and validate query parameters
    const queryParams = event.queryStringParameters ?? {};

    const status = queryParams.status;
    if (status && !['pending', 'approved', 'rejected'].includes(status)) {
      return errorResponse(
        400,
        'INVALID_STATUS',
        'status must be one of: pending, approved, rejected',
        requestId
      );
    }

    const reasonCategory = queryParams.reasonCategory;
    if (reasonCategory && !REASON_CATEGORIES.includes(reasonCategory as ReasonCategory)) {
      return errorResponse(
        400,
        'INVALID_REASON_CATEGORY',
        `reasonCategory must be one of: ${REASON_CATEGORIES.join(', ')}`,
        requestId
      );
    }

    const from = queryParams.from;
    if (from && isNaN(Date.parse(from))) {
      return errorResponse(400, 'INVALID_DATE', 'from must be a valid ISO date string', requestId);
    }

    const to = queryParams.to;
    if (to && isNaN(Date.parse(to))) {
      return errorResponse(400, 'INVALID_DATE', 'to must be a valid ISO date string', requestId);
    }

    const page = Math.max(1, parseInt(queryParams.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(queryParams.pageSize ?? '20', 10)));

    const filters: OverrideFilters = {
      status,
      reasonCategory,
      requestedBy: queryParams.requestedBy,
      approvedBy: queryParams.approvedBy,
      from,
      to,
      page,
      pageSize,
    };

    const result = await withDatabase(async (db) => {
      return queryOverrides(db, tenantId, filters);
    });

    return successResponse(200, result, requestId);
  } catch (error) {
    console.error('List overrides failed:', error);
    return errorResponse(
      500,
      'LIST_OVERRIDES_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
