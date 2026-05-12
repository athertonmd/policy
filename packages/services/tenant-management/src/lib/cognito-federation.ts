/**
 * Cognito Federation Module
 *
 * Provides functions to configure SAML 2.0 and OIDC identity providers,
 * OAuth 2.0 resource servers and machine clients, MFA enforcement,
 * and advanced security features on a tenant's Cognito user pool.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
import {
  CognitoIdentityProviderClient,
  CreateIdentityProviderCommand,
  UpdateIdentityProviderCommand,
  DescribeIdentityProviderCommand,
  CreateResourceServerCommand,
  CreateUserPoolClientCommand,
  SetUserPoolMfaConfigCommand,
  UpdateUserPoolCommand,
  type ProviderDescription,
  ListIdentityProvidersCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient({});

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SamlProviderConfig {
  providerName: string;
  metadataUrl?: string;
  metadataXml?: string;
  attributeMapping?: Record<string, string>;
}

export interface OidcProviderConfig {
  providerName: string;
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizeScopes?: string[];
  attributeMapping?: Record<string, string>;
}

export interface ResourceServerConfig {
  identifier: string;
  name: string;
  scopes: ResourceServerScope[];
}

export interface ResourceServerScope {
  scopeName: string;
  scopeDescription: string;
}

export interface MachineClientResult {
  clientId: string;
  clientSecret: string;
  allowedScopes: string[];
}

export interface FederationResult {
  providerName: string;
  providerType: 'SAML' | 'OIDC';
  status: 'created' | 'updated';
}

// ─── SAML Federation ─────────────────────────────────────────────────────────

/**
 * Creates or updates a SAML 2.0 identity provider on a tenant's user pool.
 * Requirement 2.1: Support SAML 2.0 federation for Tenant user authentication
 */
export async function configureSamlProvider(
  userPoolId: string,
  config: SamlProviderConfig
): Promise<FederationResult> {
  if (!config.metadataUrl && !config.metadataXml) {
    throw new Error('Either metadataUrl or metadataXml must be provided for SAML configuration');
  }

  const providerDetails: Record<string, string> = {};
  if (config.metadataUrl) {
    providerDetails['MetadataURL'] = config.metadataUrl;
  }
  if (config.metadataXml) {
    providerDetails['MetadataFile'] = config.metadataXml;
  }
  providerDetails['IDPSignout'] = 'true';

  const defaultAttributeMapping: Record<string, string> = {
    email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
    given_name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
    family_name: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
    ...config.attributeMapping,
  };

  const existingProvider = await findExistingProvider(userPoolId, config.providerName);

  if (existingProvider) {
    await cognitoClient.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: config.providerName,
        ProviderDetails: providerDetails,
        AttributeMapping: defaultAttributeMapping,
      })
    );
    return { providerName: config.providerName, providerType: 'SAML', status: 'updated' };
  }

  await cognitoClient.send(
    new CreateIdentityProviderCommand({
      UserPoolId: userPoolId,
      ProviderName: config.providerName,
      ProviderType: 'SAML',
      ProviderDetails: providerDetails,
      AttributeMapping: defaultAttributeMapping,
    })
  );

  return { providerName: config.providerName, providerType: 'SAML', status: 'created' };
}

// ─── OIDC Federation ─────────────────────────────────────────────────────────

/**
 * Creates or updates an OIDC identity provider on a tenant's user pool.
 * Requirement 2.1: Support OIDC federation for Tenant user authentication
 */
export async function configureOidcProvider(
  userPoolId: string,
  config: OidcProviderConfig
): Promise<FederationResult> {
  if (!config.clientId || !config.issuer) {
    throw new Error('clientId and issuer are required for OIDC configuration');
  }

  const providerDetails: Record<string, string> = {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    authorize_scopes: (config.authorizeScopes ?? ['openid', 'email', 'profile']).join(' '),
    oidc_issuer: config.issuer,
    attributes_request_method: 'GET',
  };

  const defaultAttributeMapping: Record<string, string> = {
    email: 'email',
    given_name: 'given_name',
    family_name: 'family_name',
    username: 'sub',
    ...config.attributeMapping,
  };

  const existingProvider = await findExistingProvider(userPoolId, config.providerName);

  if (existingProvider) {
    await cognitoClient.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: config.providerName,
        ProviderDetails: providerDetails,
        AttributeMapping: defaultAttributeMapping,
      })
    );
    return { providerName: config.providerName, providerType: 'OIDC', status: 'updated' };
  }

  await cognitoClient.send(
    new CreateIdentityProviderCommand({
      UserPoolId: userPoolId,
      ProviderName: config.providerName,
      ProviderType: 'OIDC',
      ProviderDetails: providerDetails,
      AttributeMapping: defaultAttributeMapping,
    })
  );

  return { providerName: config.providerName, providerType: 'OIDC', status: 'created' };
}

// ─── OAuth 2.0 Resource Server ───────────────────────────────────────────────

/**
 * Creates a resource server on the user pool for OAuth 2.0 scopes.
 * Requirement 2.2: Support OAuth 2.0 for API client authentication
 */
export async function configureResourceServer(
  userPoolId: string,
  config: ResourceServerConfig
): Promise<{ identifier: string; scopes: string[] }> {
  if (!config.identifier || !config.name) {
    throw new Error('identifier and name are required for resource server configuration');
  }

  const scopes = config.scopes.map((s) => ({
    ScopeName: s.scopeName,
    ScopeDescription: s.scopeDescription,
  }));

  await cognitoClient.send(
    new CreateResourceServerCommand({
      UserPoolId: userPoolId,
      Identifier: config.identifier,
      Name: config.name,
      Scopes: scopes,
    })
  );

  return {
    identifier: config.identifier,
    scopes: config.scopes.map((s) => `${config.identifier}/${s.scopeName}`),
  };
}

// ─── Machine-to-Machine Client (Client Credentials) ─────────────────────────

/**
 * Creates an app client with client_credentials grant for machine-to-machine API access.
 * Requirement 2.2: Support OAuth 2.0 for API client authentication with configurable token expiry
 */
export async function createMachineClient(
  userPoolId: string,
  allowedScopes: string[],
  clientName?: string
): Promise<MachineClientResult> {
  if (!allowedScopes || allowedScopes.length === 0) {
    throw new Error('At least one allowed scope is required for machine client creation');
  }

  const response = await cognitoClient.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: clientName ?? 'machine-client',
      GenerateSecret: true,
      AllowedOAuthFlows: ['client_credentials'],
      AllowedOAuthScopes: allowedScopes,
      AllowedOAuthFlowsUserPoolClient: true,
      ExplicitAuthFlows: [],
      SupportedIdentityProviders: [],
      AccessTokenValidity: 1, // 1 hour
      TokenValidityUnits: {
        AccessToken: 'hours',
      },
    })
  );

  const clientId = response.UserPoolClient?.ClientId;
  const clientSecret = response.UserPoolClient?.ClientSecret;

  if (!clientId || !clientSecret) {
    throw new Error('Failed to create machine client: missing clientId or clientSecret');
  }

  return {
    clientId,
    clientSecret,
    allowedScopes,
  };
}

// ─── MFA Enforcement ─────────────────────────────────────────────────────────

/**
 * Configures MFA as required for the user pool (enforced for administrative operations).
 * Requirement 2.4: Enforce multi-factor authentication for all administrative operations
 */
export async function configureMfaEnforcement(
  userPoolId: string,
  enforcement: 'REQUIRED' | 'OPTIONAL' = 'REQUIRED'
): Promise<void> {
  await cognitoClient.send(
    new SetUserPoolMfaConfigCommand({
      UserPoolId: userPoolId,
      MfaConfiguration: enforcement === 'REQUIRED' ? 'ON' : 'OPTIONAL',
      SoftwareTokenMfaConfiguration: {
        Enabled: true,
      },
      SmsMfaConfiguration: {
        SmsAuthenticationMessage: 'Your travel policy platform verification code is {####}',
        SmsConfiguration: undefined, // Uses pool-level SMS config
      },
    })
  );
}

// ─── Advanced Security ───────────────────────────────────────────────────────

/**
 * Enables advanced security mode on the user pool for risk-based adaptive authentication.
 * This supports account lockout and compromised credential detection.
 * Requirement 2.6: Account lockout and adaptive security
 */
export async function enableAdvancedSecurity(userPoolId: string): Promise<void> {
  await cognitoClient.send(
    new UpdateUserPoolCommand({
      UserPoolId: userPoolId,
      UserPoolAddOns: {
        AdvancedSecurityMode: 'ENFORCED',
      },
    })
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function findExistingProvider(
  userPoolId: string,
  providerName: string
): Promise<ProviderDescription | undefined> {
  try {
    const response = await cognitoClient.send(
      new DescribeIdentityProviderCommand({
        UserPoolId: userPoolId,
        ProviderName: providerName,
      })
    );
    return response.IdentityProvider
      ? { ProviderName: response.IdentityProvider.ProviderName, ProviderType: response.IdentityProvider.ProviderType }
      : undefined;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      return undefined;
    }
    throw error;
  }
}
