/**
 * GET /v1/profiles/{travellerId}
 *
 * Retrieves a traveller profile with field-level access control.
 * - Resolves tenant context from JWT
 * - Queries traveller_profiles table in tenant schema
 * - Applies field-level access control based on user's role
 * - Decrypts PII fields only for authorized roles
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
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
  filterProfileForRole,
  canDecryptPii,
  type ProfileRole,
  type ProfileWithPii,
} from '../lib/field-access-control.js';
import { decryptField } from '../lib/pii-encryption.js';

interface ProfileRow {
  traveller_id: string;
  tenant_id: string;
  employee_id: string;
  email: string;
  full_name: string;
  department: string | null;
  cost_centre: string | null;
  seniority_level: string | null;
  region: string | null;
  manager_id: string | null;
  preferences: string | null;
  loyalty_programmes: string | null;
  passport_details_encrypted: string | null;
  emergency_contact_encrypted: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Maps a database row to a ProfileWithPii object.
 */
function mapRowToProfile(row: ProfileRow): ProfileWithPii {
  return {
    travellerId: row.traveller_id,
    tenantId: row.tenant_id,
    employeeId: row.employee_id,
    email: row.email,
    fullName: row.full_name,
    department: row.department ?? undefined,
    costCentre: row.cost_centre ?? undefined,
    seniorityLevel: row.seniority_level ?? undefined,
    region: row.region ?? undefined,
    managerId: row.manager_id ?? undefined,
    preferences: row.preferences ? JSON.parse(row.preferences) : {},
    loyaltyProgrammes: row.loyalty_programmes ? JSON.parse(row.loyalty_programmes) : [],
    status: row.status as 'active' | 'inactive' | 'suspended',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
    const role = extractRoleFromClaims(claims) as ProfileRole;
    const userId = (claims.sub as string) || '';

    // Connect to database and resolve tenant
    const db = await createDatabaseClient();
    try {
      const tenantContext = await resolveTenantContext(db, tenantId);
      await scopeConnectionToTenant(db, tenantContext.schemaName);

      // Query the profile
      const result = await db.query<ProfileRow>(
        `SELECT traveller_id, tenant_id, employee_id, email, full_name,
                department, cost_centre, seniority_level, region, manager_id,
                preferences, loyalty_programmes,
                passport_details_encrypted, emergency_contact_encrypted,
                status, created_at, updated_at
         FROM traveller_profiles
         WHERE traveller_id = $1`,
        [travellerId]
      );

      if (result.rowCount === 0) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'Profile not found' }),
        };
      }

      const row = result.rows[0];
      const profile = mapRowToProfile(row);

      // Determine if this is the user's own profile
      const isOwnProfile = userId === travellerId;

      // Decrypt PII fields if the role has access
      if (canDecryptPii(role, isOwnProfile)) {
        const kmsKeyArn = process.env.TENANT_KMS_KEY_ARN || '';

        if (row.passport_details_encrypted && kmsKeyArn) {
          profile.passportDetails = await decryptField(
            row.passport_details_encrypted,
            kmsKeyArn
          );
        }

        if (row.emergency_contact_encrypted && kmsKeyArn) {
          profile.emergencyContact = await decryptField(
            row.emergency_contact_encrypted,
            kmsKeyArn
          );
        }
      }

      // Apply field-level access control
      const filteredProfile = filterProfileForRole(profile, role, isOwnProfile);

      await resetConnectionScope(db);

      return {
        statusCode: 200,
        body: JSON.stringify(filteredProfile),
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

    console.error('Error fetching profile:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
