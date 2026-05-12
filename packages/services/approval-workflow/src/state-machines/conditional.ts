/**
 * Conditional Branching Approval Workflow State Machine
 *
 * Routes to different approval paths based on trip attributes:
 * - Choice state evaluates trip attributes (cost, destination type, etc.)
 * - Routes to appropriate approval path (finance, risk, standard)
 * - Each branch uses callback token pattern for human approval
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

export interface ConditionalBranchConfig {
  /** Branch name (e.g., 'finance', 'risk', 'standard') */
  name: string;
  /** Condition variable path in the input (e.g., '$.tripSummary.totalCostNumeric') */
  conditionVariable: string;
  /** Comparison operator */
  operator: 'NumericGreaterThan' | 'NumericLessThanEquals' | 'StringEquals' | 'BooleanEquals';
  /** Comparison value */
  value: number | string | boolean;
  /** SLA timeout in seconds for this branch */
  slaTimeoutSeconds?: number;
}

export interface ConditionalWorkflowParams {
  /** Branch configurations (evaluated in order, first match wins) */
  branches: ConditionalBranchConfig[];
  /** Default branch name if no conditions match */
  defaultBranch: string;
  /** Default SLA timeout in seconds (default: 86400 = 24h) */
  defaultSlaTimeoutSeconds?: number;
  /** Lambda ARN for sending approval notifications */
  notifyApproverLambdaArn: string;
  /** Lambda ARN for handling escalation */
  escalationLambdaArn: string;
  /** Lambda ARN for recording workflow completion */
  completeWorkflowLambdaArn: string;
}

/**
 * Generates approval branch states for a specific branch.
 */
function generateBranchStates(
  branchName: string,
  slaTimeoutSeconds: number,
  notifyApproverLambdaArn: string,
  escalationLambdaArn: string,
): Record<string, object> {
  const prefix = `${branchName}Branch`;

  return {
    [`${prefix}_NotifyApprover`]: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
      Parameters: {
        FunctionName: notifyApproverLambdaArn,
        Payload: {
          'taskToken.$': '$$.Task.Token',
          'workflowId.$': '$.workflowId',
          'branch': branchName,
          'stageNumber': 1,
          'approverId.$': `$.branchApprovers.${branchName}.approverId`,
          'approverEmail.$': `$.branchApprovers.${branchName}.approverEmail`,
          'tripSummary.$': '$.tripSummary',
          'tenantId.$': '$.tenantId',
          'priority.$': '$.priority',
        },
      },
      TimeoutSeconds: slaTimeoutSeconds,
      ResultPath: '$.approvalResult',
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
          Next: `${prefix}_Escalate`,
          ResultPath: '$.error',
        },
        {
          ErrorEquals: ['States.TaskFailed'],
          Next: 'WorkflowRejected',
          ResultPath: '$.error',
        },
      ],
      Next: `${prefix}_EvaluateDecision`,
    },

    [`${prefix}_EvaluateDecision`]: {
      Type: 'Choice',
      Choices: [
        {
          Variable: '$.approvalResult.action',
          StringEquals: 'approve',
          Next: 'WorkflowApproved',
        },
        {
          Variable: '$.approvalResult.action',
          StringEquals: 'reject',
          Next: 'WorkflowRejected',
        },
      ],
      Default: 'WorkflowRejected',
    },

    [`${prefix}_Escalate`]: {
      Type: 'Task',
      Resource: 'arn:aws:states:::lambda:invoke',
      Parameters: {
        FunctionName: escalationLambdaArn,
        Payload: {
          'workflowId.$': '$.workflowId',
          'branch': branchName,
          'stageNumber': 1,
          'tenantId.$': '$.tenantId',
          'originalApproverId.$': `$.branchApprovers.${branchName}.approverId`,
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
 * Generates the ASL definition for a conditional branching approval workflow.
 */
export function generateConditionalDefinition(params: ConditionalWorkflowParams): object {
  const {
    branches,
    defaultBranch,
    defaultSlaTimeoutSeconds = 86400,
    notifyApproverLambdaArn,
    escalationLambdaArn,
    completeWorkflowLambdaArn,
  } = params;

  if (branches.length === 0) {
    throw new Error('At least one branch configuration is required');
  }

  // Build Choice state conditions
  const choices = branches.map((branch) => {
    const condition: Record<string, unknown> = {
      Variable: branch.conditionVariable,
      Next: `${branch.name}Branch_NotifyApprover`,
    };
    condition[branch.operator] = branch.value;
    return condition;
  });

  // Build all branch states
  let allStates: Record<string, object> = {};

  // Route state (Choice)
  allStates['RouteApproval'] = {
    Type: 'Choice',
    Choices: choices,
    Default: `${defaultBranch}Branch_NotifyApprover`,
  };

  // Generate states for each unique branch (including default)
  const allBranchNames = new Set([...branches.map((b) => b.name), defaultBranch]);

  for (const branchName of allBranchNames) {
    const branchConfig = branches.find((b) => b.name === branchName);
    const slaTimeout = branchConfig?.slaTimeoutSeconds || defaultSlaTimeoutSeconds;

    const branchStates = generateBranchStates(
      branchName,
      slaTimeout,
      notifyApproverLambdaArn,
      escalationLambdaArn,
    );

    allStates = { ...allStates, ...branchStates };
  }

  // Terminal states
  allStates['WorkflowApproved'] = {
    Type: 'Task',
    Resource: 'arn:aws:states:::lambda:invoke',
    Parameters: {
      FunctionName: completeWorkflowLambdaArn,
      Payload: {
        'workflowId.$': '$.workflowId',
        'tenantId.$': '$.tenantId',
        'status': 'approved',
        'approvalResult.$': '$.approvalResult',
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
    Comment: 'Conditional branching approval workflow routing based on trip attributes',
    StartAt: 'RouteApproval',
    States: allStates,
  };
}
