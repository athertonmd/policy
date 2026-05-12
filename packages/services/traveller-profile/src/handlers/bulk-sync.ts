/**
 * POST /v1/profiles/bulk-sync
 *
 * Accepts an array of profile records for batch upsert.
 * Validates and quarantines records that fail business rules.
 * Returns sync results: created, updated, quarantined counts.
 *
 * Requirements: 26.3, 26.4, 26.5
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
import { createDatabaseClient, type DatabaseClient } from '../lib/database.js';

const eventBridgeClient = new EventBridgeClient({});

export interface BulkSyncRecord {
  employeeId: string;
  email?: string;
  fullName?: string;
  department?: string;
  costCentre?: string;
  seniorityLevel?: string;
  region?: string;
  managerId?: string;
  status?: 'active' | 'inactive';
}

export interface BulkSyncRequest {
  profiles: BulkSyncRecord[];
  source: string;
  syncId?: string;
}

export interface BulkSyncResponse {
  syncId: string;
  totalProcessed: number;
  created: number;
  updated: number;
  quarantined: number;
  errors: Array<{
    index: number;
    employeeId?: string;
    error: string;
  }>;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a single profile record against business rules.
 */
function validateRecord(record: BulkSyncRecord, index: number): ValidationResult {
  const errors: string[] = [];

  if (!record.employeeId || typeof record.employeeId !== 'string' || record.employeeId.trim() === '') {
    errors.push(`Record ${index}: employeeId is required`);
  }

  if (record.email !== undefined && record.email !== null) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (typeof record.email !== 'string' || !emailRegex.test(record.email)) {
      errors.push(`Record ${index}: invalid email format`);
    }
  }

  if (record.fullName !== undefined && record.fullName !== null) {
    if (typeof record.fullName !== 'string' || record.fullName.trim().length === 0) {
      errors.push(`Record ${index}: fullName must be a non-empty string`);
    }
    if (typeof record.fullName === 'string' && record.fullName.length > 255) {
      errors.push(`Record ${index}: fullName exceeds maximum length of 255 characters`);
    }
  }

  if (record.status !== undefined && !['active', 'inactive'].includes(record.status)) {
    errors.push(`Record ${index}: status must be 'active' or 'inactive'`);
  }

  if (record.department !== undefined && typeof record.department === 'string' && record.department.length > 100) {
    errors.push(`Record ${index}: department exceeds maximum length of 100 characters`);
  }

  if (record.costCentre !== undefined && typeof record.costCentre === 'string' && record.costCentre.length > 50) {
    errors.push(`Record ${index}: costCentre exceeds maximum length of 50 characters`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Upserts a single profile record into the database.
 * Returns 'created' or 'updated' based on whether the record existed.
 */
async function upsertProfile(
  db: DatabaseClient,
  schemaName: string,
  record: BulkSyncRecord
): Promise<'created' | 'updated'> {
  // Check if profile exists
  const existing = await db.query(
    `SELECT traveller_id FROM "${schemaName}".traveller_profiles WHERE employee_id = $1`,
    [record.employeeId]
  );

  if (existing.rowCount > 0) {
    // Update existing profile
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (record.email !== undefined) {
      setClauses.push(`email = $${paramIndex++}`);
      values.push(record.email);
    }
    if (record.fullName !== undefined) {
      setClauses.push(`full_name = $${paramIndex++}`);
      values.push(record.fullName);
    }
    if (record.department !== undefined) {
      setClauses.push(`department = $${paramIndex++}`);
      values.push(record.department);
    }
    if (record.costCentre !== undefined) {
      setClauses.push(`cost_centre = $${paramIndex++}`);
      values.push(record.costCentre);
    }
    if (record.seniorityLevel !== undefined) {
      setClauses.push(`seniority_level = $${paramIndex++}`);
      values.push(record.seniorityLevel);
    }
    if (record.region !== undefined) {
      setClauses.push(`region = $${paramIndex++}`);
      values.push(record.region);
    }
    if (record.managerId !== undefined) {
      setClauses.push(`manager_id = $${paramIndex++}`);
      values.push(record.managerId);
    }
    if (record.status !== undefined) {
      setClauses.push(`status = $${paramIndex++}`);
      values.push(record.status);
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = NOW()');
      await db.query(
        `UPDATE "${schemaName}".traveller_profiles
         SET ${setClauses.join(', ')}
         WHERE employee_id = $${paramIndex}`,
        [...values, record.employeeId]
      );
    }

    return 'updated';
  } else {
    // Create new profile
    await db.query(
      `INSERT INTO "${schemaName}".traveller_profiles
         (employee_id, email, full_name, department, cost_centre,
          seniority_level, region, manager_id, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())`,
      [
        record.employeeId,
        record.email || '',
        record.fullName || '',
        record.department || null,
        record.costCentre || null,
        record.seniorityLevel || null,
        record.region || null,
        record.managerId || null,
        record.status || 'active',
      ]
    );

    return 'created';
  }
}

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing request body' }),
      };
    }

    const request: BulkSyncRequest = JSON.parse(event.body);

    if (!request.profiles || !Array.isArray(request.profiles) || request.profiles.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'profiles array is required and must not be empty' }),
      };
    }

    if (request.profiles.length > 1000) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Maximum batch size is 1000 records' }),
      };
    }

    // Extract JWT claims and tenant context
    const claims = extractClaimsFromEvent(event as Parameters<typeof extractClaimsFromEvent>[0]);
    const tenantId = extractTenantIdFromClaims(claims);

    const syncId = request.syncId || `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const db = await createDatabaseClient();
    try {
      const tenantContext = await resolveTenantContext(db, tenantId);
      await scopeConnectionToTenant(db, tenantContext.schemaName);

      const response: BulkSyncResponse = {
        syncId,
        totalProcessed: request.profiles.length,
        created: 0,
        updated: 0,
        quarantined: 0,
        errors: [],
      };

      for (let i = 0; i < request.profiles.length; i++) {
        const record = request.profiles[i];

        // Validate record against business rules
        const validation = validateRecord(record, i);
        if (!validation.valid) {
          response.quarantined++;
          response.errors.push({
            index: i,
            employeeId: record.employeeId,
            error: validation.errors.join('; '),
          });
          continue;
        }

        try {
          const action = await upsertProfile(db, tenantContext.schemaName, record);
          if (action === 'created') {
            response.created++;
          } else {
            response.updated++;
          }
        } catch (err) {
          const error = err as Error;
          response.quarantined++;
          response.errors.push({
            index: i,
            employeeId: record.employeeId,
            error: `Database error: ${error.message}`,
          });
        }
      }

      await resetConnectionScope(db);

      // Publish bulk sync completed event
      const eventBusName = process.env.EVENT_BUS_NAME || 'travel-policy-platform';
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.traveller-profile',
              DetailType: 'ProfileUpdated',
              Detail: JSON.stringify({
                tenantId,
                action: 'bulk-sync',
                syncId,
                source: request.source,
                created: response.created,
                updated: response.updated,
                quarantined: response.quarantined,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: eventBusName,
            },
          ],
        })
      );

      console.log('Bulk sync completed:', {
        syncId,
        tenantId,
        created: response.created,
        updated: response.updated,
        quarantined: response.quarantined,
      });

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

    if (err instanceof SyntaxError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    console.error('Error in bulk sync:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
}
