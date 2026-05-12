/**
 * Lambda handler: Update tenant configuration.
 * Validates the configuration and updates the tenant record.
 *
 * Requirements: 1.1, 1.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { Tenant, TenantConfig, IdentityProviderConfig, EncryptionConfig, DataRetentionConfig } from '@travel-policy/shared';
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

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let config: TenantConfig;
    try {
      config = JSON.parse(event.body) as TenantConfig;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate configuration
    const validationError = validateTenantConfig(config);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    const tenant = await withDatabase(async (db) => {
      // Check tenant exists and is active
      const existingResult = await db.query<TenantRow>(
        'SELECT * FROM platform.tenants WHERE tenant_id = $1',
        [tenantId]
      );

      if (existingResult.rowCount === 0) {
        return null;
      }

      const existing = existingResult.rows[0];
      if (existing.status === 'decommissioned') {
        throw new ConfigUpdateError(
          'TENANT_DECOMMISSIONED',
          'Cannot update configuration for a decommissioned tenant'
        );
      }

      // Merge new config with existing config
      const mergedConfig: TenantConfig = {
        ...existing.config,
        ...config,
      };

      // Update the tenant record
      const updateResult = await db.query<TenantRow>(
        `UPDATE platform.tenants 
         SET config = $1
         WHERE tenant_id = $2
         RETURNING tenant_id, organisation_name, data_residency_region, status, schema_name, kms_key_arn, cognito_user_pool_id, plan, config, created_at`,
        [JSON.stringify(mergedConfig), tenantId]
      );

      return mapRowToTenant(updateResult.rows[0]);
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
    if (error instanceof ConfigUpdateError) {
      return errorResponse(409, error.code, error.message, requestId);
    }
    console.error('Update tenant config failed:', error);
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

class ConfigUpdateError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ConfigUpdateError';
  }
}

function validateTenantConfig(config: TenantConfig): string | null {
  if (config.identityProvider) {
    const idpError = validateIdentityProviderConfig(config.identityProvider);
    if (idpError) return idpError;
  }

  if (config.encryption) {
    const encError = validateEncryptionConfig(config.encryption);
    if (encError) return encError;
  }

  if (config.dataRetention) {
    const retError = validateDataRetentionConfig(config.dataRetention);
    if (retError) return retError;
  }

  if (config.features) {
    if (typeof config.features !== 'object') {
      return 'features must be an object with boolean values';
    }
    for (const [key, value] of Object.entries(config.features)) {
      if (typeof value !== 'boolean') {
        return `features.${key} must be a boolean`;
      }
    }
  }

  return null;
}

function validateIdentityProviderConfig(config: IdentityProviderConfig): string | null {
  const validTypes = ['saml', 'oidc'];
  if (!validTypes.includes(config.type)) {
    return `identityProvider.type must be one of: ${validTypes.join(', ')}`;
  }
  if (config.type === 'saml' && !config.metadataUrl) {
    return 'identityProvider.metadataUrl is required for SAML providers';
  }
  if (config.type === 'oidc') {
    if (!config.clientId) {
      return 'identityProvider.clientId is required for OIDC providers';
    }
    if (!config.issuer) {
      return 'identityProvider.issuer is required for OIDC providers';
    }
  }
  return null;
}

function validateEncryptionConfig(config: EncryptionConfig): string | null {
  if (config.keyRotationDays !== undefined) {
    if (typeof config.keyRotationDays !== 'number' || config.keyRotationDays < 1) {
      return 'encryption.keyRotationDays must be a positive number';
    }
    if (config.keyRotationDays > 365 * 3) {
      return 'encryption.keyRotationDays must not exceed 1095 (3 years)';
    }
  }
  if (config.customerManagedKey && !config.customerKeyArn) {
    return 'encryption.customerKeyArn is required when customerManagedKey is true';
  }
  return null;
}

function validateDataRetentionConfig(config: DataRetentionConfig): string | null {
  const fields: Array<{ name: string; value: number }> = [
    { name: 'transactionalDays', value: config.transactionalDays },
    { name: 'auditDays', value: config.auditDays },
    { name: 'personalDataDays', value: config.personalDataDays },
    { name: 'analyticalDays', value: config.analyticalDays },
  ];

  for (const field of fields) {
    if (field.value !== undefined) {
      if (typeof field.value !== 'number' || field.value < 1) {
        return `dataRetention.${field.name} must be a positive number`;
      }
    }
  }

  // Audit data must be retained for at least 7 years (2555 days) per requirement 11.5
  if (config.auditDays !== undefined && config.auditDays < 2555) {
    return 'dataRetention.auditDays must be at least 2555 (7 years) per regulatory requirements';
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
