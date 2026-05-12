/**
 * PUT /v1/profiles/{travellerId}
 *
 * Updates a traveller profile with role-based field restrictions.
 * - Validates which fields the user is allowed to update based on role
 * - Encrypts PII fields before storage using tenant KMS key
 * - Publishes ProfileUpdated event to EventBridge
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
import { extractRoleFromClaims } from '@travel-policy/shared';
import { createDatabaseClient } from '../lib/database.js';
import {
  validateUpdatePermissions,
  type ProfileRole,
} from '../lib/field-access-control.js';
import { encryptField } from '../lib/pii-encryption.js';

const eventBridgeClient = new EventBridgeClient({});

interface UpdatePayload {
  fullName?: string;
  department?: string;
  costCentre?: string;
  seniorityLevel?: string;
  region?: string;
  managerId?: string;
  preferences?: Record<string, unknown>;
  loyaltyProgrammes?: Array<{
    programmeId: string;
    programmeName: string;
    membershipNumber: string;
    tier?: string;
  }>;
  passportDetails?: string;
  emergencyContact?: string;
}

/**
 * Maps camelCase field names to snake_case column names.
 */
const FIELD_TO_COLUMN: Record<string, string> = {
  fullName: 'full_name',
  department: 'department',
  costCentre: 'cost_centre',
  seniorityLevel: 'seniority_level',
  region: 'region',
  managerId: 'manager_id',
  preferences: 'preferences',
  loyaltyProgrammes: 'loyalty_programmes',
  passportDetails: 'passport_details_encrypted',
  emergencyContact: 'emergency_contact_encrypted',
};

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    const travellerId = event.pathParameters?.travellerId;
    if (!travellerId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing travellerId path parameter' }),
      };
    }

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const updatePayload: UpdatePayload = JSON.parse(event.body);
    const updateFields = Object.keys(updatePayload).filter(
      (key) => updatePayload[key as keyof UpdatePayload] !== undefined
    );

    if (updateFields.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No fields to update' }),
      };
    }

    // Extract JWT claims and tenant context
    const claims = extractClaimsFromEvent(event as Parameters<typeof extractClaimsFromEvent>[0]);
    const tenantId = extractTenantIdFromClaims(claims);
    const role = extractRoleFromClaims(claims) as ProfileRole;
    const userId = (claims.sub as string) || '';

    // Determine if this is the user's own profile
    const isOwnProfile = userId === travellerId;

    // Validate field-level write permissions
    const { allowed, deniedFields } = validateUpdatePermissions(
      updateFields,
      role,
      isOwnProfile
    );

    if (!allowed) {
      return {
        statusCode: 403,
        body: JSON.stringify({
          error: 'Insufficient permissions to update the requested fields',
          deniedFields,
        }),
      };
    }

    // Connect to database and resolve tenant
    const db = await createDatabaseClient();
    try {
      const tenantContext = await resolveTenantContext(db, tenantId);
      await scopeConnectionToTenant(db, tenantContext.schemaName);

      // Verify the profile exists
      const existsResult = await db.query(
        'SELECT traveller_id FROM traveller_profiles WHERE traveller_id = $1',
        [travellerId]
      );

      if (existsResult.rowCount === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Profile not found' }),
        };
      }

      // Build the UPDATE query dynamically
      const kmsKeyArn = process.env.TENANT_KMS_KEY_ARN || '';
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      for (const field of updateFields) {
        const column = FIELD_TO_COLUMN[field];
        if (!column) continue;

        let value = updatePayload[field as keyof UpdatePayload];

        // Encrypt PII fields
        if (field === 'passportDetails' || field === 'emergencyContact') {
          if (typeof value === 'string' && value && kmsKeyArn) {
            value = await encryptField(value, kmsKeyArn);
          }
        }

        // Serialize JSON fields
        if (field === 'preferences' || field === 'loyaltyProgrammes') {
          value = JSON.stringify(value);
        }

        setClauses.push(`${column} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }

      // Always update the updated_at timestamp
      setClauses.push(`updated_at = NOW()`);

      const updateSql = `
        UPDATE traveller_profiles
        SET ${setClauses.join(', ')}
        WHERE traveller_id = $${paramIndex}
        RETURNING traveller_id, updated_at
      `;
      values.push(travellerId);

      const updateResult = await db.query<{ traveller_id: string; updated_at: string }>(
        updateSql,
        values
      );

      await resetConnectionScope(db);

      // Publish ProfileUpdated event to EventBridge
      const eventBusName = process.env.EVENT_BUS_NAME || 'travel-policy-platform';
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.traveller-profile',
              DetailType: 'ProfileUpdated',
              Detail: JSON.stringify({
                travellerId,
                tenantId,
                updatedBy: userId,
                updatedFields: updateFields,
                updatedAt: updateResult.rows[0]?.updated_at,
              }),
              EventBusName: eventBusName,
            },
          ],
        })
      );

      return {
        statusCode: 200,
        body: JSON.stringify({
          travellerId,
          updatedFields: updateFields,
          updatedAt: updateResult.rows[0]?.updated_at,
        }),
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

    if (err instanceof SyntaxError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    console.error('Error updating profile:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
