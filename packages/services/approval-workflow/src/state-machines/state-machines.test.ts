import { describe, it, expect } from 'vitest';
import { generateSingleStageDefinition } from './single-stage.js';
import { generateMultiStageSequentialDefinition } from './multi-stage-sequential.js';
import { generateMultiStageParallelDefinition } from './multi-stage-parallel.js';
import { generateConditionalDefinition } from './conditional.js';
import { createStateMachineDefinition } from './index.js';

const LAMBDA_ARNS = {
  notifyApproverLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:notify-approver',
  notifyApproversLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:notify-approvers',
  evaluateQuorumLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:evaluate-quorum',
  escalationLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:escalation',
  completeWorkflowLambdaArn: 'arn:aws:lambda:eu-west-1:123456789012:function:complete-workflow',
};

describe('Single-Stage State Machine', () => {
  it('generates valid ASL with required states', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.StartAt).toBe('NotifyApprover');
    expect(definition.States).toBeDefined();
    expect(definition.States.NotifyApprover).toBeDefined();
    expect(definition.States.EvaluateDecision).toBeDefined();
    expect(definition.States.EscalateApproval).toBeDefined();
    expect(definition.States.WorkflowApproved).toBeDefined();
    expect(definition.States.WorkflowRejected).toBeDefined();
    expect(definition.States.WorkflowEscalated).toBeDefined();
  });

  it('uses callback token pattern for human approval', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const notifyState = definition.States.NotifyApprover;
    expect(notifyState.Resource).toBe('arn:aws:states:::lambda:invoke.waitForTaskToken');
    expect(notifyState.Parameters.Payload['taskToken.$']).toBe('$$.Task.Token');
  });

  it('configures default 24h SLA timeout', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.NotifyApprover.TimeoutSeconds).toBe(86400);
  });

  it('allows custom SLA timeout', () => {
    const definition = generateSingleStageDefinition({
      slaTimeoutSeconds: 3600,
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.NotifyApprover.TimeoutSeconds).toBe(3600);
  });

  it('catches timeout and routes to escalation', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const catchConfig = definition.States.NotifyApprover.Catch;
    const timeoutCatch = catchConfig.find((c: any) => c.ErrorEquals.includes('States.Timeout'));
    expect(timeoutCatch).toBeDefined();
    expect(timeoutCatch.Next).toBe('EscalateApproval');
  });

  it('configures retry for Lambda service errors', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const retryConfig = definition.States.NotifyApprover.Retry;
    expect(retryConfig).toBeDefined();
    expect(retryConfig[0].ErrorEquals).toContain('Lambda.ServiceException');
    expect(retryConfig[0].MaxAttempts).toBe(3);
    expect(retryConfig[0].BackoffRate).toBe(2.0);
  });

  it('has terminal states that end the workflow', () => {
    const definition = generateSingleStageDefinition({
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.WorkflowApproved.End).toBe(true);
    expect(definition.States.WorkflowRejected.End).toBe(true);
    expect(definition.States.WorkflowEscalated.End).toBe(true);
  });
});

describe('Multi-Stage Sequential State Machine', () => {
  it('generates states for each stage in sequence', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 43200 },
        { stageNumber: 2, slaTimeoutSeconds: 86400 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.StartAt).toBe('InitializeResults');
    expect(definition.States.Stage1_NotifyApprover).toBeDefined();
    expect(definition.States.Stage1_EvaluateDecision).toBeDefined();
    expect(definition.States.Stage1_Escalate).toBeDefined();
    expect(definition.States.Stage2_NotifyApprover).toBeDefined();
    expect(definition.States.Stage2_EvaluateDecision).toBeDefined();
    expect(definition.States.Stage2_Escalate).toBeDefined();
  });

  it('uses callback token pattern for each stage', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 86400 },
        { stageNumber: 2, slaTimeoutSeconds: 86400 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.Stage1_NotifyApprover.Resource).toBe(
      'arn:aws:states:::lambda:invoke.waitForTaskToken',
    );
    expect(definition.States.Stage2_NotifyApprover.Resource).toBe(
      'arn:aws:states:::lambda:invoke.waitForTaskToken',
    );
  });

  it('chains stages sequentially - stage 1 approval leads to stage 2', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 86400 },
        { stageNumber: 2, slaTimeoutSeconds: 86400 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    // Stage 1 approval should lead to Stage 2
    const stage1Decision = definition.States.Stage1_EvaluateDecision;
    const approveChoice = stage1Decision.Choices.find(
      (c: any) => c.StringEquals === 'approve',
    );
    expect(approveChoice.Next).toBe('Stage2_NotifyApprover');
  });

  it('last stage approval leads to WorkflowApproved', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 86400 },
        { stageNumber: 2, slaTimeoutSeconds: 86400 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const stage2Decision = definition.States.Stage2_EvaluateDecision;
    const approveChoice = stage2Decision.Choices.find(
      (c: any) => c.StringEquals === 'approve',
    );
    expect(approveChoice.Next).toBe('WorkflowApproved');
  });

  it('any stage rejection leads to WorkflowRejected', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 86400 },
        { stageNumber: 2, slaTimeoutSeconds: 86400 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const stage1Decision = definition.States.Stage1_EvaluateDecision;
    const rejectChoice = stage1Decision.Choices.find(
      (c: any) => c.StringEquals === 'reject',
    );
    expect(rejectChoice.Next).toBe('WorkflowRejected');
  });

  it('each stage has its own SLA timeout', () => {
    const definition = generateMultiStageSequentialDefinition({
      stages: [
        { stageNumber: 1, slaTimeoutSeconds: 3600 },
        { stageNumber: 2, slaTimeoutSeconds: 7200 },
      ],
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.Stage1_NotifyApprover.TimeoutSeconds).toBe(3600);
    expect(definition.States.Stage2_NotifyApprover.TimeoutSeconds).toBe(7200);
  });

  it('throws error when no stages provided', () => {
    expect(() =>
      generateMultiStageSequentialDefinition({
        stages: [],
        notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
        escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
        completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
      }),
    ).toThrow('At least one stage is required');
  });
});

describe('Multi-Stage Parallel State Machine', () => {
  it('generates valid ASL with quorum evaluation', () => {
    const definition = generateMultiStageParallelDefinition({
      approverCount: 3,
      requiredApprovals: 2,
      notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
      evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.StartAt).toBe('NotifyAllApprovers');
    expect(definition.States.NotifyAllApprovers).toBeDefined();
    expect(definition.States.EvaluateQuorum).toBeDefined();
    expect(definition.States.CheckQuorumOutcome).toBeDefined();
  });

  it('uses callback token pattern for parallel notification', () => {
    const definition = generateMultiStageParallelDefinition({
      approverCount: 3,
      requiredApprovals: 2,
      notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
      evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.NotifyAllApprovers.Resource).toBe(
      'arn:aws:states:::lambda:invoke.waitForTaskToken',
    );
    expect(definition.States.NotifyAllApprovers.Parameters.Payload['taskToken.$']).toBe(
      '$$.Task.Token',
    );
  });

  it('includes quorum parameters in notification payload', () => {
    const definition = generateMultiStageParallelDefinition({
      approverCount: 5,
      requiredApprovals: 3,
      notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
      evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const payload = definition.States.NotifyAllApprovers.Parameters.Payload;
    expect(payload.requiredApprovals).toBe(3);
    expect(payload.approverCount).toBe(5);
  });

  it('throws error when requiredApprovals exceeds approverCount', () => {
    expect(() =>
      generateMultiStageParallelDefinition({
        approverCount: 2,
        requiredApprovals: 3,
        notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
        evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
        escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
        completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
      }),
    ).toThrow('requiredApprovals cannot exceed approverCount');
  });

  it('throws error when requiredApprovals is less than 1', () => {
    expect(() =>
      generateMultiStageParallelDefinition({
        approverCount: 3,
        requiredApprovals: 0,
        notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
        evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
        escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
        completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
      }),
    ).toThrow('requiredApprovals must be at least 1');
  });

  it('configures timeout with escalation', () => {
    const definition = generateMultiStageParallelDefinition({
      approverCount: 3,
      requiredApprovals: 2,
      slaTimeoutSeconds: 7200,
      notifyApproversLambdaArn: LAMBDA_ARNS.notifyApproversLambdaArn,
      evaluateQuorumLambdaArn: LAMBDA_ARNS.evaluateQuorumLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.NotifyAllApprovers.TimeoutSeconds).toBe(7200);
    const timeoutCatch = definition.States.NotifyAllApprovers.Catch.find(
      (c: any) => c.ErrorEquals.includes('States.Timeout'),
    );
    expect(timeoutCatch.Next).toBe('EscalateApproval');
  });
});

describe('Conditional Branching State Machine', () => {
  it('generates valid ASL with routing choice state', () => {
    const definition = generateConditionalDefinition({
      branches: [
        {
          name: 'finance',
          conditionVariable: '$.tripSummary.totalCostNumeric',
          operator: 'NumericGreaterThan',
          value: 5000,
        },
        {
          name: 'risk',
          conditionVariable: '$.tripSummary.isInternational',
          operator: 'BooleanEquals',
          value: true,
        },
      ],
      defaultBranch: 'standard',
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.StartAt).toBe('RouteApproval');
    expect(definition.States.RouteApproval.Type).toBe('Choice');
  });

  it('routes to correct branch based on conditions', () => {
    const definition = generateConditionalDefinition({
      branches: [
        {
          name: 'finance',
          conditionVariable: '$.tripSummary.totalCostNumeric',
          operator: 'NumericGreaterThan',
          value: 5000,
        },
      ],
      defaultBranch: 'standard',
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    const routeState = definition.States.RouteApproval;
    expect(routeState.Choices[0].Next).toBe('financeBranch_NotifyApprover');
    expect(routeState.Default).toBe('standardBranch_NotifyApprover');
  });

  it('generates branch-specific states with callback token', () => {
    const definition = generateConditionalDefinition({
      branches: [
        {
          name: 'finance',
          conditionVariable: '$.tripSummary.totalCostNumeric',
          operator: 'NumericGreaterThan',
          value: 5000,
          slaTimeoutSeconds: 14400,
        },
      ],
      defaultBranch: 'standard',
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.financeBranch_NotifyApprover).toBeDefined();
    expect(definition.States.financeBranch_NotifyApprover.Resource).toBe(
      'arn:aws:states:::lambda:invoke.waitForTaskToken',
    );
    expect(definition.States.financeBranch_NotifyApprover.TimeoutSeconds).toBe(14400);
  });

  it('generates default branch states', () => {
    const definition = generateConditionalDefinition({
      branches: [
        {
          name: 'finance',
          conditionVariable: '$.tripSummary.totalCostNumeric',
          operator: 'NumericGreaterThan',
          value: 5000,
        },
      ],
      defaultBranch: 'standard',
      notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
      escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
      completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
    }) as any;

    expect(definition.States.standardBranch_NotifyApprover).toBeDefined();
    expect(definition.States.standardBranch_EvaluateDecision).toBeDefined();
    expect(definition.States.standardBranch_Escalate).toBeDefined();
  });

  it('throws error when no branches provided', () => {
    expect(() =>
      generateConditionalDefinition({
        branches: [],
        defaultBranch: 'standard',
        notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
        escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
        completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
      }),
    ).toThrow('At least one branch configuration is required');
  });
});

describe('Factory Function (createStateMachineDefinition)', () => {
  it('creates single-stage definition', () => {
    const definition = createStateMachineDefinition({
      templateType: 'single-stage',
      lambdaConfig: LAMBDA_ARNS,
    }) as any;

    expect(definition.StartAt).toBe('NotifyApprover');
    expect(definition.States.NotifyApprover).toBeDefined();
  });

  it('creates multi-stage-sequential definition', () => {
    const definition = createStateMachineDefinition({
      templateType: 'multi-stage-sequential',
      lambdaConfig: LAMBDA_ARNS,
      stageCount: 3,
    }) as any;

    expect(definition.StartAt).toBe('InitializeResults');
    expect(definition.States.Stage1_NotifyApprover).toBeDefined();
    expect(definition.States.Stage2_NotifyApprover).toBeDefined();
    expect(definition.States.Stage3_NotifyApprover).toBeDefined();
  });

  it('creates multi-stage-parallel definition', () => {
    const definition = createStateMachineDefinition({
      templateType: 'multi-stage-parallel',
      lambdaConfig: LAMBDA_ARNS,
      approverCount: 4,
      requiredApprovals: 3,
    }) as any;

    expect(definition.StartAt).toBe('NotifyAllApprovers');
    expect(definition.States.EvaluateQuorum).toBeDefined();
  });

  it('creates conditional definition', () => {
    const definition = createStateMachineDefinition({
      templateType: 'conditional',
      lambdaConfig: LAMBDA_ARNS,
      branches: [
        {
          name: 'finance',
          conditionVariable: '$.tripSummary.totalCostNumeric',
          operator: 'NumericGreaterThan',
          value: 5000,
        },
      ],
      defaultBranch: 'standard',
    }) as any;

    expect(definition.StartAt).toBe('RouteApproval');
    expect(definition.States.RouteApproval.Type).toBe('Choice');
  });

  it('throws error for unsupported template type', () => {
    expect(() =>
      createStateMachineDefinition({
        templateType: 'unknown' as any,
        lambdaConfig: LAMBDA_ARNS,
      }),
    ).toThrow('Unsupported workflow template type');
  });

  it('throws error when parallel workflow missing required Lambda ARNs', () => {
    expect(() =>
      createStateMachineDefinition({
        templateType: 'multi-stage-parallel',
        lambdaConfig: {
          notifyApproverLambdaArn: LAMBDA_ARNS.notifyApproverLambdaArn,
          escalationLambdaArn: LAMBDA_ARNS.escalationLambdaArn,
          completeWorkflowLambdaArn: LAMBDA_ARNS.completeWorkflowLambdaArn,
        },
      }),
    ).toThrow('notifyApproversLambdaArn is required');
  });

  it('throws error when conditional workflow missing branches', () => {
    expect(() =>
      createStateMachineDefinition({
        templateType: 'conditional',
        lambdaConfig: LAMBDA_ARNS,
      }),
    ).toThrow('branches configuration is required');
  });
});
