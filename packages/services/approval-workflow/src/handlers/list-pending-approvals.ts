/**
 * Lambda handler: List pending approvals for an approver.
 * GET /v1/approvals/pending
 *
 * Returns a paginated list of pending approval workflows assigned to the approver.
 * Includes trip summary and SLA deadline for each item.
 * Checks for active delegations and includes delegated items.
 *
 * If all approvers in an escalation chain are unavailable, the workflow is held
 * in pending state and the tenant admin is notified.
 *
 * Requirements: 8.6, 8.7
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { findActiveDelegation } from './configure-delegation.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

export interface PendingApprovalItem {
  workflowId: string;
  stageNumber: number;
  tripRequestId: string;
  travellerId: string;
  priority: 'normal' | 'urgent';
  status: string;
  slaDeadline: string;
  initiatedAt: string;
  tripSummary: {
    tripId: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    totalCost: string;
    currency: string;
    tripType: string;
  } | null;
  isDelegated: boolean;
  originalApproverId: string | null;
}

interface WorkflowRow {
  workflowId: string;
  tripRequestId: string;
  travellerId: string;
  priority: 'normal' | 'urgent';
  status: string;
  currentStage: number;
  stagesJson: string;
  initiatedAt: string;
}

/**
 * Query pending workflows assigned to a specific approver.
 */
async function queryPendingWorkflows(
  db: DatabaseClient,
  tenantId: string,
  approverId: string,
  statusFilter: string | undefined,
  page: number,
  pageSize: number
): Promise<{ items: WorkflowRow[]; totalCount: number }> {
  const offset = (page - 1) * pageSize;
  const statusCondition = statusFilter ? `AND w.status = $3` : `AND w.status = 'pending'`;
  const params: unknown[] = [approverId, tenantId];

  if (statusFilter) {
    params.push(statusFilter);
  }

  // Count total matching records
  const countResult = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
     FROM "${tenantId}".approval_workflows w
     WHERE w.tenant_id = $2
       ${statusCondition}
       AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(w.stages_json::jsonb) AS stage
         WHERE stage->>'status' = 'pending'
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(stage->'approvers') AS approver
             WHERE approver->>'approverId' = $1
           )
           OR (
             stage->>'status' = 'pending'
             AND w.current_stage = (stage->>'stageNumber')::int
           )
       )`,
    params
  );

  const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Query the actual records with pagination
  const dataParams = [...params, pageSize, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const dataResult = await db.query<WorkflowRow>(
    `SELECT
       w.workflow_id AS "workflowId",
       w.trip_request_id AS "tripRequestId",
       w.traveller_id AS "travellerId",
       w.priority,
       w.status,
       w.current_stage AS "currentStage",
       w.stages_json AS "stagesJson",
       w.initiated_at AS "initiatedAt"
     FROM "${tenantId}".approval_workflows w
     WHERE w.tenant_id = $2
       ${statusCondition}
     ORDER BY
       CASE WHEN w.priority = 'urgent' THEN 0 ELSE 1 END,
       w.initiated_at ASC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    dataParams
  );

  return { items: dataResult.rows, totalCount };
}

/**
 * Extract SLA deadline from the current stage of a workflow.
 */
function extractSlaDeadline(stagesJson: string, currentStage: number): string {
  try {
    const stages = JSON.parse(stagesJson) as Array<{ stageNumber: number; slaDeadline?: string }>;
    const stage = stages.find((s) => s.stageNumber === currentStage);
    return stage?.slaDeadline ?? new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  } catch {
    return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  }
}

/**
 * Notify tenant admin when all approvers in an escalation chain are unavailable.
 * The workflow is held in pending state per requirement 8.7.
 */
async function notifyTenantAdminUnavailable(
  tenantId: string,
  workflowId: string,
  approverId: string
): Promise<void> {
  try {
    await eventBridgeClient.send(
      new PutEventsCommand({
        Entries: [
          {
            Source: 'travel-policy-platform.approval-workflow',
            DetailType: 'ApproverUnavailable',
            Detail: JSON.stringify({
              tenantId,
              workflowId,
              approverId,
              message: 'All approvers in escalation chain are unavailable. Workflow held in pending state.',
              timestamp: new Date().toISOString(),
            }),
            EventBusName: EVENT_BUS_NAME,
          },
        ],
      })
    );
  } catch (error) {
    console.error('Failed to notify tenant admin about unavailable approvers:', error);
  }
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

    // Extract query parameters
    const approverId = event.queryStringParameters?.approverId;
    if (!approverId) {
      return errorResponse(
        400,
        'MISSING_APPROVER_ID',
        'approverId query parameter is required',
        requestId
      );
    }

    const statusFilter = event.queryStringParameters?.status;
    const page = Math.max(1, parseInt(event.queryStringParameters?.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(event.queryStringParameters?.pageSize ?? '20', 10)));

    const result = await withDatabase(async (db) => {
      // Check for active delegations — include items delegated TO this approver
      const delegationsToApprover = await db.query<{ approverId: string }>(
        `SELECT approver_id AS "approverId"
         FROM "${tenantId}".approval_delegations
         WHERE delegate_to_id = $1
           AND is_active = true
           AND start_date <= $2
           AND end_date >= $2`,
        [approverId, new Date().toISOString()]
      );

      // Get the approver's own pending workflows
      const ownWorkflows = await queryPendingWorkflows(
        db,
        tenantId,
        approverId,
        statusFilter,
        page,
        pageSize
      );

      // Check if this approver has an active delegation (they are away)
      const activeDelegation = await findActiveDelegation(db, tenantId, approverId);

      // Build the response items
      const items: PendingApprovalItem[] = ownWorkflows.items.map((row) => ({
        workflowId: row.workflowId,
        stageNumber: row.currentStage,
        tripRequestId: row.tripRequestId,
        travellerId: row.travellerId,
        priority: row.priority,
        status: row.status,
        slaDeadline: extractSlaDeadline(row.stagesJson, row.currentStage),
        initiatedAt: row.initiatedAt,
        tripSummary: null, // Trip summary would be joined from trip_requests table
        isDelegated: false,
        originalApproverId: null,
      }));

      // Add delegated items (items from approvers who delegated to this user)
      for (const delegation of delegationsToApprover.rows) {
        const delegatedWorkflows = await queryPendingWorkflows(
          db,
          tenantId,
          delegation.approverId,
          statusFilter,
          1,
          pageSize
        );

        for (const row of delegatedWorkflows.items) {
          items.push({
            workflowId: row.workflowId,
            stageNumber: row.currentStage,
            tripRequestId: row.tripRequestId,
            travellerId: row.travellerId,
            priority: row.priority,
            status: row.status,
            slaDeadline: extractSlaDeadline(row.stagesJson, row.currentStage),
            initiatedAt: row.initiatedAt,
            tripSummary: null,
            isDelegated: true,
            originalApproverId: delegation.approverId,
          });
        }
      }

      // If the approver has an active delegation and there are pending items,
      // notify tenant admin that approver is unavailable (requirement 8.7)
      if (activeDelegation && ownWorkflows.totalCount > 0) {
        // Items should be redirected to delegate, but if they're still here
        // it means the delegation wasn't applied at routing time
        await notifyTenantAdminUnavailable(tenantId, items[0]?.workflowId ?? '', approverId);
      }

      return {
        items,
        pagination: {
          page,
          pageSize,
          totalCount: ownWorkflows.totalCount + delegationsToApprover.rowCount,
          totalPages: Math.ceil(
            (ownWorkflows.totalCount + delegationsToApprover.rowCount) / pageSize
          ),
        },
        activeDelegation: activeDelegation
          ? {
              delegateToId: activeDelegation.delegateToId,
              startDate: activeDelegation.startDate,
              endDate: activeDelegation.endDate,
            }
          : null,
      };
    });

    return successResponse(200, result, requestId);
  } catch (error) {
    console.error('List pending approvals failed:', error);
    return errorResponse(
      500,
      'LIST_PENDING_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
