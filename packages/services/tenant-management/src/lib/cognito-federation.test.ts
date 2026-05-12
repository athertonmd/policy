import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AWS SDK Cognito client
const mockSend = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-cognito-identity-provider', async () => {
  const actual = await vi.importActual('@aws-sdk/client-cognito-identity-provider');
  return {
    ...actual,
    CognitoIdentityProviderClient: vi.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

import {
  configureSamlProvider,
  configureOidcProvider,
  configureResourceServer,
  createMachineClient,
  configureMfaEnforcement,
  enableAdvancedSecurity,
} from './cognito-federation.js';

describe('cognito-federation', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('configureSamlProvider', () => {
    it('should create a new SAML provider when none exists', async () => {
      // First call: DescribeIdentityProvider throws ResourceNotFoundException
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error('Provider not found'), { name: 'ResourceNotFoundException' })
      );
      // Second call: CreateIdentityProvider succeeds
      mockSend.mockResolvedValueOnce({});

      const result = await configureSamlProvider('us-east-1_abc123', {
        providerName: 'CorporateIdP',
        metadataUrl: 'https://idp.example.com/metadata.xml',
      });

      expect(result).toEqual({
        providerName: 'CorporateIdP',
        providerType: 'SAML',
        status: 'created',
      });
      expect(mockSend).toHaveBeenCalledTimes(2);
    });

    it('should update an existing SAML provider', async () => {
      // First call: DescribeIdentityProvider returns existing provider
      mockSend.mockResolvedValueOnce({
        IdentityProvider: { ProviderName: 'CorporateIdP', ProviderType: 'SAML' },
      });
      // Second call: UpdateIdentityProvider succeeds
      mockSend.mockResolvedValueOnce({});

      const result = await configureSamlProvider('us-east-1_abc123', {
        providerName: 'CorporateIdP',
        metadataUrl: 'https://idp.example.com/metadata-v2.xml',
      });

      expect(result).toEqual({
        providerName: 'CorporateIdP',
        providerType: 'SAML',
        status: 'updated',
      });
    });

    it('should throw if neither metadataUrl nor metadataXml is provided', async () => {
      await expect(
        configureSamlProvider('us-east-1_abc123', {
          providerName: 'CorporateIdP',
        })
      ).rejects.toThrow('Either metadataUrl or metadataXml must be provided');
    });

    it('should accept metadataXml as an alternative to metadataUrl', async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { name: 'ResourceNotFoundException' })
      );
      mockSend.mockResolvedValueOnce({});

      const result = await configureSamlProvider('us-east-1_abc123', {
        providerName: 'CorporateIdP',
        metadataXml: '<EntityDescriptor>...</EntityDescriptor>',
      });

      expect(result.status).toBe('created');
    });
  });

  describe('configureOidcProvider', () => {
    it('should create a new OIDC provider when none exists', async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error('Not found'), { name: 'ResourceNotFoundException' })
      );
      mockSend.mockResolvedValueOnce({});

      const result = await configureOidcProvider('us-east-1_abc123', {
        providerName: 'AzureAD',
        clientId: 'client-123',
        clientSecret: 'secret-456',
        issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
      });

      expect(result).toEqual({
        providerName: 'AzureAD',
        providerType: 'OIDC',
        status: 'created',
      });
    });

    it('should update an existing OIDC provider', async () => {
      mockSend.mockResolvedValueOnce({
        IdentityProvider: { ProviderName: 'AzureAD', ProviderType: 'OIDC' },
      });
      mockSend.mockResolvedValueOnce({});

      const result = await configureOidcProvider('us-east-1_abc123', {
        providerName: 'AzureAD',
        clientId: 'new-client-id',
        clientSecret: 'new-secret',
        issuer: 'https://login.microsoftonline.com/tenant-id/v2.0',
      });

      expect(result.status).toBe('updated');
    });

    it('should throw if clientId is missing', async () => {
      await expect(
        configureOidcProvider('us-east-1_abc123', {
          providerName: 'AzureAD',
          clientId: '',
          clientSecret: 'secret',
          issuer: 'https://issuer.example.com',
        })
      ).rejects.toThrow('clientId and issuer are required');
    });

    it('should throw if issuer is missing', async () => {
      await expect(
        configureOidcProvider('us-east-1_abc123', {
          providerName: 'AzureAD',
          clientId: 'client-123',
          clientSecret: 'secret',
          issuer: '',
        })
      ).rejects.toThrow('clientId and issuer are required');
    });
  });

  describe('configureResourceServer', () => {
    it('should create a resource server with scopes', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await configureResourceServer('us-east-1_abc123', {
        identifier: 'https://api.travel-policy.example.com',
        name: 'Travel Policy API',
        scopes: [
          { scopeName: 'read:policies', scopeDescription: 'Read policy rules' },
          { scopeName: 'write:policies', scopeDescription: 'Write policy rules' },
        ],
      });

      expect(result.identifier).toBe('https://api.travel-policy.example.com');
      expect(result.scopes).toEqual([
        'https://api.travel-policy.example.com/read:policies',
        'https://api.travel-policy.example.com/write:policies',
      ]);
    });

    it('should throw if identifier is missing', async () => {
      await expect(
        configureResourceServer('us-east-1_abc123', {
          identifier: '',
          name: 'API',
          scopes: [{ scopeName: 'read', scopeDescription: 'Read' }],
        })
      ).rejects.toThrow('identifier and name are required');
    });
  });

  describe('createMachineClient', () => {
    it('should create a machine client with client credentials grant', async () => {
      mockSend.mockResolvedValueOnce({
        UserPoolClient: {
          ClientId: 'generated-client-id',
          ClientSecret: 'generated-secret',
        },
      });

      const result = await createMachineClient('us-east-1_abc123', [
        'https://api.example.com/read:policies',
      ]);

      expect(result.clientId).toBe('generated-client-id');
      expect(result.clientSecret).toBe('generated-secret');
      expect(result.allowedScopes).toEqual(['https://api.example.com/read:policies']);
    });

    it('should throw if no scopes are provided', async () => {
      await expect(createMachineClient('us-east-1_abc123', [])).rejects.toThrow(
        'At least one allowed scope is required'
      );
    });

    it('should throw if Cognito returns no client ID', async () => {
      mockSend.mockResolvedValueOnce({
        UserPoolClient: { ClientId: undefined, ClientSecret: undefined },
      });

      await expect(
        createMachineClient('us-east-1_abc123', ['scope/read'])
      ).rejects.toThrow('Failed to create machine client');
    });
  });

  describe('configureMfaEnforcement', () => {
    it('should configure MFA as required', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        configureMfaEnforcement('us-east-1_abc123', 'REQUIRED')
      ).resolves.toBeUndefined();

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should configure MFA as optional', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(
        configureMfaEnforcement('us-east-1_abc123', 'OPTIONAL')
      ).resolves.toBeUndefined();
    });
  });

  describe('enableAdvancedSecurity', () => {
    it('should enable advanced security mode on the user pool', async () => {
      mockSend.mockResolvedValueOnce({});

      await expect(enableAdvancedSecurity('us-east-1_abc123')).resolves.toBeUndefined();
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
