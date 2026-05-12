/**
 * Approval Workflow State Machine Definitions
 *
 * Barrel export and factory function for selecting state machine definitions
 * by workflow template type.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

import { generateSingleStageDefinition } from './single-stage.js';
import { generateMultiStageSequentialDefinition } from './multi-stage-sequential.js';
import { generateMultiStageParallelDefinition } from './multi-stage-parallel.js';
import { generateConditionalDefinition } from './conditional.js';

export { generateSingleStageDefinition, type SingleStageParams } from './single-stage.js';
export {
  generateMultiStageSequentialDefinition,
  type MultiStageSequentialParams,
  type SequentialStageConfig,
} from './multi-stage-sequential.js';
export {
  generateMultiStageParallelDefinition,
  type MultiStageParallelParams,
} from './multi-stage-parallel.js';
export {
  generateConditionalDefinition,
  type ConditionalWorkflowParams,
  type ConditionalBranchConfig,
} from './conditional.js';

/**
 * Supported workflow template types.
 */
export type WorkflowTemplateType =
  | 'single-stage'
  | 'multi-stage-sequential'
  | 'multi-stage-parallel'
  | 'conditional';

/**
 * Common Lambda ARN configuration shared across all workflow types.
 */
export interface WorkflowLambdaConfig {
  notifyApproverLambdaArn: string;
  notifyApproversLambdaArn?: string;
  evaluateQuorumLambdaArn?: string;
  escalationLambdaArn: string;
  completeWorkflowLambdaArn: string;
}

/**
 * Parameters for the factory function.
 */
export interface CreateStateMachineParams {
  templateType: WorkflowTemplateType;
  lambdaConfig: WorkflowLambdaConfig;
  /** SLA timeout in seconds (default: 86400 = 24h) */
  slaTimeoutSeconds?: number;
  /** Number of sequential stages (for multi-stage-sequential) */
  stageCount?: number;
  /** Per-stage SLA configs (for multi-stage-sequential) */
  stageConfigs?: Array<{ stageNumber: number; slaTimeoutSeconds: number }>;
  /** Number of parallel approvers (for multi-stage-parallel) */
  approverCount?: number;
  /** Required approvals for quorum (for multi-stage-parallel) */
  requiredApprovals?: number;
  /** Branch configurations (for conditional) */
  branches?: Array<{
    name: string;
    conditionVariable: string;
    operator: 'NumericGreaterThan' | 'NumericLessThanEquals' | 'StringEquals' | 'BooleanEquals';
    value: number | string | boolean;
    slaTimeoutSeconds?: number;
  }>;
  /** Default branch name (for conditional) */
  defaultBranch?: string;
}

/**
 * Factory function that generates the appropriate state machine ASL definition
 * based on the workflow template type.
 */
export function createStateMachineDefinition(params: CreateStateMachineParams): object {
  const { templateType, lambdaConfig, slaTimeoutSeconds = 86400 } = params;

  switch (templateType) {
    case 'single-stage': {
      return generateSingleStageDefinition({
        slaTimeoutSeconds,
        notifyApproverLambdaArn: lambdaConfig.notifyApproverLambdaArn,
        escalationLambdaArn: lambdaConfig.escalationLambdaArn,
        completeWorkflowLambdaArn: lambdaConfig.completeWorkflowLambdaArn,
      });
    }

    case 'multi-stage-sequential': {
      const stageCount = params.stageCount || 2;
      const stages = params.stageConfigs || Array.from({ length: stageCount }, (_, i) => ({
        stageNumber: i + 1,
        slaTimeoutSeconds,
      }));

      return generateMultiStageSequentialDefinition({
        stages,
        defaultSlaTimeoutSeconds: slaTimeoutSeconds,
        notifyApproverLambdaArn: lambdaConfig.notifyApproverLambdaArn,
        escalationLambdaArn: lambdaConfig.escalationLambdaArn,
        completeWorkflowLambdaArn: lambdaConfig.completeWorkflowLambdaArn,
      });
    }

    case 'multi-stage-parallel': {
      const approverCount = params.approverCount || 3;
      const requiredApprovals = params.requiredApprovals || 2;

      if (!lambdaConfig.notifyApproversLambdaArn) {
        throw new Error('notifyApproversLambdaArn is required for multi-stage-parallel workflows');
      }
      if (!lambdaConfig.evaluateQuorumLambdaArn) {
        throw new Error('evaluateQuorumLambdaArn is required for multi-stage-parallel workflows');
      }

      return generateMultiStageParallelDefinition({
        approverCount,
        requiredApprovals,
        slaTimeoutSeconds,
        notifyApproversLambdaArn: lambdaConfig.notifyApproversLambdaArn,
        evaluateQuorumLambdaArn: lambdaConfig.evaluateQuorumLambdaArn,
        escalationLambdaArn: lambdaConfig.escalationLambdaArn,
        completeWorkflowLambdaArn: lambdaConfig.completeWorkflowLambdaArn,
      });
    }

    case 'conditional': {
      if (!params.branches || params.branches.length === 0) {
        throw new Error('branches configuration is required for conditional workflows');
      }
      if (!params.defaultBranch) {
        throw new Error('defaultBranch is required for conditional workflows');
      }

      return generateConditionalDefinition({
        branches: params.branches,
        defaultBranch: params.defaultBranch,
        defaultSlaTimeoutSeconds: slaTimeoutSeconds,
        notifyApproverLambdaArn: lambdaConfig.notifyApproverLambdaArn,
        escalationLambdaArn: lambdaConfig.escalationLambdaArn,
        completeWorkflowLambdaArn: lambdaConfig.completeWorkflowLambdaArn,
      });
    }

    default:
      throw new Error(`Unsupported workflow template type: ${templateType}`);
  }
}
