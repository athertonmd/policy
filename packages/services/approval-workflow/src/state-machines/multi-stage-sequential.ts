/**
 * Multi-Stage Sequential Approval Workflow State Machine
 *
 * Multiple approval stages executed in sequence:
 * - Each stage waits for callback token (human approval)
 * - If any stage rejects → workflow completes with rejection
 * - If all stages approve → workflow completes with approval
 * - Each stage has its own SLA timeout with escalation
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

export interface SequentialStageConfig {
  /** Stage number (1-based) */
  stageNumber: number;
  /** SLA timeout in seconds for this stage */
  slaTimeoutSeconds: number;
}

export interface MultiStageSequentialParams {
  /** Stage configurations (order matters) */
  stages: SequentialStageConfig[];
  /** Default SLA timeout in seconds if not specified per stage (default: 86400 = 24h) */
  defaultSlaTimeoutSeconds?: number;
  /** Lambda ARN for sending approval notifications */
  notifyApproverLambdaArn: string;
  /** Lambda ARN for handling escalation */
  escalationLambdaArn: string;
  /** Lambda ARN for recording workflow completion */
  completeWorkflowLambdaArn: string;
}

/**
 * Generates a single approval stage state group for the sequential workflow.
 */
function generateStageStates(
  stageNumber: number,
  slaTimeoutSeconds: number,
  notifyApproverLambdaArn: string,
  escalationLambdaArn: string,
  nextStateName: string,
): Record<string, object> {
  const stagePrefix = `Stage${stageNumber}`;

  return {
    [`${stagePrefix}_NotifyApprover`]: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
      Parameters: {
        FunctionName: notifyApproverLambdaArn,
        Payload: {
          'taskToken.$': '$$.Task.Token',
          'workflowId.$': '$.workflowId',
          'stageNumber': stageNumber,
          'approverId.$': `$.stages[${stageNumber - 1}].approverId`,
          'approverEmail.$': `$.stages[${stageNumber - 1}].approverEmail`,
          'tripSummary.$': '$.tripSummary',
          'tenantId.$': '$.tenantId',
          'priority.$': '$.priority',
        },
      },
      TimeoutSeconds: slaTimeoutSeconds,
      ResultPath: `$.stageResults.stage${stageNumber}`,
      Retry: [
        {
          ErrorEquals: ['Lambda.ServiceException', 'Lambda.AWSLambdaException'],
          IntervalSeconds: 2,
          MaxAttempts: 3,
          BackoffRate: 2.0,
        },
      ],
      Catch: [
        {
          ErrorEquals: ['States.Timeout'],
          Next: `${stagePrefix}_Escalate`,
          ResultPath: '$.error',
        },
        {
          ErrorEquals: ['States.TaskFailed'],
          Next: 'WorkflowRejected',
          ResultPath: '$.error',
        },
      ],
      Next: `${stagePrefix}_EvaluateDecision`,
    },

    [`${stagePrefix}_EvaluateDecision`]: {
      Type: 'Choice',
      Choices: [
        {
          Variable: `$.stageResults.stage${stageNumber}.action`,
          StringEquals: 'approve',
          Next: nextStateName,
        },
        {
          Variable: `$.stageResults.stage${stageNumber}.action`,
          StringEquals: 'reject',
          Next: 'WorkflowRejected',
        },
      ],
      Default: 'WorkflowRejected',
    },

    [`${stagePrefix}_Escalate`]: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: escalationLambdaArn,
        Payload: {
          'workflowId.$': '$.workflowId',
          'stageNumber': stageNumber,
          'tenantId.$': '$.tenantId',
          'originalApproverId.$': `$.stages[${stageNumber - 1}].approverId`,
          'escalationReason': 'SLA_TIMEOUT',
          'tripSummary.$': '$.tripSummary',
        },
      },
      ResultPath: '$.escalationResult',
      Retry: [
        {
          ErrorEquals: ['Lambda.ServiceException', 'Lambda.AWSLambdaException'],
          IntervalSeconds: 2,
          MaxAttempts: 3,
          BackoffRate: 2.0,
        },
      ],
      Next: 'WorkflowEscalated',
    },
  };
}

/**
 * Generates the ASL definition for a multi-stage sequential approval workflow.
 */
export function generateMultiStageSequentialDefinition(params: MultiStageSequentialParams): object {
  const {
    stages,
    defaultSlaTimeoutSeconds = 86400,
    notifyApproverLambdaArn,
    escalationLambdaArn,
    completeWorkflowLambdaArn,
  } = params;

  if (stages.length === 0) {
    throw new Error('At least one stage is required for a sequential workflow');
  }

  // Build states for each stage
  let allStates: Record<string, object> = {};

  // Initialize stageResults in the first state
  const initState: Record<string, object> = {
    InitializeResults: {
      Type: 'Pass',
      Result: {},
      ResultPath: '$.stageResults',
      Next: 'Stage1_NotifyApprover',
    },
  };
  allStates = { ...initState };

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const slaTimeout = stage.slaTimeoutSeconds || defaultSlaTimeoutSeconds;
    const isLastStage = i === stages.length - 1;
    const nextState = isLastStage ? 'WorkflowApproved' : `Stage${stages[i + 1].stageNumber}_NotifyApprover`;

    const stageStates = generateStageStates(
      stage.stageNumber,
      slaTimeout,
      notifyApproverLambdaArn,
      escalationLambdaArn,
      nextState,
    );

    allStates = { ...allStates, ...stageStates };
  }

  // Add terminal states
  allStates['WorkflowApproved'] = {
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Parameters: {
      FunctionName: completeWorkflowLambdaArn,
      Payload: {
        'workflowId.$': '$.workflowId',
        'tenantId.$': '$.tenantId',
        'status': 'approved',
        'stageResults.$': '$.stageResults',
      },
    },
    ResultPath: '$.completionResult',
    End: true,
  };

  allStates['WorkflowRejected'] = {
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Parameters: {
      FunctionName: completeWorkflowLambdaArn,
      Payload: {
        'workflowId.$': '$.workflowId',
        'tenantId.$': '$.tenantId',
        'status': 'rejected',
        'stageResults.$': '$.stageResults',
        'error.$': '$.error',
      },
    },
    ResultPath: '$.completionResult',
    End: true,
  };

  allStates['WorkflowEscalated'] = {
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Parameters: {
      FunctionName: completeWorkflowLambdaArn,
      Payload: {
        'workflowId.$': '$.workflowId',
        'tenantId.$': '$.tenantId',
        'status': 'escalated',
        'escalationResult.$': '$.escalationResult',
      },
    },
    ResultPath: '$.completionResult',
    End: true,
  };

  return {
    Comment: 'Multi-stage sequential approval workflow with per-stage SLA and escalation',
    StartAt: 'InitializeResults',
    States: allStates,
  };
}
