/**
 * Single-Stage Approval Workflow State Machine
 *
 * A simple single-approver workflow that:
 * - Waits for a callback token (human approval)
 * - Times out after a configurable SLA (default 24h)
 * - On timeout → escalates to next approver
 *
 * Validates: Requirements 8.1, 8.2, 8.4
 */

export interface SingleStageParams {
  /** SLA timeout in seconds (default: 86400 = 24 hours) */
  slaTimeoutSeconds?: number;
  /** Lambda ARN for sending approval notifications */
  notifyApproverLambdaArn: string;
  /** Lambda ARN for handling escalation */
  escalationLambdaArn: string;
  /** Lambda ARN for recording workflow completion */
  completeWorkflowLambdaArn: string;
}

/**
 * Generates the ASL (Amazon States Language) definition for a single-stage
 * approval workflow using the callback token pattern.
 */
export function generateSingleStageDefinition(params: SingleStageParams): object {
  const {
    slaTimeoutSeconds = 86400,
    notifyApproverLambdaArn,
    escalationLambdaArn,
    completeWorkflowLambdaArn,
  } = params;

  return {
    Comment: 'Single-stage approval workflow with callback token pattern and SLA escalation',
    StartAt: 'NotifyApprover',
    States: {
      NotifyApprover: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke.waitForTaskToken',
        Parameters: {
          FunctionName: notifyApproverLambdaArn,
          'Payload': {
            'taskToken.$': '$$.Task.Token',
            'workflowId.$': '$.workflowId',
            'stageNumber': 1,
            'approverId.$': '$.stages[0].approverId',
            'approverEmail.$': '$.stages[0].approverEmail',
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
            Next: 'EscalateApproval',
            ResultPath: '$.error',
          },
          {
            ErrorEquals: ['States.TaskFailed'],
            Next: 'WorkflowRejected',
            ResultPath: '$.error',
          },
        ],
        Next: 'EvaluateDecision',
      },

      EvaluateDecision: {
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

      EscalateApproval: {
        Type: 'Task',
        Resource: 'arn:aws:states:::lambda:invoke',
        Parameters: {
          FunctionName: escalationLambdaArn,
          Payload: {
            'workflowId.$': '$.workflowId',
            'stageNumber': 1,
            'tenantId.$': '$.tenantId',
            'originalApproverId.$': '$.stages[0].approverId',
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

      WorkflowApproved: {
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
