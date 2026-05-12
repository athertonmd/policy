/**
 * TMC Dashboard Handler
 *
 * GET /v1/tmc/queue — Unified queue view (pending approvals, exceptions, overrides, SLA breaches).
 * Real-time data (queries current state).
 * Queue assignment and workload distribution.
 * Bulk actions support.
 *
 * Requirements: 19.1, 19.2, 19.3, 19.4, 19.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withDatabase } from '../lib/database.js';
import type { DatabaseClient } from '../lib/database.js';
import { extractTenantId, extractUserId, successResponse, errorResponse } from './shared.js';

// --- Types ---

export type QueueItemType = 'approval' | 'exception' | 'override' | 'sla_breach';

export type QueueItemPriority = 'low' | 'normal' | 'high' | 'urgent';

export type QueueItemStatus = 'pending' | 'assigned' | 'in_progress' | 'escalated';

export interface QueueItem {
  itemId: string;
  type: QueueItemType;
  priority: QueueItemPriority;
  status: QueueItemStatus;
  assignedTo: string | null;
  createdAt: string;
  slaDeadline: string;
  slaBreached: boolean;
  traveller: {
    travellerId: string;
    name: string;
    department: string;
    costCentre: string;
  };
  tripSummary: {
    tripId: string;
    origin: string;
    destination: string;
    departureDate: string;
    returnDate: string | null;
    totalCost: number;
    currency: string;
    tripType: string;
  };
  policyResult: {
    decision: string;
    winningRules: string[];
    reasons: string[];
  } | null;
  approvalHistory: ApprovalHistoryEntry[];
  metadata: Record<string, unknown>;
}

export interface ApprovalHistoryEntry {
  action: string;
  actorId: string;
  actorName: string;
  timestamp: string;
  comment?: string;
}

export interface QueueFilter {
  type?: QueueItemType[];
  priority?: QueueItemPriority[];
  status?: QueueItemStatus[];
  assignedTo?: string;
  slaBreached?: boolean;
  department?: string;
  search?: string;
}

export interface QueueSortOptions {
  field: 'createdAt' | 'slaDeadline' | 'priority' | 'type';
  direction: 'asc' | 'desc';
}

export interface QueueResponse {
  items: QueueItem[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  summary: QueueSummary;
}

export interface QueueSummary {
  totalPending: number;
  totalAssigned: number;
  totalBreached: number;
  byType: Record<QueueItemType, number>;
  byPriority: Record<QueueItemPriority, number>;
}

export interface BulkActionRequest {
  action: 'approve' | 'reject' | 'reassign';
  itemIds: string[];
  comment?: string;
  reassignTo?: string;
}

export interface BulkActionResult {
  successful: string[];
  failed: Array<{ itemId: string; error: string }>;
  totalProcessed: number;
}

export interface WorkloadDistribution {
  agentId: string;
  agentName: string;
  assignedCount: number;
  completedToday: number;
  averageResponseTimeMs: number;
  currentLoad: 'low' | 'medium' | 'high';
}

// --- Queue Query Logic ---

/**
 * Build SQL WHERE clause from filter parameters.
 */
function buildFilterClause(filter: QueueFilter): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filter.type && filter.type.length > 0) {
    conditions.push(`q.item_type = ANY($${paramIndex})`);
    params.push(filter.type);
    paramIndex++;
  }

  if (filter.priority && filter.priority.length > 0) {
    conditions.push(`q.priority = ANY($${paramIndex})`);
    params.push(filter.priority);
    paramIndex++;
  }

  if (filter.status && filter.status.length > 0) {
    conditions.push(`q.status = ANY($${paramIndex})`);
    params.push(filter.status);
    paramIndex++;
  }

  if (filter.assignedTo) {
    conditions.push(`q.assigned_to = $${paramIndex}`);
    params.push(filter.assignedTo);
    paramIndex++;
  }

  if (filter.slaBreached !== undefined) {
    conditions.push(`q.sla_breached = $${paramIndex}`);
    params.push(filter.slaBreached);
    paramIndex++;
  }

  if (filter.department) {
    conditions.push(`q.department = $${paramIndex}`);
    params.push(filter.department);
    paramIndex++;
  }

  if (filter.search) {
    conditions.push(
      `(q.traveller_name ILIKE $${paramIndex} OR q.trip_id ILIKE $${paramIndex})`
    );
    params.push(`%${filter.search}%`);
    paramIndex++;
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { clause, params };
}

/**
 * Query the unified TMC queue from the database.
 */
async function queryQueue(
  db: DatabaseClient,
  tenantId: string,
  filter: QueueFilter,
  sort: QueueSortOptions,
  page: number,
  pageSize: number
): Promise<{ items: QueueItem[]; totalCount: number }> {
  const { clause: filterClause, params: filterParams } = buildFilterClause(filter);
  const offset = (page - 1) * pageSize;

  // Priority sort mapping for ORDER BY
  const sortField = sort.field === 'priority'
    ? `CASE q.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`
    : `q.${sort.field === 'createdAt' ? 'created_at' : sort.field === 'slaDeadline' ? 'sla_deadline' : 'item_type'}`;

  const orderDirection = sort.direction === 'asc' ? 'ASC' : 'DESC';

  // Count query
  const countSql = `
    SELECT COUNT(*) as count
    FROM "${tenantId}".tmc_queue q
    ${filterClause}
  `;
  const countResult = await db.query<{ count: string }>(countSql, filterParams);
  const totalCount = parseInt(countResult.rows[0]?.count ?? '0', 10);

  // Data query
  const limitParam = filterParams.length + 1;
  const offsetParam = filterParams.length + 2;
  const dataSql = `
    SELECT
      q.item_id as "itemId",
      q.item_type as "type",
      q.priority,
      q.status,
      q.assigned_to as "assignedTo",
      q.created_at as "createdAt",
      q.sla_deadline as "slaDeadline",
      q.sla_breached as "slaBreached",
      q.traveller_json as "travellerJson",
      q.trip_summary_json as "tripSummaryJson",
      q.policy_result_json as "policyResultJson",
      q.approval_history_json as "approvalHistoryJson",
      q.metadata_json as "metadataJson"
    FROM "${tenantId}".tmc_queue q
    ${filterClause}
    ORDER BY ${sortField} ${orderDirection}, q.created_at ASC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const dataResult = await db.query<{
    itemId: string;
    type: QueueItemType;
    priority: QueueItemPriority;
    status: QueueItemStatus;
    assignedTo: string | null;
    createdAt: string;
    slaDeadline: string;
    slaBreached: boolean;
    travellerJson: string;
    tripSummaryJson: string;
    policyResultJson: string | null;
    approvalHistoryJson: string;
    metadataJson: string;
  }>(dataSql, [...filterParams, pageSize, offset]);

  const items: QueueItem[] = dataResult.rows.map((row) => ({
    itemId: row.itemId,
    type: row.type,
    priority: row.priority,
    status: row.status,
    assignedTo: row.assignedTo,
    createdAt: row.createdAt,
    slaDeadline: row.slaDeadline,
    slaBreached: row.slaBreached,
    traveller: JSON.parse(row.travellerJson),
    tripSummary: JSON.parse(row.tripSummaryJson),
    policyResult: row.policyResultJson ? JSON.parse(row.policyResultJson) : null,
    approvalHistory: JSON.parse(row.approvalHistoryJson ?? '[]'),
    metadata: JSON.parse(row.metadataJson ?? '{}'),
  }));

  return { items, totalCount };
}

/**
 * Get queue summary statistics.
 */
async function getQueueSummary(db: DatabaseClient, tenantId: string): Promise<QueueSummary> {
  const summarySql = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending') as "totalPending",
      COUNT(*) FILTER (WHERE status = 'assigned' OR status = 'in_progress') as "totalAssigned",
      COUNT(*) FILTER (WHERE sla_breached = true) as "totalBreached",
      COUNT(*) FILTER (WHERE item_type = 'approval') as "typeApproval",
      COUNT(*) FILTER (WHERE item_type = 'exception') as "typeException",
      COUNT(*) FILTER (WHERE item_type = 'override') as "typeOverride",
      COUNT(*) FILTER (WHERE item_type = 'sla_breach') as "typeSlaBreach",
      COUNT(*) FILTER (WHERE priority = 'low') as "priorityLow",
      COUNT(*) FILTER (WHERE priority = 'normal') as "priorityNormal",
      COUNT(*) FILTER (WHERE priority = 'high') as "priorityHigh",
      COUNT(*) FILTER (WHERE priority = 'urgent') as "priorityUrgent"
    FROM "${tenantId}".tmc_queue
    WHERE status NOT IN ('completed', 'cancelled')
  `;

  const result = await db.query<Record<string, string>>(summarySql);
  const row = result.rows[0] ?? {};

  return {
    totalPending: parseInt(row.totalPending ?? '0', 10),
    totalAssigned: parseInt(row.totalAssigned ?? '0', 10),
    totalBreached: parseInt(row.totalBreached ?? '0', 10),
    byType: {
      approval: parseInt(row.typeApproval ?? '0', 10),
      exception: parseInt(row.typeException ?? '0', 10),
      override: parseInt(row.typeOverride ?? '0', 10),
      sla_breach: parseInt(row.typeSlaBreach ?? '0', 10),
    },
    byPriority: {
      low: parseInt(row.priorityLow ?? '0', 10),
      normal: parseInt(row.priorityNormal ?? '0', 10),
      high: parseInt(row.priorityHigh ?? '0', 10),
      urgent: parseInt(row.priorityUrgent ?? '0', 10),
    },
  };
}

/**
 * Get workload distribution across TMC agents.
 */
async function getWorkloadDistribution(
  db: DatabaseClient,
  tenantId: string
): Promise<WorkloadDistribution[]> {
  const sql = `
    SELECT
      a.agent_id as "agentId",
      a.agent_name as "agentName",
      COUNT(q.item_id) FILTER (WHERE q.status IN ('assigned', 'in_progress')) as "assignedCount",
      COUNT(q.item_id) FILTER (WHERE q.completed_at::date = CURRENT_DATE) as "completedToday",
      COALESCE(AVG(EXTRACT(EPOCH FROM (q.completed_at - q.assigned_at)) * 1000)
        FILTER (WHERE q.completed_at IS NOT NULL), 0) as "averageResponseTimeMs"
    FROM "${tenantId}".tmc_agents a
    LEFT JOIN "${tenantId}".tmc_queue q ON q.assigned_to = a.agent_id
    WHERE a.is_active = true
    GROUP BY a.agent_id, a.agent_name
    ORDER BY "assignedCount" DESC
  `;

  const result = await db.query<{
    agentId: string;
    agentName: string;
    assignedCount: string;
    completedToday: string;
    averageResponseTimeMs: string;
  }>(sql);

  return result.rows.map((row) => {
    const assigned = parseInt(row.assignedCount, 10);
    return {
      agentId: row.agentId,
      agentName: row.agentName,
      assignedCount: assigned,
      completedToday: parseInt(row.completedToday, 10),
      averageResponseTimeMs: Math.round(parseFloat(row.averageResponseTimeMs)),
      currentLoad: assigned > 20 ? 'high' : assigned > 10 ? 'medium' : 'low',
    };
  });
}

// --- Bulk Actions ---

/**
 * Execute bulk actions on queue items with audit logging.
 * Requirement 19.5: Support bulk approve, reject, reassign.
 */
async function executeBulkAction(
  db: DatabaseClient,
  tenantId: string,
  userId: string,
  request: BulkActionRequest
): Promise<BulkActionResult> {
  const successful: string[] = [];
  const failed: Array<{ itemId: string; error: string }> = [];

  for (const itemId of request.itemIds) {
    try {
      switch (request.action) {
        case 'approve':
          await db.query(
            `UPDATE "${tenantId}".tmc_queue
             SET status = 'completed', completed_at = NOW(),
                 approval_history_json = approval_history_json::jsonb || $1::jsonb
             WHERE item_id = $2 AND status IN ('pending', 'assigned', 'in_progress')`,
            [
              JSON.stringify([{
                action: 'approved',
                actorId: userId,
                actorName: userId,
                timestamp: new Date().toISOString(),
                comment: request.comment ?? 'Bulk approved',
              }]),
              itemId,
            ]
          );
          break;

        case 'reject':
          await db.query(
            `UPDATE "${tenantId}".tmc_queue
             SET status = 'completed', completed_at = NOW(),
                 approval_history_json = approval_history_json::jsonb || $1::jsonb
             WHERE item_id = $2 AND status IN ('pending', 'assigned', 'in_progress')`,
            [
              JSON.stringify([{
                action: 'rejected',
                actorId: userId,
                actorName: userId,
                timestamp: new Date().toISOString(),
                comment: request.comment ?? 'Bulk rejected',
              }]),
              itemId,
            ]
          );
          break;

        case 'reassign':
          if (!request.reassignTo) {
            failed.push({ itemId, error: 'reassignTo is required for reassign action' });
            continue;
          }
          await db.query(
            `UPDATE "${tenantId}".tmc_queue
             SET assigned_to = $1, status = 'assigned',
                 assigned_at = NOW(),
                 approval_history_json = approval_history_json::jsonb || $2::jsonb
             WHERE item_id = $3 AND status IN ('pending', 'assigned', 'in_progress')`,
            [
              request.reassignTo,
              JSON.stringify([{
                action: 'reassigned',
                actorId: userId,
                actorName: userId,
                timestamp: new Date().toISOString(),
                comment: request.comment ?? `Reassigned to ${request.reassignTo}`,
              }]),
              itemId,
            ]
          );
          break;
      }

      successful.push(itemId);
    } catch (error) {
      failed.push({
        itemId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    successful,
    failed,
    totalProcessed: successful.length + failed.length,
  };
}

// --- Lambda Handlers ---

/**
 * GET /v1/tmc/queue — Unified queue view handler.
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    // Parse query parameters
    const params = event.queryStringParameters ?? {};
    const page = Math.max(1, parseInt(params.page ?? '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(params.pageSize ?? '25', 10)));

    const filter: QueueFilter = {
      type: params.type ? (params.type.split(',') as QueueItemType[]) : undefined,
      priority: params.priority ? (params.priority.split(',') as QueueItemPriority[]) : undefined,
      status: params.status ? (params.status.split(',') as QueueItemStatus[]) : undefined,
      assignedTo: params.assignedTo ?? undefined,
      slaBreached: params.slaBreached ? params.slaBreached === 'true' : undefined,
      department: params.department ?? undefined,
      search: params.search ?? undefined,
    };

    const sort: QueueSortOptions = {
      field: (params.sortBy as QueueSortOptions['field']) ?? 'priority',
      direction: (params.sortDirection as QueueSortOptions['direction']) ?? 'desc',
    };

    const result = await withDatabase(async (db) => {
      const [queueResult, summary] = await Promise.all([
        queryQueue(db, tenantId, filter, sort, page, pageSize),
        getQueueSummary(db, tenantId),
      ]);

      const response: QueueResponse = {
        items: queueResult.items,
        pagination: {
          page,
          pageSize,
          totalCount: queueResult.totalCount,
          totalPages: Math.ceil(queueResult.totalCount / pageSize),
        },
        summary,
      };

      return response;
    });

    return successResponse(200, result, requestId);
  } catch (error) {
    console.error('TMC queue query failed:', error);
    return errorResponse(
      500,
      'QUEUE_QUERY_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

/**
 * POST /v1/tmc/queue/bulk-action — Bulk actions handler.
 */
export async function bulkActionHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    const userId = extractUserId(event);

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const request = JSON.parse(event.body) as BulkActionRequest;

    // Validate request
    if (!request.action || !['approve', 'reject', 'reassign'].includes(request.action)) {
      return errorResponse(400, 'INVALID_ACTION', 'Action must be approve, reject, or reassign', requestId);
    }

    if (!request.itemIds || request.itemIds.length === 0) {
      return errorResponse(400, 'MISSING_ITEMS', 'At least one item ID is required', requestId);
    }

    if (request.itemIds.length > 50) {
      return errorResponse(400, 'TOO_MANY_ITEMS', 'Maximum 50 items per bulk action', requestId);
    }

    if (request.action === 'reassign' && !request.reassignTo) {
      return errorResponse(400, 'MISSING_REASSIGN_TO', 'reassignTo is required for reassign action', requestId);
    }

    const result = await withDatabase(async (db) => {
      return executeBulkAction(db, tenantId, userId, request);
    });

    return successResponse(200, result, requestId);
  } catch (error) {
    console.error('Bulk action failed:', error);
    return errorResponse(
      500,
      'BULK_ACTION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

/**
 * GET /v1/tmc/workload — Workload distribution handler.
 */
export async function workloadHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    const result = await withDatabase(async (db) => {
      return getWorkloadDistribution(db, tenantId);
    });

    return successResponse(200, { agents: result }, requestId);
  } catch (error) {
    console.error('Workload query failed:', error);
    return errorResponse(
      500,
      'WORKLOAD_QUERY_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
