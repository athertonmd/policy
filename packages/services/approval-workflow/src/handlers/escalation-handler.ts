/**
 * Lambda handler: Escalation handler invoked by Step Functions on SLA timeout.
 *
 * Detects SLA breach, looks up the escalation chain from the workflow template,
 * assigns the request to the next approver, and publishes an ApprovalEscalated event.
 *
 * Requirements: 8.4
 */
import type { Context } from 'aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';

import { withDatabase } from '../lib/database.js';
import {
  getWorkflow,
  getWorkflowTemplate,
  updateWorkflowStatus,
} from '../lib/workflow-repository.js';

const eventBridgeClient = new EventBridgeClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

/**
 * Input from Step Functions when SLA timeout triggers escalation.
 */
export interface EscalationInput {
  workflowId: string;
  stageNumber: number;
  tenantId: string;
  originalApproverId: string;
  escalationReason: string;
  templateId?: string;
}

/**
 * Output returned to Step Functions to continue the workflow.
 */
export interface EscalationOutput {
  escalated: boolean;
  escalationTarget: string | null;
  escalationLevel: number;
  reason: string;
  notifyTenantAdmin: boolean;
}

export async function handler(
  event: EscalationInput,
  _context: Context
): Promise<EscalationOutput> {
  const { workflowId, stageNumber, tenantId, originalApproverId, escalationReason } = event;

  console.info('Escalation triggered', {
    workflowId,
    stageNumber,
    tenantId,
    originalApproverId,
    escalationReason,
  });

  try {
    const result = await withDatabase(async (db) => {
      // 1. Get the workflow record
      const workflow = await getWorkflow(db, tenantId, workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      // 2. Get the workflow template for escalation rules
      const template = await getWorkflowTemplate(
        db,
        tenantId,
        event.templateId ?? workflow.workflowTemplateId
      );
      if (!template) {
        throw new Error(`Template ${workflow.workflowTemplateId} not found`);
      }

      // 3. Determine escalation target from the escalation chain
      const escalationRules = template.escalationRules;
      const maxEscalations = template.slaConfig.maxEscalations;

      // Parse current stages to determine escalation level
      const stages = JSON.parse(workflow.stagesJson) as Array<{
        stageNumber: number;
        approvers: Array<{ approverId: string; action?: string }>;
        escalationTarget?: string;
        escalationLevel?: number;
      }>;

      const currentStage = stages.find((s) => s.stageNumber === stageNumber);
      const currentEscalationLevel = currentStage?.escalationLevel ?? 0;
      const nextEscalationLevel = currentEscalationLevel + 1;

      // Check if we've exceeded max escalations
      if (nextEscalationLevel > maxEscalations) {
        // All approvers in escalation chain are unavailable
        // Notify tenant admin and hold in pending state (Requirement 8.7)
        await updateWorkflowStatus(db, tenantId, workflowId, 'escalated');

        return {
          escalated: false,
          escalationTarget: null,
          escalationLevel: nextEscalationLevel,
          reason: 'Max escalations reached — notifying tenant admin',
          notifyTenantAdmin: true,
        };
      }

      // 4. Find the appropriate escalation rule
      const applicableRule = escalationRules.find(
        (_rule, index) => index === currentEscalationLevel
      );

      let escalationTarget: string;
      if (applicableRule) {
        // Resolve the escalation target based on rule type
        escalationTarget = resolveEscalationTarget(applicableRule.escalateTo);
      } else {
        // Fallback: use the last rule's target or a generic escalation
        const lastRule = escalationRules[escalationRules.length - 1];
        escalationTarget = lastRule
          ? resolveEscalationTarget(lastRule.escalateTo)
          : 'tenant-admin';
      }

      // 5. Update the workflow stages with escalation info
      const updatedStages = stages.map((s) => {
        if (s.stageNumber === stageNumber) {
          return {
            ...s,
            escalationTarget,
            escalationLevel: nextEscalationLevel,
          };
        }
        return s;
      });

      await updateWorkflowStatus(
        db,
        tenantId,
        workflowId,
        'escalated',
        undefined,
        JSON.stringify(updatedStages)
      );

      return {
        escalated: true,
        escalationTarget,
        escalationLevel: nextEscalationLevel,
        reason: escalationReason,
        notifyTenantAdmin: false,
      };
    });

    // 6. Publish ApprovalEscalated event
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: [
            {
              Source: 'travel-policy-platform.approval-workflow',
              DetailType: 'ApprovalEscalated',
              Detail: JSON.stringify({
                workflowId,
                tenantId,
                stageNumber,
                originalApproverId,
                escalationTarget: result.escalationTarget,
                escalationLevel: result.escalationLevel,
                reason: result.reason,
                notifyTenantAdmin: result.notifyTenantAdmin,
                timestamp: new Date().toISOString(),
              }),
              EventBusName: EVENT_BUS_NAME,
            },
          ],
        })
      );
    } catch (eventError) {
      console.error('Failed to publish ApprovalEscalated event:', eventError);
    }

    return result;
  } catch (error) {
    console.error('Escalation handler failed:', error);
    throw error;
  }
}

/**
 * Resolve the escalation target identifier from an approver rule.
 */
function resolveEscalationTarget(rule: { type: string; value: string }): string {
  switch (rule.type) {
    case 'role':
      return `role:${rule.value}`;
    case 'specific_user':
      return `user:${rule.value}`;
    case 'manager':
      return `manager:${rule.value}`;
    case 'cost_centre_owner':
      return `cost_centre_owner:${rule.value}`;
    default:
      return rule.value;
  }
}
