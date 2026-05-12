/**
 * Lambda handler: Request a policy override.
 * POST /v1/overrides
 *
 * Accepts a structured justification (reason category + free text),
 * validates override frequency limits, creates an override record,
 * initiates a dedicated override approval workflow, and publishes
 * a PolicyOverrideRequested event to EventBridge.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'node:crypto';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, extractUserId, successResponse, errorResponse } from './shared.js';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

/** Valid reason categories for override requests */
export const REASON_CATEGORIES = [
  'emergency',
  'executive',
  'event',
  'client_requirement',
  'other',
] as const;

export type ReasonCategory = (typeof REASON_CATEGORIES)[number];

/** Minimum justification text length */
const MIN_JUSTIFICATION_LENGTH = 10;

/** Default override frequency limit per traveller per month */
const DEFAULT_MAX_OVERRIDES_PER_MONTH = 3;

export interface OverrideRecord {
  overrideId: string;
  tenantId: string;
  decisionId: string;
  requestedBy: string;
  reasonCategory: ReasonCategory;
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy: string | null;
  approverComment: string | null;
  workflowId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OverrideFrequencyConfig {
  maxOverridesPerMonth: number;
  scope: 'traveller' | 'department';
}

/**
 * Check override frequency limits for a traveller within the configured time window.
 */
export async function checkOverrideFrequencyLimit(
  db: DatabaseClient,
  tenantId: string,
  requestedBy: string,
  maxPerMonth: number
): Promise<{ allowed: boolean; currentCount: number; limit: number }> {
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM "${tenantId}".policy_overrides
     WHERE requested_by = $1
       AND created_at >= $2`,
    [requestedBy, oneMonthAgo.toISOString()]
  );

  const currentCount = parseInt(result.rows[0]?.count ?? '0', 10);

  return {
    allowed: currentCount < maxPerMonth,
    currentCount,
    limit: maxPerMonth,
  };
}

/**
 * Get tenant-specific override frequency configuration.
 * Falls back to defaults if not configured.
 */
async function getOverrideFrequencyConfig(
  db: DatabaseClient,
  tenantId: string
): Promise<OverrideFrequencyConfig> {
  try {
    const result = await db.query<{ configJson: string }>(
      `SELECT config_json AS "configJson"
       FROM "${tenantId}".tenant_config
       WHERE config_key = 'override_frequency_limits'`,
      []
    );

    if (result.rows.length > 0) {
      const config = JSON.parse(result.rows[0].configJson);
      return {
        maxOverridesPerMonth: config.maxOverridesPerMonth ?? DEFAULT_MAX_OVERRIDES_PER_MONTH,
        scope: config.scope ?? 'traveller',
      };
    }
  } catch {
    // Table may not exist yet; fall back to defaults
  }

  return {
    maxOverridesPerMonth: DEFAULT_MAX_OVERRIDES_PER_MONTH,
    scope: 'traveller',
  };
}

/**
 * Create an override record in the database.
 */
async function createOverrideRecord(
  db: DatabaseClient,
  tenantId: string,
  override: {
    overrideId: string;
    decisionId: string;
    requestedBy: string;
    reasonCategory: ReasonCategory;
    justification: string;
    workflowId: string | null;
  }
): Promise<OverrideRecord> {
  const now = new Date().toISOString();

  const result = await db.query<OverrideRecord>(
    `INSERT INTO "${tenantId}".policy_overrides
      (override_id, tenant_id, decision_id, requested_by, reason_category,
       justification, status, workflow_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $8)
     RETURNING
       override_id AS "overrideId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       requested_by AS "requestedBy",
       reason_category AS "reasonCategory",
       justification,
       status,
       approved_by AS "approvedBy",
       approver_comment AS "approverComment",
       workflow_id AS "workflowId",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [
      override.overrideId,
      tenantId,
      override.decisionId,
      override.requestedBy,
      override.reasonCategory,
      override.justification,
      override.workflowId,
      now,
    ]
  );

  return result.rows[0];
}

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const body = JSON.parse(event.body) as {
      decisionId?: string;
      reasonCategory?: string;
      justification?: string;
      requestedBy?: string;
    };

    // Validate required fields
    if (!body.decisionId || !body.reasonCategory || !body.justification || !body.requestedBy) {
      return errorResponse(
        400,
        'MISSING_FIELDS',
        'decisionId, reasonCategory, justification, and requestedBy are required',
        requestId
      );
    }

    // Validate reason category
    if (!REASON_CATEGORIES.includes(body.reasonCategory as ReasonCategory)) {
      return errorResponse(
        400,
        'INVALID_REASON_CATEGORY',
        `reasonCategory must be one of: ${REASON_CATEGORIES.join(', ')}`,
        requestId
      );
    }

    // Validate justification length
    if (body.justification.trim().length < MIN_JUSTIFICATION_LENGTH) {
      return errorResponse(
        400,
        'JUSTIFICATION_TOO_SHORT',
        `Justification must be at least ${MIN_JUSTIFICATION_LENGTH} characters`,
        requestId
      );
    }

    const overrideId = randomUUID();
    const reasonCategory = body.reasonCategory as ReasonCategory;

    const result = await withDatabase(async (db) => {
      // 1. Check override frequency limits
      const frequencyConfig = await getOverrideFrequencyConfig(db, tenantId);
      const frequencyCheck = await checkOverrideFrequencyLimit(
        db,
        tenantId,
        body.requestedBy!,
        frequencyConfig.maxOverridesPerMonth
      );

      if (!frequencyCheck.allowed) {
        return {
          error: 'FREQUENCY_LIMIT_EXCEEDED' as const,
          currentCount: frequencyCheck.currentCount,
          limit: frequencyCheck.limit,
        };
      }

      // 2. Create the override record (workflow will be linked later if configured)
      const overrideRecord = await createOverrideRecord(db, tenantId, {
        overrideId,
        decisionId: body.decisionId!,
        requestedBy: body.requestedBy!,
        reasonCategory,
        justification: body.justification!,
        workflowId: null,
      });

      return { overrideRecord };
    });

    if ('error' in result) {
      if (result.error === 'FREQUENCY_LIMIT_EXCEEDED') {
        return errorResponse(
          429,
          'FREQUENCY_LIMIT_EXCEEDED',
          `Override frequency limit exceeded. ${result.currentCount}/${result.limit} overrides used this month.`,
          requestId
        );
      }
    }

    const { overrideRecord } = result as { overrideRecord: OverrideRecord };

    // 3. Publish PolicyOverrideRequested event
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.approval-workflow',
              DetailType: 'PolicyOverrideRequested',
              Detail: JSON.stringify({
                overrideId,
                tenantId,
                decisionId: body.decisionId,
                requestedBy: body.requestedBy,
                reasonCategory,
                justification: body.justification,
                requestId,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );
    } catch (eventError) {
      console.error('Failed to publish PolicyOverrideRequested event:', eventError);
    }

    return successResponse(201, overrideRecord, requestId);
  } catch (error) {
    console.error('Request override failed:', error);
    return errorResponse(
      500,
      'OVERRIDE_REQUEST_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
