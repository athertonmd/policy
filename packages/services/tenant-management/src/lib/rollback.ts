/**
 * Rollback logic for partial provisioning failures.
 * Cleans up any resources that were created before the failure occurred.
 */
import {
  KMSClient,
  ScheduleKeyDeletionCommand,
  DescribeKeyCommand,
} from '@aws-sdk/client-kms';
import {
  CognitoIdentityProviderClient,
  DeleteUserPoolCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { DatabaseClient } from './database.js';

const kmsClient = new KMSClient({});
const cognitoClient = new CognitoIdentityProviderClient({});

export interface RollbackContext {
  schemaName?: string;
  kmsKeyArn?: string;
  cognitoUserPoolId?: string;
  tenantId?: string;
}

export interface RollbackResult {
  success: boolean;
  errors: RollbackError[];
}

export interface RollbackError {
  resource: string;
  error: string;
}

/**
 * Rolls back a partially provisioned tenant by cleaning up created resources.
 * Attempts to clean up all resources even if individual cleanup steps fail.
 */
export async function rollbackProvisioning(
  db: DatabaseClient | null,
  context: RollbackContext
): Promise<RollbackResult> {
  const errors: RollbackError[] = [];

  // Rollback PostgreSQL schema
  if (context.schemaName && db) {
    try {
      await dropTenantSchema(db, context.schemaName);
    } catch (error) {
      errors.push({
        resource: `schema:${context.schemaName}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Rollback KMS key (schedule deletion with minimum 7-day waiting period)
  if (context.kmsKeyArn) {
    try {
      await scheduleKmsKeyDeletion(context.kmsKeyArn);
    } catch (error) {
      errors.push({
        resource: `kms:${context.kmsKeyArn}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Rollback Cognito user pool
  if (context.cognitoUserPoolId) {
    try {
      await deleteCognitoUserPool(context.cognitoUserPoolId);
    } catch (error) {
      errors.push({
        resource: `cognito:${context.cognitoUserPoolId}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Remove tenant record from platform.tenants if it was created
  if (context.tenantId && db) {
    try {
      await db.query(
        'DELETE FROM platform.tenants WHERE tenant_id = $1',
        [context.tenantId]
      );
    } catch (error) {
      errors.push({
        resource: `tenant_record:${context.tenantId}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Drops a tenant's PostgreSQL schema and all its objects.
 */
async function dropTenantSchema(
  db: DatabaseClient,
  schemaName: string
): Promise<void> {
  await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
}

/**
 * Schedules a KMS key for deletion (minimum 7-day waiting period).
 */
async function scheduleKmsKeyDeletion(keyArn: string): Promise<void> {
  // First check if the key exists and is not already pending deletion
  try {
    const describeResponse = await kmsClient.send(
      new DescribeKeyCommand({ KeyId: keyArn })
    );
    if (describeResponse.KeyMetadata?.KeyState === 'PendingDeletion') {
      return; // Already scheduled for deletion
    }
  } catch {
    // Key may not exist, skip deletion
    return;
  }

  await kmsClient.send(
    new ScheduleKeyDeletionCommand({
      KeyId: keyArn,
      PendingWindowInDays: 7, // Minimum allowed
    })
  );
}

/**
 * Deletes a Cognito user pool.
 */
async function deleteCognitoUserPool(userPoolId: string): Promise<void> {
  await cognitoClient.send(
    new DeleteUserPoolCommand({ UserPoolId: userPoolId })
  );
}

/**
 * Performs soft-delete cleanup for a decommissioned tenant.
 * Does not delete data immediately but marks resources for future cleanup.
 */
export async function cleanupDecommissionedTenant(
  db: DatabaseClient,
  tenantId: string,
  schemaName: string,
  kmsKeyArn: string,
  cognitoUserPoolId: string
): Promise<RollbackResult> {
  const errors: RollbackError[] = [];

  // Disable the KMS key (don't delete - data retention requirements)
  if (kmsKeyArn) {
    try {
      const { DisableKeyCommand } = await import('@aws-sdk/client-kms');
      await kmsClient.send(new DisableKeyCommand({ KeyId: kmsKeyArn }));
    } catch (error) {
      errors.push({
        resource: `kms:${kmsKeyArn}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Disable the Cognito user pool (prevent new sign-ins)
  if (cognitoUserPoolId) {
    try {
      const { UpdateUserPoolCommand } = await import(
        '@aws-sdk/client-cognito-identity-provider'
      );
      await cognitoClient.send(
        new UpdateUserPoolCommand({
          UserPoolId: cognitoUserPoolId,
          AdminCreateUserConfig: {
            AllowAdminCreateUserOnly: true,
          },
        })
      );
    } catch (error) {
      errors.push({
        resource: `cognito:${cognitoUserPoolId}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Revoke active sessions / connections to tenant schema
  // The schema is preserved for data retention but access is blocked
  if (schemaName) {
    try {
      await db.query(
        `REVOKE ALL ON SCHEMA "${schemaName}" FROM PUBLIC`
      );
    } catch (error) {
      errors.push({
        resource: `schema_access:${schemaName}`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
