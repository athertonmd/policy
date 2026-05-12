/**
 * Lambda handler: List tenants with filtering and pagination.
 *
 * Requirements: 1.1, 1.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { Tenant, TenantConfig, PaginatedResult } from '@travel-policy/shared';
import { withDatabase } from '../lib/database.js';

interface TenantRow {
  tenant_id: string;
  organisation_name: string;
  data_residency_region: string;
  status: string;
  schema_name: string;
  kms_key_arn: string;
  cognito_user_pool_id: string;
  plan: string;
  config: TenantConfig;
  created_at: string;
}

interface CountRow {
  count: string;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    // Parse query parameters
    const params = event.queryStringParameters ?? {};
    const status = params.status;
    const region = params.region;
    const plan = params.plan;
    const search = params.search;
    const nextToken = params.nextToken;
    const limitParam = params.limit;

    // Validate and parse pagination
    let limit = DEFAULT_PAGE_SIZE;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (isNaN(parsed) || parsed < 1) {
        return errorResponse(400, 'INVALID_LIMIT', 'limit must be a positive integer', requestId);
      }
      limit = Math.min(parsed, MAX_PAGE_SIZE);
    }

    let offset = 0;
    if (nextToken) {
      try {
        offset = parseInt(Buffer.from(nextToken, 'base64').toString('utf-8'), 10);
        if (isNaN(offset) || offset < 0) {
          offset = 0;
        }
      } catch {
        return errorResponse(400, 'INVALID_NEXT_TOKEN', 'nextToken is invalid', requestId);
      }
    }

    // Validate filter values
    if (status && !['provisioning', 'active', 'suspended', 'decommissioned'].includes(status)) {
      return errorResponse(400, 'INVALID_STATUS', 'status must be one of: provisioning, active, suspended, decommissioned', requestId);
    }
    if (region && !['uk', 'eu', 'us', 'anz'].includes(region)) {
      return errorResponse(400, 'INVALID_REGION', 'region must be one of: uk, eu, us, anz', requestId);
    }
    if (plan && !['standard', 'enterprise'].includes(plan)) {
      return errorResponse(400, 'INVALID_PLAN', 'plan must be one of: standard, enterprise', requestId);
    }

    const result = await withDatabase(async (db) => {
      // Build dynamic WHERE clause
      const conditions: string[] = [];
      const queryParams: unknown[] = [];
      let paramIndex = 1;

      if (status) {
        conditions.push(`status = $${paramIndex++}`);
        queryParams.push(status);
      }
      if (region) {
        conditions.push(`data_residency_region = $${paramIndex++}`);
        queryParams.push(region);
      }
      if (plan) {
        conditions.push(`plan = $${paramIndex++}`);
        queryParams.push(plan);
      }
      if (search) {
        conditions.push(`organisation_name ILIKE $${paramIndex++}`);
        queryParams.push(`%${search}%`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await db.query<CountRow>(
        `SELECT COUNT(*) as count FROM platform.tenants ${whereClause}`,
        queryParams
      );
      const totalCount = parseInt(countResult.rows[0].count, 10);

      // Get paginated results
      const dataParams = [...queryParams, limit, offset];
      const dataResult = await db.query<TenantRow>(
        `SELECT tenant_id, organisation_name, data_residency_region, status, schema_name, kms_key_arn, cognito_user_pool_id, plan, config, created_at
         FROM platform.tenants ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        dataParams
      );

      const items = dataResult.rows.map(mapRowToTenant);
      const hasMore = offset + limit < totalCount;
      const newNextToken = hasMore
        ? Buffer.from(String(offset + limit)).toString('base64')
        : undefined;

      const paginatedResult: PaginatedResult<Tenant> = {
        items,
        totalCount,
        nextToken: newNextToken,
        hasMore,
      };

      return paginatedResult;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: result,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('List tenants failed:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

function mapRowToTenant(row: TenantRow): Tenant {
  return {
    tenantId: row.tenant_id,
    organisationName: row.organisation_name,
    dataResidencyRegion: row.data_residency_region as Tenant['dataResidencyRegion'],
    status: row.status as Tenant['status'],
    schemaName: row.schema_name,
    kmsKeyArn: row.kms_key_arn,
    cognitoUserPoolId: row.cognito_user_pool_id,
    createdAt: row.created_at,
    config: row.config,
  };
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    }),
  };
}
