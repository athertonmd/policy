/**
 * Database operations for approval_workflows and approval_actions tables.
 * Provides CRUD operations for workflow records and action history.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
import type { DatabaseClient } from './database.js';
import type {
  ApprovalWorkflow,
  ApprovalWorkflowStatus,
  ApprovalAction,
  WorkflowTemplate,
} from '@travel-policy/shared';

export interface WorkflowRecord {
  workflowId: string;
  tenantId: string;
  decisionId: string;
  tripRequestId: string;
  travellerId: string;
  workflowTemplateId: string;
  priority: 'normal' | 'urgent';
  status: ApprovalWorkflowStatus;
  currentStage: number;
  stepFunctionExecutionArn: string;
  stagesJson: string;
  initiatedAt: string;
  completedAt: string | null;
}

export interface ActionRecord {
  actionId: string;
  workflowId: string;
  tenantId: string;
  stageNumber: number;
  approverId: string;
  action: ApprovalAction;
  comment: string | null;
  taskToken: string | null;
  createdAt: string;
}

export interface WorkflowTemplateRecord {
  templateId: string;
  tenantId: string;
  name: string;
  description: string | null;
  stagesJson: string;
  escalationRulesJson: string;
  autoApprovalConditionsJson: string | null;
  slaConfigJson: string;
  isActive: boolean;
}

/**
 * Create a new workflow record in the tenant's approval_workflows table.
 */
export async function createWorkflow(
  db: DatabaseClient,
  tenantId: string,
  workflow: {
    workflowId: string;
    decisionId: string;
    tripRequestId: string;
    travellerId: string;
    workflowTemplateId: string;
    priority: 'normal' | 'urgent';
    status: ApprovalWorkflowStatus;
    currentStage: number;
    stepFunctionExecutionArn: string;
    stages: unknown[];
  }
): Promise<WorkflowRecord> {
  const now = new Date().toISOString();
  const stagesJson = JSON.stringify(workflow.stages);

  const result = await db.query<WorkflowRecord>(
    `INSERT INTO "${tenantId}".approval_workflows
      (workflow_id, tenant_id, decision_id, trip_request_id, traveller_id,
       workflow_template_id, priority, status, current_stage,
       step_function_execution_arn, stages_json, initiated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING
       workflow_id AS "workflowId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       trip_request_id AS "tripRequestId",
       traveller_id AS "travellerId",
       workflow_template_id AS "workflowTemplateId",
       priority,
       status,
       current_stage AS "currentStage",
       step_function_execution_arn AS "stepFunctionExecutionArn",
       stages_json AS "stagesJson",
       initiated_at AS "initiatedAt",
       completed_at AS "completedAt"`,
    [
      workflow.workflowId,
      tenantId,
      workflow.decisionId,
      workflow.tripRequestId,
      workflow.travellerId,
      workflow.workflowTemplateId,
      workflow.priority,
      workflow.status,
      workflow.currentStage,
      workflow.stepFunctionExecutionArn,
      stagesJson,
      now,
    ]
  );

  return result.rows[0];
}

/**
 * Get a workflow by ID.
 */
export async function getWorkflow(
  db: DatabaseClient,
  tenantId: string,
  workflowId: string
): Promise<WorkflowRecord | null> {
  const result = await db.query<WorkflowRecord>(
    `SELECT
       workflow_id AS "workflowId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       trip_request_id AS "tripRequestId",
       traveller_id AS "travellerId",
       workflow_template_id AS "workflowTemplateId",
       priority,
       status,
       current_stage AS "currentStage",
       step_function_execution_arn AS "stepFunctionExecutionArn",
       stages_json AS "stagesJson",
       initiated_at AS "initiatedAt",
       completed_at AS "completedAt"
     FROM "${tenantId}".approval_workflows
     WHERE workflow_id = $1`,
    [workflowId]
  );

  return result.rows[0] ?? null;
}

/**
 * Update workflow status and optionally the current stage.
 */
export async function updateWorkflowStatus(
  db: DatabaseClient,
  tenantId: string,
  workflowId: string,
  status: ApprovalWorkflowStatus,
  currentStage?: number,
  stagesJson?: string
): Promise<WorkflowRecord | null> {
  const completedAt = ['approved', 'rejected', 'expired', 'cancelled'].includes(status)
    ? new Date().toISOString()
    : null;

  let sql = `UPDATE "${tenantId}".approval_workflows
     SET status = $2, completed_at = COALESCE($3, completed_at)`;
  const params: unknown[] = [workflowId, status, completedAt];

  if (currentStage !== undefined) {
    sql += `, current_stage = $${params.length + 1}`;
    params.push(currentStage);
  }

  if (stagesJson !== undefined) {
    sql += `, stages_json = $${params.length + 1}`;
    params.push(stagesJson);
  }

  sql += ` WHERE workflow_id = $1
     RETURNING
       workflow_id AS "workflowId",
       tenant_id AS "tenantId",
       decision_id AS "decisionId",
       trip_request_id AS "tripRequestId",
       traveller_id AS "travellerId",
       workflow_template_id AS "workflowTemplateId",
       priority,
       status,
       current_stage AS "currentStage",
       step_function_execution_arn AS "stepFunctionExecutionArn",
       stages_json AS "stagesJson",
       initiated_at AS "initiatedAt",
       completed_at AS "completedAt"`;

  const result = await db.query<WorkflowRecord>(sql, params);
  return result.rows[0] ?? null;
}

/**
 * Record an approval action.
 */
export async function recordAction(
  db: DatabaseClient,
  tenantId: string,
  action: {
    actionId: string;
    workflowId: string;
    stageNumber: number;
    approverId: string;
    action: ApprovalAction;
    comment?: string;
    taskToken?: string;
  }
): Promise<ActionRecord> {
  const now = new Date().toISOString();

  const result = await db.query<ActionRecord>(
    `INSERT INTO "${tenantId}".approval_actions
      (action_id, workflow_id, tenant_id, stage_number, approver_id, action, comment, task_token, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING
       action_id AS "actionId",
       workflow_id AS "workflowId",
       tenant_id AS "tenantId",
       stage_number AS "stageNumber",
       approver_id AS "approverId",
       action,
       comment,
       task_token AS "taskToken",
       created_at AS "createdAt"`,
    [
      action.actionId,
      action.workflowId,
      tenantId,
      action.stageNumber,
      action.approverId,
      action.action,
      action.comment ?? null,
      action.taskToken ?? null,
      now,
    ]
  );

  return result.rows[0];
}

/**
 * Get the workflow template for a tenant.
 */
export async function getWorkflowTemplate(
  db: DatabaseClient,
  tenantId: string,
  templateId: string
): Promise<WorkflowTemplate | null> {
  const result = await db.query<WorkflowTemplateRecord>(
    `SELECT
       template_id AS "templateId",
       tenant_id AS "tenantId",
       name,
       description,
       stages_json AS "stagesJson",
       escalation_rules_json AS "escalationRulesJson",
       auto_approval_conditions_json AS "autoApprovalConditionsJson",
       sla_config_json AS "slaConfigJson",
       is_active AS "isActive"
     FROM "${tenantId}".workflow_templates
     WHERE template_id = $1 AND is_active = true`,
    [templateId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    templateId: row.templateId,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description ?? undefined,
    stages: JSON.parse(row.stagesJson),
    escalationRules: JSON.parse(row.escalationRulesJson),
    autoApprovalConditions: row.autoApprovalConditionsJson
      ? JSON.parse(row.autoApprovalConditionsJson)
      : undefined,
    slaConfig: JSON.parse(row.slaConfigJson),
    isActive: row.isActive,
    createdBy: 'system',
    createdAt: '',
    updatedAt: '',
  };
}

/**
 * Store a task token for a workflow stage (used for Step Functions callback).
 */
export async function storeTaskToken(
  db: DatabaseClient,
  tenantId: string,
  workflowId: string,
  stageNumber: number,
  taskToken: string
): Promise<void> {
  await db.query(
    `INSERT INTO "${tenantId}".workflow_task_tokens
      (workflow_id, stage_number, task_token, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (workflow_id, stage_number)
     DO UPDATE SET task_token = $3, created_at = $4`,
    [workflowId, stageNumber, taskToken, new Date().toISOString()]
  );
}

/**
 * Retrieve the task token for a workflow stage.
 */
export async function getTaskToken(
  db: DatabaseClient,
  tenantId: string,
  workflowId: string,
  stageNumber: number
): Promise<string | null> {
  const result = await db.query<{ taskToken: string }>(
    `SELECT task_token AS "taskToken"
     FROM "${tenantId}".workflow_task_tokens
     WHERE workflow_id = $1 AND stage_number = $2`,
    [workflowId, stageNumber]
  );

  return result.rows[0]?.taskToken ?? null;
}

/**
 * Convert a WorkflowRecord to the ApprovalWorkflow interface.
 */
export function toApprovalWorkflow(record: WorkflowRecord): ApprovalWorkflow {
  return {
    workflowId: record.workflowId,
    tenantId: record.tenantId,
    status: record.status,
    currentStage: record.currentStage,
    stages: JSON.parse(record.stagesJson),
    initiatedAt: record.initiatedAt,
    completedAt: record.completedAt ?? undefined,
    stepFunctionExecutionArn: record.stepFunctionExecutionArn,
  };
}
