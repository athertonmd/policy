/**
 * Lambda handler: Initiate an approval workflow.
 * POST /v1/approvals/workflows
 *
 * Resolves the workflow template, generates the ASL definition,
 * starts a Step Functions execution, stores the workflow record,
 * and publishes an ApprovalWorkflowInitiated event.
 *
 * Requirements: 8.1, 8.2, 8.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'node:crypto';

import { withDatabase } from '../lib/database.js';
import {
  createWorkflow,
  getWorkflowTemplate,
  toApprovalWorkflow,
} from '../lib/workflow-repository.js';
import {
  createStateMachineDefinition,
  type WorkflowTemplateType,
} from '../state-machines/index.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';

const sfnClient = new SFNClient({});
const eventBridgeClient = new EventBridgeClient({});

const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN ?? '';
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';
const NOTIFY_APPROVER_LAMBDA_ARN = process.env.NOTIFY_APPROVER_LAMBDA_ARN ?? '';
const ESCALATION_LAMBDA_ARN = process.env.ESCALATION_LAMBDA_ARN ?? '';
const COMPLETE_WORKFLOW_LAMBDA_ARN = process.env.COMPLETE_WORKFLOW_LAMBDA_ARN ?? '';

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
      tripRequestId?: string;
      travellerId?: string;
      obligations?: unknown[];
      workflowTemplateId?: string;
      priority?: 'normal' | 'urgent';
    };

    // Validate required fields
    if (!body.decisionId || !body.tripRequestId || !body.travellerId || !body.workflowTemplateId) {
      return errorResponse(
        400,
        'MISSING_FIELDS',
        'decisionId, tripRequestId, travellerId, and workflowTemplateId are required',
        requestId
      );
    }

    const priority = body.priority ?? 'normal';
    const workflowId = randomUUID();

    // Resolve the workflow template and start execution
    const result = await withDatabase(async (db) => {
      // 1. Resolve the workflow template
      const template = await getWorkflowTemplate(db, tenantId, body.workflowTemplateId!);
      if (!template) {
        return { error: 'TEMPLATE_NOT_FOUND' as const };
      }

      // 2. Determine template type from stage definitions
      const templateType = resolveTemplateType(template.stages);

      // 3. Generate ASL definition using the state machine factory
      const slaTimeoutSeconds = priority === 'urgent'
        ? template.slaConfig.urgentSlaHours * 3600
        : template.slaConfig.defaultSlaHours * 3600;

      const _aslDefinition = createStateMachineDefinition({
        templateType,
        lambdaConfig: {
          notifyApproverLambdaArn: NOTIFY_APPROVER_LAMBDA_ARN,
          escalationLambdaArn: ESCALATION_LAMBDA_ARN,
          completeWorkflowLambdaArn: COMPLETE_WORKFLOW_LAMBDA_ARN,
        },
        slaTimeoutSeconds,
        stageCount: template.stages.length,
        stageConfigs: template.stages.map((s) => ({
          stageNumber: s.stageNumber,
          slaTimeoutSeconds: s.slaHours * 3600,
        })),
      });

      // 4. Build initial stages for the workflow record
      const stages = template.stages.map((stageDef) => ({
        stageNumber: stageDef.stageNumber,
        type: stageDef.type,
        approvers: [],
        status: 'pending' as const,
        slaDeadline: new Date(
          Date.now() + stageDef.slaHours * 3600 * 1000
        ).toISOString(),
      }));

      // 5. Start Step Functions execution
      const executionInput = {
        workflowId,
        tenantId,
        decisionId: body.decisionId,
        tripRequestId: body.tripRequestId,
        travellerId: body.travellerId,
        obligations: body.obligations ?? [],
        priority,
        templateId: body.workflowTemplateId,
        stages: template.stages,
        escalationRules: template.escalationRules,
        slaConfig: template.slaConfig,
      };

      const executionResult = await sfnClient.send(
        new StartExecutionCommand({
          stateMachineArn: STATE_MACHINE_ARN,
          name: `workflow-${workflowId}`,
          input: JSON.stringify(executionInput),
        })
      );

      const executionArn = executionResult.executionArn ?? '';

      // 6. Store the workflow record
      const workflowRecord = await createWorkflow(db, tenantId, {
        workflowId,
        decisionId: body.decisionId!,
        tripRequestId: body.tripRequestId!,
        travellerId: body.travellerId!,
        workflowTemplateId: body.workflowTemplateId!,
        priority,
        status: 'pending',
        currentStage: 1,
        stepFunctionExecutionArn: executionArn,
        stages,
      });

      return { workflowRecord, template };
    });

    if ('error' in result) {
      if (result.error === 'TEMPLATE_NOT_FOUND') {
        return errorResponse(
          404,
          'TEMPLATE_NOT_FOUND',
          `Workflow template ${body.workflowTemplateId} not found or inactive`,
          requestId
        );
      }
    }

    const { workflowRecord } = result as { workflowRecord: Awaited<ReturnType<typeof createWorkflow>>; template: unknown };

    // 7. Publish ApprovalWorkflowInitiated event
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.approval-workflow',
              DetailType: 'ApprovalWorkflowInitiated',
              Detail: JSON.stringify({
                workflowId,
                tenantId,
                decisionId: body.decisionId,
                tripRequestId: body.tripRequestId,
                travellerId: body.travellerId,
                priority,
                templateId: body.workflowTemplateId,
                requestId,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );
    } catch (eventError) {
      console.error('Failed to publish ApprovalWorkflowInitiated event:', eventError);
    }

    return successResponse(201, toApprovalWorkflow(workflowRecord), requestId);
  } catch (error) {
    console.error('Initiate workflow failed:', error);
    return errorResponse(
      500,
      'WORKFLOW_INITIATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

/**
 * Determine the workflow template type from stage definitions.
 */
function resolveTemplateType(
  stages: Array<{ type: string; stageNumber: number }>
): WorkflowTemplateType {
  if (stages.length === 1) {
    if (stages[0].type === 'parallel') return 'multi-stage-parallel';
    if (stages[0].type === 'conditional') return 'conditional';
    return 'single-stage';
  }

  // Multiple stages — check if any are parallel or conditional
  const hasParallel = stages.some((s) => s.type === 'parallel');
  if (hasParallel) return 'multi-stage-parallel';

  return 'multi-stage-sequential';
}
