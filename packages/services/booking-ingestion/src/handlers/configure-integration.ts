/**
 * Lambda handler for integration configuration.
 * POST /v1/integrations — Create a new integration
 * PUT /v1/integrations/{integrationId} — Update an existing integration
 *
 * Accepts: sourceType (obt/gds/tmc), sourceName, authConfig, payloadMapping, retryPolicy.
 * Stores the integration config in the tenant's `integrations` table.
 * Stores the webhook secret in Secrets Manager (encrypted auth details).
 * Returns the created/updated integration (without sensitive auth details).
 *
 * Requirements: 25.1, 25.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  SecretsManagerClient,
  CreateSecretCommand,
  UpdateSecretCommand,
  ResourceNotFoundException,
} from '@aws-sdk/client-secrets-manager';
import { withDatabase } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';
import type {
  IntegrationSourceType,
  WebhookAuthConfig,
  PayloadMappingConfig,
  RetryPolicy,
} from '@travel-policy/shared';
import { randomUUID } from 'crypto';

const secretsClient = new SecretsManagerClient({});

const INTEGRATION_SECRET_PREFIX =
  process.env.INTEGRATION_SECRET_PREFIX ?? 'travel-policy/integrations';

/**
 * Request body for creating/updating an integration.
 */
interface ConfigureIntegrationRequest {
  sourceType: IntegrationSourceType;
  sourceName: string;
  authConfig: WebhookAuthConfig;
  payloadMapping: PayloadMappingConfig;
  retryPolicy?: RetryPolicy;
}

/**
 * Integration record returned to the client (no sensitive auth details).
 */
interface IntegrationResponse {
  integrationId: string;
  tenantId: string;
  sourceType: IntegrationSourceType;
  sourceName: string;
  authConfig: { type: string; headerName?: string; algorithm?: string };
  payloadMapping: PayloadMappingConfig;
  retryPolicy: RetryPolicy;
  status: string;
  healthStatus: string;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 5,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
};

const VALID_SOURCE_TYPES: IntegrationSourceType[] = ['obt', 'gds', 'tmc'];
const VALID_AUTH_TYPES = ['hmac', 'api_key', 'oauth2'];

/**
 * Main Lambda handler for configuring integrations.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId ?? randomUUID();
  const httpMethod = event.httpMethod?.toUpperCase();
  const integrationId = event.pathParameters?.integrationId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let body: ConfigureIntegrationRequest;
    try {
      body = JSON.parse(event.body) as ConfigureIntegrationRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON', requestId);
    }

    // Validate request body
    const validationError = validateRequest(body);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    if (httpMethod === 'PUT' && integrationId) {
      return await updateIntegration(tenantId, integrationId, body, requestId);
    }

    return await createIntegration(tenantId, body, requestId);
  } catch (error) {
    console.error('Error configuring integration', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred', requestId);
  }
}

/**
 * Validates the integration configuration request.
 */
function validateRequest(body: ConfigureIntegrationRequest): string | null {
  if (!body.sourceType || !VALID_SOURCE_TYPES.includes(body.sourceType)) {
    return `sourceType must be one of: ${VALID_SOURCE_TYPES.join(', ')}`;
  }

  if (!body.sourceName || typeof body.sourceName !== 'string' || body.sourceName.trim().length === 0) {
    return 'sourceName is required and must be a non-empty string';
  }

  if (!body.authConfig || typeof body.authConfig !== 'object') {
    return 'authConfig is required';
  }

  if (!VALID_AUTH_TYPES.includes(body.authConfig.type)) {
    return `authConfig.type must be one of: ${VALID_AUTH_TYPES.join(', ')}`;
  }

  if (body.authConfig.type === 'hmac' && !body.authConfig.secret) {
    return 'authConfig.secret is required for HMAC authentication';
  }

  if (body.authConfig.type === 'api_key' && !body.authConfig.secret) {
    return 'authConfig.secret is required for API key authentication';
  }

  if (!body.payloadMapping || typeof body.payloadMapping !== 'object') {
    return 'payloadMapping is required';
  }

  if (!['json', 'xml'].includes(body.payloadMapping.format)) {
    return 'payloadMapping.format must be "json" or "xml"';
  }

  if (!Array.isArray(body.payloadMapping.mappingRules) || body.payloadMapping.mappingRules.length === 0) {
    return 'payloadMapping.mappingRules must be a non-empty array';
  }

  if (body.retryPolicy) {
    if (typeof body.retryPolicy.maxRetries !== 'number' || body.retryPolicy.maxRetries < 0) {
      return 'retryPolicy.maxRetries must be a non-negative number';
    }
    if (typeof body.retryPolicy.backoffMultiplier !== 'number' || body.retryPolicy.backoffMultiplier < 1) {
      return 'retryPolicy.backoffMultiplier must be at least 1';
    }
    if (typeof body.retryPolicy.initialDelayMs !== 'number' || body.retryPolicy.initialDelayMs < 0) {
      return 'retryPolicy.initialDelayMs must be a non-negative number';
    }
  }

  return null;
}

/**
 * Creates a new integration configuration.
 */
async function createIntegration(
  tenantId: string,
  body: ConfigureIntegrationRequest,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const integrationId = randomUUID();
  const now = new Date().toISOString();
  const retryPolicy = body.retryPolicy ?? DEFAULT_RETRY_POLICY;

  // Store the webhook secret in Secrets Manager
  await storeSecret(integrationId, body.authConfig);

  // Store integration config in the database (auth details encrypted via Secrets Manager)
  const integration = await withDatabase(async (client) => {
    const result = await client.query<IntegrationRow>(
      `INSERT INTO platform.integrations (
        integration_id, tenant_id, source_type, source_name,
        auth_config_encrypted, payload_mapping, retry_policy,
        status, health_status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING integration_id, tenant_id, source_type, source_name,
        payload_mapping, retry_policy, status, health_status, created_at, updated_at`,
      [
        integrationId,
        tenantId,
        body.sourceType,
        body.sourceName,
        Buffer.from(JSON.stringify({ type: body.authConfig.type, headerName: body.authConfig.headerName, algorithm: body.authConfig.algorithm })),
        JSON.stringify(body.payloadMapping),
        JSON.stringify(retryPolicy),
        'active',
        'unknown',
        now,
        now,
      ]
    );
    return result.rows[0];
  });

  const response = formatIntegrationResponse(integration, body.authConfig);
  return successResponse(201, response, requestId);
}

/**
 * Updates an existing integration configuration.
 */
async function updateIntegration(
  tenantId: string,
  integrationId: string,
  body: ConfigureIntegrationRequest,
  requestId: string
): Promise<APIGatewayProxyResult> {
  const now = new Date().toISOString();
  const retryPolicy = body.retryPolicy ?? DEFAULT_RETRY_POLICY;

  // Verify the integration belongs to this tenant
  const existing = await withDatabase(async (client) => {
    const result = await client.query<IntegrationRow>(
      `SELECT integration_id, tenant_id FROM platform.integrations
       WHERE integration_id = $1 AND tenant_id = $2`,
      [integrationId, tenantId]
    );
    return result.rows[0] ?? null;
  });

  if (!existing) {
    return errorResponse(404, 'NOT_FOUND', 'Integration not found', requestId);
  }

  // Update the webhook secret in Secrets Manager
  await storeSecret(integrationId, body.authConfig);

  // Update integration config in the database
  const integration = await withDatabase(async (client) => {
    const result = await client.query<IntegrationRow>(
      `UPDATE platform.integrations SET
        source_type = $1,
        source_name = $2,
        auth_config_encrypted = $3,
        payload_mapping = $4,
        retry_policy = $5,
        updated_at = $6
      WHERE integration_id = $7 AND tenant_id = $8
      RETURNING integration_id, tenant_id, source_type, source_name,
        payload_mapping, retry_policy, status, health_status, created_at, updated_at`,
      [
        body.sourceType,
        body.sourceName,
        Buffer.from(JSON.stringify({ type: body.authConfig.type, headerName: body.authConfig.headerName, algorithm: body.authConfig.algorithm })),
        JSON.stringify(body.payloadMapping),
        JSON.stringify(retryPolicy),
        now,
        integrationId,
        tenantId,
      ]
    );
    return result.rows[0];
  });

  const response = formatIntegrationResponse(integration, body.authConfig);
  return successResponse(200, response, requestId);
}

/**
 * Stores or updates the integration secret in AWS Secrets Manager.
 */
async function storeSecret(integrationId: string, authConfig: WebhookAuthConfig): Promise<void> {
  const secretName = `${INTEGRATION_SECRET_PREFIX}/${integrationId}`;
  const secretValue = JSON.stringify({
    webhookSecret: authConfig.secret,
    type: authConfig.type,
    headerName: authConfig.headerName,
    algorithm: authConfig.algorithm,
  });

  try {
    await secretsClient.send(
      new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: secretValue,
      })
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      await secretsClient.send(
        new CreateSecretCommand({
          Name: secretName,
          SecretString: secretValue,
          Description: `Webhook auth config for integration ${integrationId}`,
        })
      );
    } else {
      throw error;
    }
  }
}

/**
 * Formats the integration record for the API response (strips sensitive data).
 */
function formatIntegrationResponse(
  row: IntegrationRow,
  authConfig: WebhookAuthConfig
): IntegrationResponse {
  const payloadMapping = typeof row.payload_mapping === 'string'
    ? JSON.parse(row.payload_mapping) as PayloadMappingConfig
    : row.payload_mapping as PayloadMappingConfig;

  const retryPolicy = typeof row.retry_policy === 'string'
    ? JSON.parse(row.retry_policy) as RetryPolicy
    : row.retry_policy as RetryPolicy;

  return {
    integrationId: row.integration_id,
    tenantId: row.tenant_id,
    sourceType: row.source_type as IntegrationSourceType,
    sourceName: row.source_name,
    authConfig: {
      type: authConfig.type,
      headerName: authConfig.headerName,
      algorithm: authConfig.algorithm,
    },
    payloadMapping,
    retryPolicy,
    status: row.status,
    healthStatus: row.health_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Database row shape for integrations table.
 */
interface IntegrationRow {
  integration_id: string;
  tenant_id: string;
  source_type: string;
  source_name: string;
  payload_mapping: unknown;
  retry_policy: unknown;
  status: string;
  health_status: string;
  created_at: string;
  updated_at: string;
}
