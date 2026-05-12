/**
 * Lambda handler: Decommission a tenant.
 * Performs soft-delete by updating status and cleaning up resources
 * while preserving data for retention requirements.
 *
 * Requirements: 1.1, 1.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { TenantConfig } from '@travel-policy/shared';
import { withDatabase } from '../lib/database.js';
import { cleanupDecommissionedTenant } from '../lib/rollback.js';

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

interface DecommissionRequest {
  reason: string;
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

    // Parse request body for reason
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body with reason is required', requestId);
    }

    let request: DecommissionRequest;
    try {
      request = JSON.parse(event.body) as DecommissionRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    if (!request.reason || request.reason.trim().length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'reason is required for decommissioning', requestId);
    }

    if (request.reason.length > 1000) {
      return errorResponse(400, 'VALIDATION_ERROR', 'reason must be 1000 characters or fewer', requestId);
    }

    await withDatabase(async (db) => {
      // Check tenant exists
      const existingResult = await db.query<TenantRow>(
        'SELECT * FROM platform.tenants WHERE tenant_id = $1',
        [tenantId]
      );

      if (existingResult.rowCount === 0) {
        throw new DecommissionError(404, 'TENANT_NOT_FOUND', `Tenant ${tenantId} not found`);
      }

      const tenant = existingResult.rows[0];

      if (tenant.status === 'decommissioned') {
        throw new DecommissionError(
          409,
          'ALREADY_DECOMMISSIONED',
          `Tenant ${tenantId} is already decommissioned`
        );
      }

      // Perform soft-delete: update status and timestamp
      await db.query(
        `UPDATE platform.tenants 
         SET status = 'decommissioned', decommissioned_at = NOW()
         WHERE tenant_id = $1`,
        [tenantId]
      );

      // Clean up resources (disable KMS key, lock Cognito pool, revoke schema access)
      const cleanupResult = await cleanupDecommissionedTenant(
        db,
        tenantId,
        tenant.schema_name,
        tenant.kms_key_arn,
        tenant.cognito_user_pool_id
      );

      if (!cleanupResult.success) {
        console.warn(
          `Decommission cleanup had errors for tenant ${tenantId}:`,
          cleanupResult.errors
        );
        // We don't fail the request - the tenant is marked as decommissioned
        // and cleanup errors are logged for manual resolution
      }

      // Log the decommission reason (would normally go to audit service)
      console.info('Tenant decommissioned', {
        tenantId,
        reason: request.reason,
        cleanupErrors: cleanupResult.errors,
      });
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Tenant ${tenantId} has been decommissioned`,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    if (error instanceof DecommissionError) {
      return errorResponse(error.statusCode, error.code, error.message, requestId);
    }
    console.error('Decommission failed:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

class DecommissionError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'DecommissionError';
  }
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
