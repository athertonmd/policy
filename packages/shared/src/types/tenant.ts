/**
 * Tenant Management types
 */

export interface Tenant {
  tenantId: string;
  organisationName: string;
  dataResidencyRegion: DataResidencyRegion;
  status: TenantStatus;
  schemaName: string;
  kmsKeyArn: string;
  cognitoUserPoolId: string;
  createdAt: string;
  config: TenantConfig;
}

export type DataResidencyRegion = 'uk' | 'eu' | 'us' | 'anz';

export type TenantStatus = 'provisioning' | 'active' | 'suspended' | 'decommissioned';

export interface TenantConfig {
  identityProvider?: IdentityProviderConfig;
  encryption?: EncryptionConfig;
  dataRetention?: DataRetentionConfig;
  features?: Record<string, boolean>;
}

export interface IdentityProviderConfig {
  type: 'saml' | 'oidc';
  metadataUrl?: string;
  clientId?: string;
  issuer?: string;
}

export interface EncryptionConfig {
  keyRotationDays: number;
  customerManagedKey?: boolean;
  customerKeyArn?: string;
}

export interface DataRetentionConfig {
  transactionalDays: number;
  auditDays: number;
  personalDataDays: number;
  analyticalDays: number;
}

export interface ProvisionTenantRequest {
  organisationName: string;
  dataResidencyRegion: DataResidencyRegion;
  adminEmail: string;
  plan: 'standard' | 'enterprise';
  identityProviderConfig?: IdentityProviderConfig;
  encryptionConfig?: EncryptionConfig;
}

export interface TenantFilter {
  status?: TenantStatus;
  region?: DataResidencyRegion;
  plan?: 'standard' | 'enterprise';
  search?: string;
}
