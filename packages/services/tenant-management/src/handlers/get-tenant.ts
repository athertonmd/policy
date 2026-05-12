/**
 * Lambda handler: Get a single tenant by ID.
 *
 * Requirements: 1.1, 1.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { Tenant, TenantConfig } from '@travel-policy/shared';
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

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    // Extract tenantId from path parameters
    const tenantId = event.pathParameters?.tenantId;
    if (!tenantId) {
      return errorResponse(400, 'MISSING_TENANT_ID', 'tenantId path parameter is required', requestId);
    }

    // Validate UUID format
    if (!isValidUUID(tenantId)) {
      return errorResponse(400, 'INVALID_TENANT_ID', 'tenantId must be a valid UUID', requestId);
    }

    const tenant = await withDatabase(async (db) => {
      const result = await db.query<TenantRow>(
        'SELECT tenant_id, organisation_name, data_residency_region, status, schema_name, kms_key_arn, cognito_user_pool_id, plan, config, created_at FROM platform.tenants WHERE tenant_id = $1',
        [tenantId]
      );

      if (result.rowCount === 0) {
        return null;
      }

      return mapRowToTenant(result.rows[0]);
    });

    if (!tenant) {
      return errorResponse(404, 'TENANT_NOT_FOUND', `Tenant ${tenantId} not found`, requestId);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: tenant,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('Get tenant failed:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
