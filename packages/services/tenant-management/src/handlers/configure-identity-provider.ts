/**
 * Lambda handler: Configure Identity Provider for a tenant.
 * Supports SAML 2.0 and OIDC federation, OAuth 2.0 client credentials,
 * MFA enforcement, and advanced security features.
 *
 * POST /v1/tenants/{tenantId}/identity-provider
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.6
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  configureSamlProvider,
  configureOidcProvider,
  configureResourceServer,
  createMachineClient,
  configureMfaEnforcement,
  enableAdvancedSecurity,
  type SamlProviderConfig,
  type OidcProviderConfig,
  type ResourceServerConfig,
} from '../lib/cognito-federation.js';
import { withDatabase } from '../lib/database.js';

interface ConfigureIdentityProviderRequest {
  type: 'saml' | 'oidc' | 'oauth2_client_credentials';
  saml?: SamlProviderConfig;
  oidc?: OidcProviderConfig;
  oauth2?: {
    resourceServer?: ResourceServerConfig;
    clientName?: string;
    scopes?: string[];
  };
  enableMfa?: boolean;
  enableAdvancedSecurity?: boolean;
}

interface TenantRecord {
  cognito_user_pool_id: string;
  status: string;
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

    let request: ConfigureIdentityProviderRequest;
    try {
      request = JSON.parse(event.body) as ConfigureIdentityProviderRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate request
    const validationError = validateRequest(request);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    // Look up tenant to get the Cognito user pool ID
    const tenant = await withDatabase(async (db) => {
      const result = await db.query<TenantRecord>(
        `SELECT cognito_user_pool_id, status FROM platform.tenants WHERE tenant_id = $1`,
        [tenantId]
      );
      return result.rows[0] ?? null;
    });

    if (!tenant) {
      return errorResponse(404, 'TENANT_NOT_FOUND', `Tenant ${tenantId} not found`, requestId);
    }

    if (tenant.status !== 'active') {
      return errorResponse(
        409,
        'TENANT_NOT_ACTIVE',
        `Tenant ${tenantId} is in '${tenant.status}' state and cannot be configured`,
        requestId
      );
    }

    const userPoolId = tenant.cognito_user_pool_id;
    const results: Record<string, unknown> = {};

    // Configure identity provider based on type
    switch (request.type) {
      case 'saml': {
        if (!request.saml) {
          return errorResponse(400, 'VALIDATION_ERROR', 'saml configuration is required when type is "saml"', requestId);
        }
        const samlResult = await configureSamlProvider(userPoolId, request.saml);
        results.identityProvider = samlResult;
        break;
      }

      case 'oidc': {
        if (!request.oidc) {
          return errorResponse(400, 'VALIDATION_ERROR', 'oidc configuration is required when type is "oidc"', requestId);
        }
        const oidcResult = await configureOidcProvider(userPoolId, request.oidc);
        results.identityProvider = oidcResult;
        break;
      }

      case 'oauth2_client_credentials': {
        if (!request.oauth2) {
          return errorResponse(
            400,
            'VALIDATION_ERROR',
            'oauth2 configuration is required when type is "oauth2_client_credentials"',
            requestId
          );
        }

        // Create resource server if specified
        if (request.oauth2.resourceServer) {
          const rsResult = await configureResourceServer(userPoolId, request.oauth2.resourceServer);
          results.resourceServer = rsResult;
        }

        // Create machine client with specified scopes
        const scopes = request.oauth2.scopes ?? [];
        if (scopes.length > 0) {
          const clientResult = await createMachineClient(userPoolId, scopes, request.oauth2.clientName);
          results.machineClient = {
            clientId: clientResult.clientId,
            clientSecret: clientResult.clientSecret,
            allowedScopes: clientResult.allowedScopes,
          };
        }
        break;
      }
    }

    // Configure MFA if requested
    if (request.enableMfa) {
      await configureMfaEnforcement(userPoolId, 'REQUIRED');
      results.mfa = { enforcement: 'REQUIRED' };
    }

    // Enable advanced security if requested
    if (request.enableAdvancedSecurity) {
      await enableAdvancedSecurity(userPoolId);
      results.advancedSecurity = { mode: 'ENFORCED' };
    }

    // Update tenant config in database
    await withDatabase(async (db) => {
      const configUpdate: Record<string, unknown> = {};
      if (request.type === 'saml' && request.saml) {
        configUpdate.identityProvider = {
          type: 'saml',
          providerName: request.saml.providerName,
          metadataUrl: request.saml.metadataUrl,
        };
      } else if (request.type === 'oidc' && request.oidc) {
        configUpdate.identityProvider = {
          type: 'oidc',
          clientId: request.oidc.clientId,
          issuer: request.oidc.issuer,
        };
      }

      await db.query(
        `UPDATE platform.tenants 
         SET config = config || $1::jsonb, updated_at = NOW()
         WHERE tenant_id = $2`,
        [JSON.stringify(configUpdate), tenantId]
      );
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: results,
        metadata: {
          requestId,
          tenantId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('Identity provider configuration failed:', error);
    return errorResponse(
      500,
      'CONFIGURATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

function validateRequest(request: ConfigureIdentityProviderRequest): string | null {
  const validTypes = ['saml', 'oidc', 'oauth2_client_credentials'];
  if (!request.type || !validTypes.includes(request.type)) {
    return `type must be one of: ${validTypes.join(', ')}`;
  }

  if (request.type === 'saml' && request.saml) {
    if (!request.saml.providerName) {
      return 'saml.providerName is required';
    }
    if (!request.saml.metadataUrl && !request.saml.metadataXml) {
      return 'Either saml.metadataUrl or saml.metadataXml is required';
    }
  }

  if (request.type === 'oidc' && request.oidc) {
    if (!request.oidc.providerName) {
      return 'oidc.providerName is required';
    }
    if (!request.oidc.clientId) {
      return 'oidc.clientId is required';
    }
    if (!request.oidc.clientSecret) {
      return 'oidc.clientSecret is required';
    }
    if (!request.oidc.issuer) {
      return 'oidc.issuer is required';
    }
  }

  if (request.type === 'oauth2_client_credentials' && request.oauth2) {
    if (request.oauth2.resourceServer) {
      if (!request.oauth2.resourceServer.identifier) {
        return 'oauth2.resourceServer.identifier is required';
      }
      if (!request.oauth2.resourceServer.name) {
        return 'oauth2.resourceServer.name is required';
      }
      if (!request.oauth2.resourceServer.scopes || request.oauth2.resourceServer.scopes.length === 0) {
        return 'oauth2.resourceServer.scopes must contain at least one scope';
      }
    }
  }

  return null;
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
