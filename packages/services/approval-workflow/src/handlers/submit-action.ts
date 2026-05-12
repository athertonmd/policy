/**
 * Lambda handler: Submit an approval action.
 * POST /v1/approvals/actions
 *
 * Validates the action against the current workflow state,
 * sends task success/failure to Step Functions with the task token,
 * records the action, and publishes an ApprovalActionTaken event.
 *
 * Requirements: 8.1, 8.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import {
  SFNClient,
  SendTaskSuccessCommand,
  SendTaskFailureCommand,
} from '@aws-sdk/client-sfn';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'node:crypto';

import { withDatabase } from '../lib/database.js';
import {
  getWorkflow,
  getTaskToken,
  recordAction,
  updateWorkflowStatus,
  toApprovalWorkflow,
} from '../lib/workflow-repository.js';
import type { ApprovalAction, ApprovalStage } from '@travel-policy/shared';
import { extractTenantId, successResponse, errorResponse } from './shared.js';

const sfnClient = new SFNClient({});
const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

/** Actions that advance the workflow positively */
const POSITIVE_ACTIONS: ApprovalAction[] = ['approve'];

/** Actions that terminate the workflow negatively */
const NEGATIVE_ACTIONS: ApprovalAction[] = ['reject'];

/** Actions that require additional routing */
const ROUTING_ACTIONS: ApprovalAction[] = ['delegate', 'escalate', 'request_info'];

const VALID_ACTIONS: ApprovalAction[] = [...POSITIVE_ACTIONS, ...NEGATIVE_ACTIONS, ...ROUTING_ACTIONS];

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
      workflowId?: string;
      stageNumber?: number;
      approverId?: string;
      action?: ApprovalAction;
      comment?: string;
      delegateToId?: string;
    };

    // Validate required fields
    if (!body.workflowId || body.stageNumber === undefined || !body.approverId || !body.action) {
      return errorResponse(
        400,
        'MISSING_FIELDS',
        'workflowId, stageNumber, approverId, and action are required',
        requestId
      );
    }

    // Validate action value
    if (!VALID_ACTIONS.includes(body.action)) {
      return errorResponse(
        400,
        'INVALID_ACTION',
        `Action must be one of: ${VALID_ACTIONS.join(', ')}`,
        requestId
      );
    }

    // Validate delegation requires delegateToId
    if (body.action === 'delegate' && !body.delegateToId) {
      return errorResponse(
        400,
        'MISSING_DELEGATE',
        'delegateToId is required for delegate action',
        requestId
      );
    }

    const action = body.action!;
    const workflowId = body.workflowId!;
    const stageNumber = body.stageNumber!;
    const approverId = body.approverId!;

    const result = await withDatabase(async (db) => {
      // 1. Get the workflow record
      const workflow = await getWorkflow(db, tenantId, workflowId);
      if (!workflow) {
        return { error: 'WORKFLOW_NOT_FOUND' as const };
      }

      // 2. Validate workflow is in a state that accepts actions
      if (workflow.status !== 'pending' && workflow.status !== 'escalated') {
        return { error: 'WORKFLOW_NOT_ACTIONABLE' as const, status: workflow.status };
      }

      // 3. Validate the stage number matches current stage
      const stages: ApprovalStage[] = JSON.parse(workflow.stagesJson);
      const currentStage = stages.find((s) => s.stageNumber === stageNumber);
      if (!currentStage) {
        return { error: 'INVALID_STAGE' as const };
      }

      if (currentStage.status !== 'pending') {
        return { error: 'STAGE_NOT_PENDING' as const };
      }

      // 4. Get the task token for this stage
      const taskToken = await getTaskToken(db, tenantId, workflowId, stageNumber);
      if (!taskToken) {
        return { error: 'NO_TASK_TOKEN' as const };
      }

      // 5. Send task result to Step Functions
      if (POSITIVE_ACTIONS.includes(action)) {
        await sfnClient.send(
          new SendTaskSuccessCommand({
            taskToken,
            output: JSON.stringify({
              action,
              approverId,
              stageNumber,
              comment: body.comment ?? null,
              timestamp: new Date().toISOString(),
            }),
          })
        );
      } else if (NEGATIVE_ACTIONS.includes(action)) {
        await sfnClient.send(
          new SendTaskFailureCommand({
            taskToken,
            error: 'REJECTED',
            cause: JSON.stringify({
              action,
              approverId,
              stageNumber,
              comment: body.comment ?? null,
              timestamp: new Date().toISOString(),
            }),
          })
        );
      } else if (ROUTING_ACTIONS.includes(action)) {
        // For escalate/delegate/request_info, send task success with routing info
        await sfnClient.send(
          new SendTaskSuccessCommand({
            taskToken,
            output: JSON.stringify({
              action,
              approverId,
              stageNumber,
              delegateToId: body.delegateToId ?? null,
              comment: body.comment ?? null,
              timestamp: new Date().toISOString(),
            }),
          })
        );
      }

      // 6. Record the action in the database
      const actionId = randomUUID();
      await recordAction(db, tenantId, {
        actionId,
        workflowId,
        stageNumber,
        approverId,
        action,
        comment: body.comment,
        taskToken,
      });

      // 7. Update workflow status based on action
      let newStatus: string = workflow.status;
      const updatedStages = stages.map((s) => {
        if (s.stageNumber === stageNumber) {
          return {
            ...s,
            status: action === 'approve' ? 'approved' as const : 
                   action === 'reject' ? 'rejected' as const : s.status,
            approvers: [
              ...s.approvers,
              {
                approverId,
                approverName: approverId,
                role: 'approver',
                assignedAt: new Date().toISOString(),
                respondedAt: new Date().toISOString(),
                action,
                comment: body.comment,
              },
            ],
          };
        }
        return s;
      });

      if (action === 'reject') {
        newStatus = 'rejected';
      } else if (action === 'approve') {
        // Check if this was the last stage
        const isLastStage = stageNumber === Math.max(...stages.map((s) => s.stageNumber));
        if (isLastStage) {
          newStatus = 'approved';
        }
      } else if (action === 'escalate') {
        newStatus = 'escalated';
      }

      const updatedWorkflow = await updateWorkflowStatus(
        db,
        tenantId,
        workflowId,
        newStatus as import('@travel-policy/shared').ApprovalWorkflowStatus,
        action === 'approve' && newStatus === 'pending'
          ? stageNumber + 1
          : undefined,
        JSON.stringify(updatedStages)
      );

      return { workflow: updatedWorkflow };
    });

    // Handle errors from the database transaction
    if ('error' in result) {
      switch (result.error) {
        case 'WORKFLOW_NOT_FOUND':
          return errorResponse(404, 'WORKFLOW_NOT_FOUND', 'Workflow not found', requestId);
        case 'WORKFLOW_NOT_ACTIONABLE':
          return errorResponse(
            409,
            'WORKFLOW_NOT_ACTIONABLE',
            `Workflow is in '${(result as { status: string }).status}' state and cannot accept actions`,
            requestId
          );
        case 'INVALID_STAGE':
          return errorResponse(400, 'INVALID_STAGE', 'Stage number is invalid', requestId);
        case 'STAGE_NOT_PENDING':
          return errorResponse(409, 'STAGE_NOT_PENDING', 'Stage is not in pending state', requestId);
        case 'NO_TASK_TOKEN':
          return errorResponse(
            409,
            'NO_TASK_TOKEN',
            'No active task token for this workflow stage',
            requestId
          );
        default:
          return errorResponse(500, 'UNKNOWN_ERROR', 'An unexpected error occurred', requestId);
      }
    }

    const { workflow: updatedWorkflow } = result as { workflow: Awaited<ReturnType<typeof updateWorkflowStatus>> };

    // 8. Publish ApprovalActionTaken event
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.approval-workflow',
              DetailType: 'ApprovalActionTaken',
              Detail: JSON.stringify({
                workflowId,
                tenantId,
                stageNumber,
                approverId,
                action,
                comment: body.comment ?? null,
                requestId,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );
    } catch (eventError) {
      console.error('Failed to publish ApprovalActionTaken event:', eventError);
    }

    if (!updatedWorkflow) {
      return errorResponse(500, 'UPDATE_FAILED', 'Failed to update workflow', requestId);
    }

    return successResponse(200, toApprovalWorkflow(updatedWorkflow), requestId);
  } catch (error) {
    console.error('Submit action failed:', error);
    return errorResponse(
      500,
      'ACTION_SUBMISSION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
