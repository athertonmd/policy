/**
 * Multi-Stage Parallel Approval Workflow State Machine
 *
 * Multiple approvers notified simultaneously (quorum-based):
 * - All approvers notified at the same time
 * - Configurable quorum (e.g., 2 of 3 must approve)
 * - If quorum reached → proceed with approval
 * - If any rejects → workflow completes with rejection
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4
 */

export interface MultiStageParallelParams {
  /** Number of parallel approvers */
  approverCount: number;
  /** Number of approvals required (quorum) */
  requiredApprovals: number;
  /** SLA timeout in seconds (default: 86400 = 24h) */
  slaTimeoutSeconds?: number;
  /** Lambda ARN for sending approval notifications to all approvers */
  notifyApproversLambdaArn: string;
  /** Lambda ARN for evaluating quorum after each response */
  evaluateQuorumLambdaArn: string;
  /** Lambda ARN for handling escalation */
  escalationLambdaArn: string;
  /** Lambda ARN for recording workflow completion */
  completeWorkflowLambdaArn: string;
}

/**
 * Generates the ASL definition for a multi-stage parallel (quorum-based) approval workflow.
 *
 * The parallel pattern uses a Map state to fan out notifications to all approvers,
 * then evaluates whether the quorum has been met.
 */
export function generateMultiStageParallelDefinition(params: MultiStageParallelParams): object {
  const {
    approverCount,
    requiredApprovals,
    slaTimeoutSeconds = 86400,
    notifyApproversLambdaArn,
    evaluateQuorumLambdaArn,
    escalationLambdaArn,
    completeWorkflowLambdaArn,
  } = params;

  if (requiredApprovals > approverCount) {
    throw new Error('requiredApprovals cannot exceed approverCount');
  }

  if (requiredApprovals < 1) {
    throw new Error('requiredApprovals must be at least 1');
  }

  return {
    Comment: `Parallel approval workflow requiring ${requiredApprovals} of ${approverCount} approvals (quorum)`,
    StartAt: 'NotifyAllApprovers',
    States: {
      NotifyAllApprovers: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
        Parameters: {
          FunctionName: notifyApproversLambdaArn,
          Payload: {
            'taskToken.$': '$$.Task.Token',
            'workflowId.$': '$.workflowId',
            'stageNumber': 1,
            'approvers.$': '$.stages[0].approvers',
            'requiredApprovals': requiredApprovals,
            'approverCount': approverCount,
            'tripSummary.$': '$.tripSummary',
            'tenantId.$': '$.tenantId',
            'priority.$': '$.priority',
          },
        },
        TimeoutSeconds: slaTimeoutSeconds,
        ResultPath: '$.parallelResult',
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
            Next: 'EscalateApproval',
            ResultPath: '$.error',
          },
          {
            ErrorEquals: ['States.TaskFailed'],
            Next: 'WorkflowRejected',
            ResultPath: '$.error',
          },
        ],
        Next: 'EvaluateQuorum',
      },

      EvaluateQuorum: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: evaluateQuorumLambdaArn,
          Payload: {
            'workflowId.$': '$.workflowId',
            'parallelResult.$': '$.parallelResult',
            'requiredApprovals': requiredApprovals,
            'approverCount': approverCount,
          },
        },
        ResultPath: '$.quorumResult',
        Retry: [
          {
            ErrorEquals: ['Lambda.ServiceException', 'Lambda.AWSLambdaException'],
            IntervalSeconds: 2,
            MaxAttempts: 3,
            BackoffRate: 2.0,
          },
        ],
        Next: 'CheckQuorumOutcome',
      },

      CheckQuorumOutcome: {
        Type: 'Choice',
        Choices: [
          {
            Variable: '$.quorumResult.Payload.outcome',
            StringEquals: 'approved',
            Next: 'WorkflowApproved',
          },
          {
            Variable: '$.quorumResult.Payload.outcome',
            StringEquals: 'rejected',
            Next: 'WorkflowRejected',
          },
        ],
        Default: 'WorkflowRejected',
      },

      EscalateApproval: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: escalationLambdaArn,
          Payload: {
            'workflowId.$': '$.workflowId',
            'stageNumber': 1,
            'tenantId.$': '$.tenantId',
            'escalationReason': 'SLA_TIMEOUT',
            'approverCount': approverCount,
            'requiredApprovals': requiredApprovals,
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

      WorkflowApproved: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: completeWorkflowLambdaArn,
          Payload: {
            'workflowId.$': '$.workflowId',
            'tenantId.$': '$.tenantId',
            'status': 'approved',
            'quorumResult.$': '$.quorumResult',
          },
        },
        ResultPath: '$.completionResult',
        End: true,
      },

      WorkflowRejected: {
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
      },

      WorkflowEscalated: {
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
      },
    },
  };
}
