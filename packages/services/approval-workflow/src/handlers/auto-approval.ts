/**
 * Lambda handler: Auto-approval evaluation.
 * Invoked when a new workflow is initiated to check if the trip
 * meets auto-approval conditions from the template.
 *
 * If all conditions are met, immediately completes the workflow as approved.
 * If not, proceeds with normal approval flow.
 *
 * Requirements: 8.5
 */
import type { Context } from 'aws-lambda';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

import { withDatabase } from '../lib/database.js';
import {
  getWorkflow,
  getWorkflowTemplate,
  updateWorkflowStatus,
  getTaskToken,
} from '../lib/workflow-repository.js';
import type { AutoApprovalCondition } from '@travel-policy/shared';

const sfnClient = new SFNClient({});
const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

/**
 * Input from Step Functions or EventBridge trigger.
 */
export interface AutoApprovalInput {
  workflowId: string;
  tenantId: string;
  tripRequestId: string;
  travellerId: string;
  /** Trip context data for evaluating conditions */
  tripContext: Record<string, unknown>;
  /** Task token if invoked as a callback from Step Functions */
  taskToken?: string;
  templateId?: string;
}

/**
 * Output returned to Step Functions.
 */
export interface AutoApprovalOutput {
  autoApproved: boolean;
  reason: string;
  conditionsEvaluated: number;
  conditionsMet: number;
}

export async function handler(
  event: AutoApprovalInput,
  _context: Context
): Promise<AutoApprovalOutput> {
  const { workflowId, tenantId, tripContext } = event;

  console.info('Auto-approval evaluation started', {
    workflowId,
    tenantId,
    tripRequestId: event.tripRequestId,
  });

  try {
    const result = await withDatabase(async (db) => {
      // 1. Get the workflow record
      const workflow = await getWorkflow(db, tenantId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // 2. Get the workflow template
      const template = await getWorkflowTemplate(
        db,
        tenantId,
        event.templateId ?? workflow.workflowTemplateId
      );
      if (!template) {
        throw new Error(`Template ${workflow.workflowTemplateId} not found`);
      }

      // 3. Check if auto-approval conditions are configured
      const conditions = template.autoApprovalConditions;
      if (!conditions || conditions.length === 0) {
        return {
          autoApproved: false,
          reason: 'No auto-approval conditions configured',
          conditionsEvaluated: 0,
          conditionsMet: 0,
        };
      }

      // 4. Evaluate all auto-approval conditions
      const evaluationResults = conditions.map((condition) =>
        evaluateCondition(condition, tripContext)
      );

      const conditionsMet = evaluationResults.filter((r) => r).length;
      const allConditionsMet = evaluationResults.every((r) => r);

      if (!allConditionsMet) {
        return {
          autoApproved: false,
          reason: `Only ${conditionsMet}/${conditions.length} conditions met`,
          conditionsEvaluated: conditions.length,
          conditionsMet,
        };
      }

      // 5. All conditions met — auto-approve the workflow
      await updateWorkflowStatus(db, tenantId, workflowId, 'approved');

      // 6. If there's a task token, send success to Step Functions
      const taskToken = event.taskToken ?? await getTaskToken(db, tenantId, workflowId, 1);
      if (taskToken) {
        try {
          await sfnClient.send(
            new SendTaskSuccessCommand({
              taskToken,
              output: JSON.stringify({
                action: 'auto_approve',
                approverId: 'system',
                reason: 'All auto-approval conditions met',
                conditionsEvaluated: conditions.length,
                conditionsMet,
                timestamp: new Date().toISOString(),
              }),
            })
          );
        } catch (sfnError) {
          // Task token may have expired or been consumed already
          console.warn('Failed to send task success for auto-approval:', sfnError);
        }
      }

      return {
        autoApproved: true,
        reason: 'All auto-approval conditions met',
        conditionsEvaluated: conditions.length,
        conditionsMet,
      };
    });

    // 7. Publish event if auto-approved
    if (result.autoApproved) {
      try {
        await eventBridgeClient.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: 'travel-policy-platform.approval-workflow',
                DetailType: 'ApprovalAutoApproved',
                Detail: JSON.stringify({
                  workflowId,
                  tenantId,
                  tripRequestId: event.tripRequestId,
                  travellerId: event.travellerId,
                  conditionsEvaluated: result.conditionsEvaluated,
                  conditionsMet: result.conditionsMet,
                  timestamp: new Date().toISOString(),
                }),
                EventBusName: EVENT_BUS_NAME,
              },
            ],
          })
        );
      } catch (eventError) {
        console.error('Failed to publish ApprovalAutoApproved event:', eventError);
      }
    }

    return result;
  } catch (error) {
    console.error('Auto-approval evaluation failed:', error);
    throw error;
  }
}

/**
 * Evaluate a single auto-approval condition against the trip context.
 */
function evaluateCondition(
  condition: AutoApprovalCondition,
  tripContext: Record<string, unknown>
): boolean {
  const { field, operator, value } = condition;

  // Resolve the field value from trip context (supports dot notation)
  const fieldValue = resolveFieldValue(field, tripContext);

  if (fieldValue === undefined) {
    // Field not present in context — condition not met
    return false;
  }

  switch (operator) {
    case 'equals':
    case 'eq':
      return fieldValue === value;

    case 'not_equals':
    case 'neq':
      return fieldValue !== value;

    case 'less_than':
    case 'lt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue < value;

    case 'less_than_or_equal':
    case 'lte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue <= value;

    case 'greater_than':
    case 'gt':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue > value;

    case 'greater_than_or_equal':
    case 'gte':
      return typeof fieldValue === 'number' && typeof value === 'number' && fieldValue >= value;

    case 'in':
      return Array.isArray(value) && value.includes(fieldValue);

    case 'not_in':
      return Array.isArray(value) && !value.includes(fieldValue);

    case 'contains':
      return typeof fieldValue === 'string' && typeof value === 'string' && fieldValue.includes(value);

    case 'matches':
      if (typeof fieldValue === 'string' && typeof value === 'string') {
        try {
          return new RegExp(value).test(fieldValue);
        } catch {
          return false;
        }
      }
      return false;

    default:
      console.warn(`Unknown operator: ${operator}`);
      return false;
  }
}

/**
 * Resolve a dot-notation field path from a nested object.
 */
function resolveFieldValue(
  fieldPath: string,
  context: Record<string, unknown>
): unknown {
  const parts = fieldPath.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}
