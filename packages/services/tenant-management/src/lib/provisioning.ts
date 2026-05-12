/**
 * Provisioning logic for tenant resources.
 * Creates PostgreSQL schema, KMS key, and Cognito user pool.
 */
import { KMSClient, CreateKeyCommand, CreateAliasCommand } from '@aws-sdk/client-kms';
import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from './database.js';
import { runMigrations } from './migration-runner.js';
import { getAllMigrations } from './migrations/index.js';

const kmsClient = new KMSClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

export interface ProvisioningResult {
  schemaName: string;
  kmsKeyArn: string;
  cognitoUserPoolId: string;
}

export interface ProvisioningContext {
  tenantId: string;
  organisationName: string;
  dataResidencyRegion: string;
  adminEmail: string;
  plan: string;
}

/**
 * Generates a unique schema name for a tenant.
 * Format: tenant_{short_uuid} (max 63 chars for PostgreSQL identifier)
 */
export function generateSchemaName(): string {
  const shortId = randomUUID().replace(/-/g, '').substring(0, 12);
  return `tenant_${shortId}`;
}

/**
 * Creates an isolated PostgreSQL schema for the tenant with all tables
 * defined in the design document. Uses the versioned migration runner
 * to apply schema changes in order.
 */
export async function createTenantSchema(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  // Validate schema name to prevent SQL injection
  if (!/^tenant_[a-z0-9]{12}$/.test(schemaName)) {
    throw new Error(
      `Invalid schema name: ${schemaName}. Must match pattern tenant_[a-z0-9]{12}`
    );
  }

  // Create the schema
  await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

  // Run all migrations to create tables, indexes, triggers, and RLS policies
  const migrations = getAllMigrations();
  const result = await runMigrations(db, schemaName, migrations);

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `Schema migration failed at version ${firstError.version} (${firstError.name}): ${firstError.error}`
    );
  }
}

/**
 * Creates a tenant-specific KMS key for data encryption.
 */
export async function createTenantKmsKey(
  tenantId: string,
  organisationName: string
): Promise<string> {
  const createKeyResponse = await kmsClient.send(
    new CreateKeyCommand({
      Description: `Encryption key for tenant: ${organisationName} (${tenantId})`,
      KeyUsage: 'ENCRYPT_DECRYPT',
      Tags: [
        { TagKey: 'TenantId', TagValue: tenantId },
        { TagKey: 'OrganisationName', TagValue: organisationName },
        { TagKey: 'ManagedBy', TagValue: 'travel-policy-platform' },
      ],
    })
  );

  const keyArn = createKeyResponse.KeyMetadata?.Arn;
  if (!keyArn) {
    throw new Error('Failed to create KMS key: no ARN returned');
  }

  // Create an alias for easier identification
  const aliasName = `alias/tenant-${tenantId.substring(0, 8)}`;
  await kmsClient.send(
    new CreateAliasCommand({
      AliasName: aliasName,
      TargetKeyId: keyArn,
    })
  );

  return keyArn;
}

/**
 * Creates a Cognito user pool for the tenant.
 */
export async function createTenantCognitoUserPool(
  context: ProvisioningContext
): Promise<string> {
  const poolName = `tenant-${context.tenantId.substring(0, 8)}-${context.organisationName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .substring(0, 30)}`;

  const createPoolResponse = await cognitoClient.send(
    new CreateUserPoolCommand({
      PoolName: poolName,
      AutoVerifiedAttributes: ['email'],
      UsernameAttributes: ['email'],
      MfaConfiguration: 'OPTIONAL',
      Policies: {
        PasswordPolicy: {
          MinimumLength: 12,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
      AccountRecoverySetting: {
        RecoveryMechanisms: [
          { Name: 'verified_email', Priority: 1 },
        ],
      },
      AdminCreateUserConfig: {
        AllowAdminCreateUserOnly: false,
      },
      UserPoolTags: {
        TenantId: context.tenantId,
        OrganisationName: context.organisationName,
        ManagedBy: 'travel-policy-platform',
      },
    })
  );

  const userPoolId = createPoolResponse.UserPool?.Id;
  if (!userPoolId) {
    throw new Error('Failed to create Cognito user pool: no ID returned');
  }

  // Create an app client for the user pool
  await cognitoClient.send(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: `${poolName}-client`,
      GenerateSecret: false,
      ExplicitAuthFlows: [
        'ALLOW_USER_SRP_AUTH',
        'ALLOW_REFRESH_TOKEN_AUTH',
      ],
      SupportedIdentityProviders: ['COGNITO'],
    })
  );

  // Create the initial admin user
  await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: context.adminEmail,
      UserAttributes: [
        { Name: 'email', Value: context.adminEmail },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:tenant_id', Value: context.tenantId },
        { Name: 'custom:role', Value: 'Tenant_Administrator' },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    })
  );

  return userPoolId;
}

/**
 * Provisions all resources for a new tenant.
 * Returns the provisioning result or throws on failure.
 */
export async function provisionTenantResources(
  db: DatabaseClient,
  context: ProvisioningContext
): Promise<ProvisioningResult> {
  const schemaName = generateSchemaName();

  // Step 1: Create PostgreSQL schema with all tables via migration runner
  await createTenantSchema(db, schemaName);

  // Step 2: Create KMS key
  const kmsKeyArn = await createTenantKmsKey(
    context.tenantId,
    context.organisationName
  );

  // Step 3: Create Cognito user pool
  const cognitoUserPoolId = await createTenantCognitoUserPool(context);

  return {
    schemaName,
    kmsKeyArn,
    cognitoUserPoolId,
  };
}
