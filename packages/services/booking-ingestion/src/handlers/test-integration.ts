/**
 * Lambda handler for testing integration connectivity.
 * POST /v1/integrations/{integrationId}/test
 *
 * Validates that the integration is properly configured:
 * - Checks auth config is stored and retrievable
 * - Validates payload mapping configuration
 * - Verifies the integration record exists and is active
 * Returns test results: connectivity status, payload mapping validation, auth config validation.
 *
 * Requirements: 25.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { withDatabase } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';
import type { PayloadMappingConfig } from '@travel-policy/shared';
import { randomUUID } from 'crypto';

const secretsClient = new SecretsManagerClient({});

const INTEGRATION_SECRET_PREFIX =
  process.env.INTEGRATION_SECRET_PREFIX ?? 'travel-policy/integrations';

/**
 * Individual test check result.
 */
interface TestCheck {
  name: string;
  status: 'passed' | 'failed';
  message: string;
  durationMs: number;
}

/**
 * Overall test result returned to the client.
 */
interface TestIntegrationResponse {
  integrationId: string;
  success: boolean;
  checks: TestCheck[];
  testedAt: string;
  totalDurationMs: number;
}

/**
 * Integration record from the database.
 */
interface IntegrationRecord {
  integration_id: string;
  tenant_id: string;
  source_type: string;
  source_name: string;
  payload_mapping: unknown;
  retry_policy: unknown;
  status: string;
  health_status: string;
}

/**
 * Main Lambda handler for testing integration connectivity.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const requestId = event.requestContext?.requestId ?? randomUUID();
  const integrationId = event.pathParameters?.integrationId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    if (!integrationId) {
      return errorResponse(400, 'MISSING_INTEGRATION_ID', 'Integration ID is required in the path', requestId);
    }

    const startTime = Date.now();
    const checks: TestCheck[] = [];

    // Check 1: Verify integration exists and belongs to tenant
    const integrationCheck = await testIntegrationExists(integrationId, tenantId);
    checks.push(integrationCheck.check);

    if (!integrationCheck.record) {
      const totalDurationMs = Date.now() - startTime;
      const response: TestIntegrationResponse = {
        integrationId,
        success: false,
        checks,
        testedAt: new Date().toISOString(),
        totalDurationMs,
      };
      return successResponse(200, response, requestId);
    }

    // Check 2: Verify auth config is stored in Secrets Manager
    const authCheck = await testAuthConfig(integrationId);
    checks.push(authCheck);

    // Check 3: Validate payload mapping configuration
    const mappingCheck = validatePayloadMapping(integrationCheck.record.payload_mapping);
    checks.push(mappingCheck);

    // Check 4: Verify integration status is active
    const statusCheck = testIntegrationStatus(integrationCheck.record.status);
    checks.push(statusCheck);

    const totalDurationMs = Date.now() - startTime;
    const allPassed = checks.every((c) => c.status === 'passed');

    // Update last_health_check timestamp
    await withDatabase(async (client) => {
      await client.query(
        `UPDATE platform.integrations SET last_health_check = $1 WHERE integration_id = $2`,
        [new Date().toISOString(), integrationId]
      );
    });

    const response: TestIntegrationResponse = {
      integrationId,
      success: allPassed,
      checks,
      testedAt: new Date().toISOString(),
      totalDurationMs,
    };

    return successResponse(200, response, requestId);
  } catch (error) {
    console.error('Error testing integration', {
      requestId,
      integrationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'An internal error occurred', requestId);
  }
}

/**
 * Tests that the integration record exists in the database and belongs to the tenant.
 */
async function testIntegrationExists(
  integrationId: string,
  tenantId: string
): Promise<{ check: TestCheck; record: IntegrationRecord | null }> {
  const start = Date.now();
  try {
    const record = await withDatabase(async (client) => {
      const result = await client.query<IntegrationRecord>(
        `SELECT integration_id, tenant_id, source_type, source_name,
                payload_mapping, retry_policy, status, health_status
         FROM platform.integrations
         WHERE integration_id = $1 AND tenant_id = $2`,
        [integrationId, tenantId]
      );
      return result.rows[0] ?? null;
    });

    const durationMs = Date.now() - start;

    if (!record) {
      return {
        check: {
          name: 'integration_exists',
          status: 'failed',
          message: 'Integration not found or does not belong to this tenant',
          durationMs,
        },
        record: null,
      };
    }

    return {
      check: {
        name: 'integration_exists',
        status: 'passed',
        message: `Integration "${record.source_name}" (${record.source_type}) found`,
        durationMs,
      },
      record,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    return {
      check: {
        name: 'integration_exists',
        status: 'failed',
        message: `Database connectivity error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs,
      },
      record: null,
    };
  }
}

/**
 * Tests that the auth config secret is stored and retrievable from Secrets Manager.
 */
async function testAuthConfig(integrationId: string): Promise<TestCheck> {
  const start = Date.now();
  const secretName = `${INTEGRATION_SECRET_PREFIX}/${integrationId}`;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    const durationMs = Date.now() - start;

    if (!response.SecretString) {
      return {
        name: 'auth_config',
        status: 'failed',
        message: 'Auth config secret exists but has no value',
        durationMs,
      };
    }

    // Validate the secret structure
    const secret = JSON.parse(response.SecretString) as Record<string, unknown>;
    if (!secret.webhookSecret && !secret.type) {
      return {
        name: 'auth_config',
        status: 'failed',
        message: 'Auth config secret has invalid structure',
        durationMs,
      };
    }

    return {
      name: 'auth_config',
      status: 'passed',
      message: `Auth config (type: ${secret.type}) is properly stored and retrievable`,
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - start;
    return {
      name: 'auth_config',
      status: 'failed',
      message: `Failed to retrieve auth config: ${error instanceof Error ? error.message : String(error)}`,
      durationMs,
    };
  }
}

/**
 * Validates the payload mapping configuration structure.
 */
function validatePayloadMapping(payloadMapping: unknown): TestCheck {
  const start = Date.now();

  try {
    const mapping: PayloadMappingConfig = typeof payloadMapping === 'string'
      ? JSON.parse(payloadMapping) as PayloadMappingConfig
      : payloadMapping as PayloadMappingConfig;

    if (!mapping.format || !['json', 'xml'].includes(mapping.format)) {
      return {
        name: 'payload_mapping',
        status: 'failed',
        message: 'Payload mapping has invalid format (must be "json" or "xml")',
        durationMs: Date.now() - start,
      };
    }

    if (!Array.isArray(mapping.mappingRules) || mapping.mappingRules.length === 0) {
      return {
        name: 'payload_mapping',
        status: 'failed',
        message: 'Payload mapping has no mapping rules defined',
        durationMs: Date.now() - start,
      };
    }

    // Validate each mapping rule has required fields
    for (const rule of mapping.mappingRules) {
      if (!rule.sourceField || !rule.targetField) {
        return {
          name: 'payload_mapping',
          status: 'failed',
          message: `Mapping rule missing required fields (sourceField/targetField)`,
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      name: 'payload_mapping',
      status: 'passed',
      message: `Payload mapping valid: ${mapping.mappingRules.length} rules configured (format: ${mapping.format})`,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'payload_mapping',
      status: 'failed',
      message: `Payload mapping validation error: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Tests that the integration status is active.
 */
function testIntegrationStatus(status: string): TestCheck {
  const start = Date.now();

  if (status === 'active') {
    return {
      name: 'integration_status',
      status: 'passed',
      message: 'Integration is active',
      durationMs: Date.now() - start,
    };
  }

  return {
    name: 'integration_status',
    status: 'failed',
    message: `Integration is not active (current status: ${status})`,
    durationMs: Date.now() - start,
  };
}
