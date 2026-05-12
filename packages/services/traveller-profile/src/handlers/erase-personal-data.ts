/**
 * POST /v1/profiles/{travellerId}/erase
 *
 * Anonymises all personal data for the specified traveller.
 * Replaces PII with anonymised placeholders (e.g., "REDACTED-{hash}").
 * Preserves anonymised audit records (keeps actionType, timestamp, but removes userId linkage).
 * Deactivates the Cognito user.
 * Returns erasure confirmation with affected record counts.
 *
 * Requirements: 20.4
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createHash } from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  extractClaimsFromEvent,
  extractTenantIdFromClaims,
  resolveTenantContext,
  scopeConnectionToTenant,
  resetConnectionScope,
} from '@travel-policy/shared';
import { createDatabaseClient, type DatabaseClient } from '../lib/database.js';

const cognitoClient = new CognitoIdentityProviderClient({});
const eventBridgeClient = new EventBridgeClient({});

interface ErasureResponse {
  success: boolean;
  travellerId: string;
  erasureId: string;
  fieldsErased: string[];
  anonymisedRecords: number;
  cognitoDisabled: boolean;
  completedAt: string;
}

/**
 * Generates a deterministic anonymised placeholder for a given field.
 * Uses a one-way hash so the original value cannot be recovered.
 */
function anonymise(travellerId: string, fieldName: string): string {
  const hash = createHash('sha256')
    .update(`${travellerId}:${fieldName}`)
    .digest('hex')
    .slice(0, 12);
  return `REDACTED-${hash}`;
}

/**
 * Anonymises the traveller profile in the database.
 * Replaces all PII fields with anonymised placeholders.
 */
async function anonymiseProfile(
  db: DatabaseClient,
  schemaName: string,
  travellerId: string
): Promise<{ fieldsErased: string[]; found: boolean }> {
  const fieldsErased: string[] = [];

  // Check if profile exists
  const existing = await db.query(
    `SELECT traveller_id, employee_id FROM "${schemaName}".traveller_profiles WHERE traveller_id = $1`,
    [travellerId]
  );

  if (existing.rowCount === 0) {
    return { fieldsErased, found: false };
  }

  // Anonymise all PII fields
  const anonymisedEmail = anonymise(travellerId, 'email');
  const anonymisedName = anonymise(travellerId, 'full_name');
  const anonymisedEmployeeId = anonymise(travellerId, 'employee_id');

  await db.query(
    `UPDATE "${schemaName}".traveller_profiles
     SET
       email = $1,
       full_name = $2,
       employee_id = $3,
       department = NULL,
       cost_centre = NULL,
       seniority_level = NULL,
       region = NULL,
       manager_id = NULL,
       preferences = '{}',
       loyalty_programmes = '[]',
       passport_details_encrypted = NULL,
       emergency_contact_encrypted = NULL,
       status = 'inactive',
       updated_at = NOW()
     WHERE traveller_id = $4`,
    [anonymisedEmail, anonymisedName, anonymisedEmployeeId, travellerId]
  );

  fieldsErased.push(
    'email',
    'fullName',
    'employeeId',
    'department',
    'costCentre',
    'seniorityLevel',
    'region',
    'managerId',
    'preferences',
    'loyaltyProgrammes',
    'passportDetails',
    'emergencyContact'
  );

  return { fieldsErased, found: true };
}

/**
 * Anonymises audit-related records while preserving the audit trail structure.
 * Keeps actionType, timestamp, and workflow structure but removes user linkage.
 */
async function anonymiseAuditRecords(
  db: DatabaseClient,
  schemaName: string,
  travellerId: string
): Promise<number> {
  let totalAnonymised = 0;

  // Anonymise policy decisions - remove request payload PII but keep decision metadata
  const decisionsResult = await db.query(
    `UPDATE "${schemaName}".policy_decisions
     SET request_payload = jsonb_set(
       request_payload,
       '{traveller}',
       '{"anonymised": true}'::jsonb
     )
     WHERE traveller_id = $1`,
    [travellerId]
  );
  totalAnonymised += decisionsResult.rowCount;

  // Anonymise approval actions where the traveller was the approver
  // Keep the action type and timestamp but remove comments that may contain PII
  const actionsResult = await db.query(
    `UPDATE "${schemaName}".approval_actions
     SET comment = NULL
     WHERE approver_id = $1 AND comment IS NOT NULL`,
    [travellerId]
  );
  totalAnonymised += actionsResult.rowCount;

  // Anonymise policy override justifications
  const overridesResult = await db.query(
    `UPDATE "${schemaName}".policy_overrides
     SET justification = 'REDACTED'
     WHERE requested_by = $1`,
    [travellerId]
  );
  totalAnonymised += overridesResult.rowCount;

  return totalAnonymised;
}

/**
 * Deactivates the user in Cognito.
 */
async function deactivateCognitoUser(
  userPoolId: string,
  username: string
): Promise<boolean> {
  try {
    await cognitoClient.send(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: username,
      })
    );
    return true;
  } catch (error) {
    const err = error as Error;
    console.error('Failed to deactivate Cognito user:', err.message);
    // Don't fail the entire erasure if Cognito deactivation fails
    return false;
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const travellerId = event.pathParameters?.travellerId;
    if (!travellerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing travellerId path parameter' }),
      };
    }

    // Extract JWT claims and tenant context
    const claims = extractClaimsFromEvent(event as Parameters<typeof extractClaimsFromEvent>[0]);
    const tenantId = extractTenantIdFromClaims(claims);

    const db = await createDatabaseClient();
    try {
      const tenantContext = await resolveTenantContext(db, tenantId);
      await scopeConnectionToTenant(db, tenantContext.schemaName);

      // Anonymise the profile
      const { fieldsErased, found } = await anonymiseProfile(
        db,
        tenantContext.schemaName,
        travellerId
      );

      if (!found) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Profile not found' }),
        };
      }

      // Anonymise audit-related records while preserving structure
      const anonymisedRecords = await anonymiseAuditRecords(
        db,
        tenantContext.schemaName,
        travellerId
      );

      await resetConnectionScope(db);

      // Deactivate Cognito user
      const userPoolId = process.env.COGNITO_USER_POOL_ID || '';
      let cognitoDisabled = false;
      if (userPoolId) {
        cognitoDisabled = await deactivateCognitoUser(userPoolId, travellerId);
      }

      const erasureId = `erasure-${travellerId}-${Date.now()}`;
      const completedAt = new Date().toISOString();

      // Publish erasure event for audit
      const eventBusName = process.env.EVENT_BUS_NAME || 'travel-policy-platform';
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.traveller-profile',
              DetailType: 'ProfileUpdated',
              Detail: JSON.stringify({
                tenantId,
                travellerId,
                action: 'data-erasure',
                erasureId,
                fieldsErased,
                anonymisedRecords,
                cognitoDisabled,
                completedAt,
              }),
              EventBusName: eventBusName,
            },
          ],
        })
      );

      console.log('Personal data erasure completed:', {
        erasureId,
        travellerId,
        tenantId,
        fieldsErased: fieldsErased.length,
        anonymisedRecords,
        cognitoDisabled,
      });

      const response: ErasureResponse = {
        success: true,
        travellerId,
        erasureId,
        fieldsErased,
        anonymisedRecords,
        cognitoDisabled,
        completedAt,
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response),
        headers: {
          'Content-Type': 'application/json',
        },
      };
    } finally {
      await db.end();
    }
  } catch (error) {
    const err = error as Error;

    if (err.name === 'TenantContextError') {
      const statusCode = (err as { statusCode?: number }).statusCode || 403;
      return {
        statusCode,
        body: JSON.stringify({ error: err.message }),
      };
    }

    console.error('Error erasing personal data:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
