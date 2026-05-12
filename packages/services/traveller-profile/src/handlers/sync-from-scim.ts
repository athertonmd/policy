/**
 * EventBridge handler for SCIM provisioning events.
 *
 * Receives ProfileCreated/ProfileUpdated/ProfileDeactivated events from the SCIM endpoint
 * and updates the traveller_profiles table in the tenant's schema.
 * Must complete within 30-second SLA.
 *
 * Requirements: 15.2, 26.2
 */

import type { EventBridgeEvent } from 'aws-lambda';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { createDatabaseClient, type DatabaseClient } from '../lib/database.js';

const eventBridgeClient = new EventBridgeClient({});

export interface SCIMProvisioningEvent {
  tenantId: string;
  eventType: 'ProfileCreated' | 'ProfileUpdated' | 'ProfileDeactivated';
  userId: string;
  employeeId: string;
  attributes: {
    email?: string;
    fullName?: string;
    department?: string;
    costCentre?: string;
    seniorityLevel?: string;
    region?: string;
    managerId?: string;
  };
  timestamp: string;
}

export interface SCIMSyncResult {
  success: boolean;
  profileId?: string;
  action: 'created' | 'updated' | 'deactivated';
  errors?: string[];
}

/**
 * Resolves the tenant schema name from the platform.tenants table.
 */
async function getTenantSchemaName(db: DatabaseClient, tenantId: string): Promise<string> {
  const result = await db.query<{ schema_name: string }>(
    `SELECT schema_name FROM platform.tenants WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );

  if (result.rowCount === 0) {
    throw new Error(`Tenant not found or inactive: ${tenantId}`);
  }

  return result.rows[0].schema_name;
}

/**
 * Creates a new traveller profile from a SCIM provisioning event.
 */
async function handleProfileCreated(
  db: DatabaseClient,
  schemaName: string,
  event: SCIMProvisioningEvent
): Promise<SCIMSyncResult> {
  const { userId, employeeId, attributes } = event;

  // Check if profile already exists (idempotency)
  const existing = await db.query(
    `SELECT traveller_id FROM "${schemaName}".traveller_profiles WHERE employee_id = $1`,
    [employeeId]
  );

  if (existing.rowCount > 0) {
    // Profile already exists, treat as update
    return handleProfileUpdated(db, schemaName, event);
  }

  const result = await db.query<{ traveller_id: string }>(
    `INSERT INTO "${schemaName}".traveller_profiles
       (traveller_id, employee_id, email, full_name, department, cost_centre,
        seniority_level, region, manager_id, status, created_at, updated_at)
     VALUES (
       COALESCE($1, gen_random_uuid()::text), $2, $3, $4, $5, $6, $7, $8, $9, 'active', NOW(), NOW()
     )
     RETURNING traveller_id`,
    [
      userId,
      employeeId,
      attributes.email || '',
      attributes.fullName || '',
      attributes.department || null,
      attributes.costCentre || null,
      attributes.seniorityLevel || null,
      attributes.region || null,
      attributes.managerId || null,
    ]
  );

  return {
    success: true,
    profileId: result.rows[0].traveller_id,
    action: 'created',
  };
}

/**
 * Updates an existing traveller profile from a SCIM provisioning event.
 */
async function handleProfileUpdated(
  db: DatabaseClient,
  schemaName: string,
  event: SCIMProvisioningEvent
): Promise<SCIMSyncResult> {
  const { employeeId, attributes } = event;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (attributes.email !== undefined) {
    setClauses.push(`email = $${paramIndex++}`);
    values.push(attributes.email);
  }
  if (attributes.fullName !== undefined) {
    setClauses.push(`full_name = $${paramIndex++}`);
    values.push(attributes.fullName);
  }
  if (attributes.department !== undefined) {
    setClauses.push(`department = $${paramIndex++}`);
    values.push(attributes.department);
  }
  if (attributes.costCentre !== undefined) {
    setClauses.push(`cost_centre = $${paramIndex++}`);
    values.push(attributes.costCentre);
  }
  if (attributes.seniorityLevel !== undefined) {
    setClauses.push(`seniority_level = $${paramIndex++}`);
    values.push(attributes.seniorityLevel);
  }
  if (attributes.region !== undefined) {
    setClauses.push(`region = $${paramIndex++}`);
    values.push(attributes.region);
  }
  if (attributes.managerId !== undefined) {
    setClauses.push(`manager_id = $${paramIndex++}`);
    values.push(attributes.managerId);
  }

  if (setClauses.length === 0) {
    return {
      success: true,
      action: 'updated',
      errors: ['No attributes to update'],
    };
  }

  setClauses.push('updated_at = NOW()');

  const result = await db.query<{ traveller_id: string }>(
    `UPDATE "${schemaName}".traveller_profiles
     SET ${setClauses.join(', ')}
     WHERE employee_id = $${paramIndex}
     RETURNING traveller_id`,
    [...values, employeeId]
  );

  if (result.rowCount === 0) {
    return {
      success: false,
      action: 'updated',
      errors: [`Profile not found for employee_id: ${employeeId}`],
    };
  }

  return {
    success: true,
    profileId: result.rows[0].traveller_id,
    action: 'updated',
  };
}

/**
 * Deactivates a traveller profile from a SCIM de-provisioning event.
 */
async function handleProfileDeactivated(
  db: DatabaseClient,
  schemaName: string,
  event: SCIMProvisioningEvent
): Promise<SCIMSyncResult> {
  const { employeeId } = event;

  const result = await db.query<{ traveller_id: string }>(
    `UPDATE "${schemaName}".traveller_profiles
     SET status = 'inactive', updated_at = NOW()
     WHERE employee_id = $1
     RETURNING traveller_id`,
    [employeeId]
  );

  if (result.rowCount === 0) {
    return {
      success: false,
      action: 'deactivated',
      errors: [`Profile not found for employee_id: ${employeeId}`],
    };
  }

  return {
    success: true,
    profileId: result.rows[0].traveller_id,
    action: 'deactivated',
  };
}

/**
 * EventBridge handler for SCIM provisioning events.
 * Processes create, update, and deactivate operations within 30-second SLA.
 */
export async function handler(
  event: EventBridgeEvent<'SCIMProvisioning', SCIMProvisioningEvent>
): Promise<SCIMSyncResult> {
  const startTime = Date.now();
  const scimEvent = event.detail;

  console.log('Processing SCIM event:', {
    eventType: scimEvent.eventType,
    tenantId: scimEvent.tenantId,
    employeeId: scimEvent.employeeId,
    timestamp: scimEvent.timestamp,
  });

  const db = await createDatabaseClient();
  try {
    const schemaName = await getTenantSchemaName(db, scimEvent.tenantId);

    let result: SCIMSyncResult;

    switch (scimEvent.eventType) {
      case 'ProfileCreated':
        result = await handleProfileCreated(db, schemaName, scimEvent);
        break;
      case 'ProfileUpdated':
        result = await handleProfileUpdated(db, schemaName, scimEvent);
        break;
      case 'ProfileDeactivated':
        result = await handleProfileDeactivated(db, schemaName, scimEvent);
        break;
      default:
        result = {
          success: false,
          action: 'updated',
          errors: [`Unknown event type: ${(scimEvent as SCIMProvisioningEvent).eventType}`],
        };
    }

    // Publish ProfileUpdated event to EventBridge
    if (result.success) {
      const eventBusName = process.env.EVENT_BUS_NAME || 'travel-policy-platform';
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.traveller-profile',
              DetailType: 'ProfileUpdated',
              Detail: JSON.stringify({
                travellerId: result.profileId,
                tenantId: scimEvent.tenantId,
                action: result.action,
                source: 'scim',
                timestamp: new Date().toISOString(),
              }),
              EventBusName: eventBusName,
            },
          ],
        })
      );
    }

    const durationMs = Date.now() - startTime;
    console.log('SCIM event processed:', {
      action: result.action,
      success: result.success,
      durationMs,
      withinSLA: durationMs < 30000,
    });

    return result;
  } finally {
    await db.end();
  }
}
