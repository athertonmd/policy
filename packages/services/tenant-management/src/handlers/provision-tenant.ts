/**
 * Lambda handler: Provision a new tenant.
 * Creates isolated resources (schema, KMS key, Cognito user pool)
 * and stores the tenant record in platform.tenants.
 *
 * Requirements: 1.1, 1.2, 1.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { ProvisionTenantRequest, Tenant, TenantConfig } from '@travel-policy/shared';
import { randomUUID } from 'node:crypto';
import { withDatabase } from '../lib/database.js';
import { provisionTenantResources } from '../lib/provisioning.js';
import { rollbackProvisioning, type RollbackContext } from '../lib/rollback.js';

const VALID_REGIONS = ['uk', 'eu', 'us', 'anz'] as const;
const VALID_PLANS = ['standard', 'enterprise'] as const;

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
    // Parse and validate request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: ProvisionTenantRequest;
    try {
      request = JSON.parse(event.body) as ProvisionTenantRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate required fields
    const validationError = validateProvisionRequest(request);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    const tenantId = randomUUID();
    const rollbackContext: RollbackContext = { tenantId };

    const tenant = await withDatabase(async (db) => {
      try {
        // Provision isolated resources
        const result = await provisionTenantResources(db, {
          tenantId,
          organisationName: request.organisationName,
          dataResidencyRegion: request.dataResidencyRegion,
          adminEmail: request.adminEmail,
          plan: request.plan,
        });

        rollbackContext.schemaName = result.schemaName;
        rollbackContext.kmsKeyArn = result.kmsKeyArn;
        rollbackContext.cognitoUserPoolId = result.cognitoUserPoolId;

        // Build tenant config
        const config: TenantConfig = {};
        if (request.identityProviderConfig) {
          config.identityProvider = request.identityProviderConfig;
        }
        if (request.encryptionConfig) {
          config.encryption = request.encryptionConfig;
        }

        // Store tenant record
        const insertResult = await db.query<TenantRow>(
          `INSERT INTO platform.tenants 
            (tenant_id, organisation_name, data_residency_region, status, schema_name, kms_key_arn, cognito_user_pool_id, plan, config)
           VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8)
           RETURNING tenant_id, organisation_name, data_residency_region, status, schema_name, kms_key_arn, cognito_user_pool_id, plan, config, created_at`,
          [
            tenantId,
            request.organisationName,
            request.dataResidencyRegion,
            result.schemaName,
            result.kmsKeyArn,
            result.cognitoUserPoolId,
            request.plan,
            JSON.stringify(config),
          ]
        );

        const row = insertResult.rows[0];
        return mapRowToTenant(row);
      } catch (provisionError) {
        // Rollback on failure (Requirement 1.5)
        const rollbackResult = await rollbackProvisioning(db, rollbackContext);

        if (!rollbackResult.success) {
          console.error('Rollback encountered errors:', rollbackResult.errors);
        }

        throw provisionError;
      }
    });

    return {
      statusCode: 201,
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
    console.error('Provisioning failed:', error);
    return errorResponse(
      500,
      'PROVISIONING_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred during provisioning',
      requestId
    );
  }
}

function validateProvisionRequest(request: ProvisionTenantRequest): string | null {
  if (!request.organisationName || request.organisationName.trim().length === 0) {
    return 'organisationName is required';
  }
  if (request.organisationName.length > 255) {
    return 'organisationName must be 255 characters or fewer';
  }
  if (!request.dataResidencyRegion) {
    return 'dataResidencyRegion is required';
  }
  if (!VALID_REGIONS.includes(request.dataResidencyRegion)) {
    return `dataResidencyRegion must be one of: ${VALID_REGIONS.join(', ')}`;
  }
  if (!request.adminEmail || !request.adminEmail.includes('@')) {
    return 'A valid adminEmail is required';
  }
  if (!request.plan) {
    return 'plan is required';
  }
  if (!VALID_PLANS.includes(request.plan)) {
    return `plan must be one of: ${VALID_PLANS.join(', ')}`;
  }
  return null;
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
