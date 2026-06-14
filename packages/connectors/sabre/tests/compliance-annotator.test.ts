import { describe, it, expect } from 'vitest';
import {
  annotateFares,
  mapDecisionToAnnotation,
  computeSummary,
  annotateFaresFromBatch,
} from '../src/search/compliance-annotator.js';
import type { PolicyDecision, BatchPolicyDecision } from '@travel-policy/shared';

// --- Test Fixtures ---

function createMockDecision(overrides?: Partial<PolicyDecision>): PolicyDecision {
  return {
    decisionId: 'dec-001',
    tenantId: 'tenant-123',
    result: 'approve',
    winningRules: [{ ruleId: 'rule-1', ruleName: 'Economy Class Rule', priority: 1, outcome: 'approve' }],
    reasons: [],
    obligations: [],
    alternatives: [],
    expiresAt: '2025-03-15T12:00:00Z',
    evaluatedAt: '2025-03-14T10:00:00Z',
    durationMs: 45,
    ...overrides,
  };
}

function createApproveDecision(): PolicyDecision {
  return createMockDecision({ result: 'approve' });
}

function createReviewDecision(): PolicyDecision {
  return createMockDecision({
    result: 'review',
    decisionId: 'dec-002',
    winningRules: [{ ruleId: 'rule-2', ruleName: 'Business Class Approval', priority: 2, outcome: 'review' }],
    obligations: [
      { type: 'manager_approval', description: 'Manager approval required for business class' },
    ],
    budgetStatus: {
      budgetId: 'budget-q1',
      budgetName: 'Q1 Travel Budget',
      totalBudget: { amount: 50000, currency: 'USD' },
      currentUtilisation: { amount: 35000, currency: 'USD' },
      projectedUtilisation: { amount: 37500, currency: 'USD' },
      percentUsed: 70,
      warningThreshold: 80,
    },
  });
}

function createRejectDecision(): PolicyDecision {
  return createMockDecision({
    result: 'reject',
    decisionId: 'dec-003',
    winningRules: [{ ruleId: 'rule-3', ruleName: 'First Class Block', priority: 3, outcome: 'reject' }],
    reasons: ['First class travel not permitted for this seniority level'],
    alternatives: [
      { offerId: 'sabre-bfm-2', reason: 'Business class available at lower cost', savingsAmount: { amount: 2000, currency: 'USD' } },
    ],
    carbonImpact: {
      estimatedKg: 1200,
      comparisonToAverage: 1.5,
      lowerCarbonAlternativeAvailable: true,
    },
  });
}

// --- Tests ---

describe('compliance-annotator', () => {
  describe('mapDecisionToAnnotation', () => {
    it('should map approve decision to compliant annotation', () => {
      const decision = createApproveDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.status).toBe('compliant');
      expect(annotation.color).toBe('green');
      expect(annotation.icon).toBe('✓');
      expect(annotation.message).toBe('Within policy');
      expect(annotation.decisionId).toBe('dec-001');
      expect(annotation.ruleNames).toEqual(['Economy Class Rule']);
    });

    it('should map review decision to needs_approval annotation', () => {
      const decision = createReviewDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.status).toBe('needs_approval');
      expect(annotation.color).toBe('amber');
      expect(annotation.icon).toBe('⚠');
      expect(annotation.message).toBe('Requires approval: Manager approval required for business class');
      expect(annotation.obligations).toHaveLength(1);
      expect(annotation.obligations![0].type).toBe('manager_approval');
    });

    it('should map reject decision to non_compliant annotation', () => {
      const decision = createRejectDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.status).toBe('non_compliant');
      expect(annotation.color).toBe('red');
      expect(annotation.icon).toBe('✗');
      expect(annotation.message).toBe('Out of policy: First class travel not permitted for this seniority level');
      expect(annotation.alternatives).toHaveLength(1);
      expect(annotation.alternatives![0].offerId).toBe('sabre-bfm-2');
    });

    it('should include budget status when available', () => {
      const decision = createReviewDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.budgetStatus).toBeDefined();
      expect(annotation.budgetStatus!.percentUsed).toBe(70);
      expect(annotation.budgetStatus!.budgetName).toBe('Q1 Travel Budget');
    });

    it('should include carbon impact when available', () => {
      const decision = createRejectDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.carbonImpact).toBeDefined();
      expect(annotation.carbonImpact!.estimatedKg).toBe(1200);
      expect(annotation.carbonImpact!.lowerCarbonAlternativeAvailable).toBe(true);
    });

    it('should not include obligations for approve decisions', () => {
      const decision = createApproveDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.obligations).toBeUndefined();
    });

    it('should not include alternatives for approve decisions', () => {
      const decision = createApproveDecision();
      const annotation = mapDecisionToAnnotation(decision);

      expect(annotation.alternatives).toBeUndefined();
    });
  });

  describe('annotateFares', () => {
    it('should annotate multiple fares with their respective decisions', () => {
      const decisions = [createApproveDecision(), createReviewDecision(), createRejectDecision()];
      const offerIds = ['sabre-bfm-1', 'sabre-bfm-2', 'sabre-bfm-3'];
      const sequenceNumbers = [1, 2, 3];

      const annotations = annotateFares(decisions, offerIds, sequenceNumbers);

      expect(annotations).toHaveLength(3);
      expect(annotations[0].sequenceNumber).toBe(1);
      expect(annotations[0].offerId).toBe('sabre-bfm-1');
      expect(annotations[0].compliance.status).toBe('compliant');

      expect(annotations[1].sequenceNumber).toBe(2);
      expect(annotations[1].offerId).toBe('sabre-bfm-2');
      expect(annotations[1].compliance.status).toBe('needs_approval');

      expect(annotations[2].sequenceNumber).toBe(3);
      expect(annotations[2].offerId).toBe('sabre-bfm-3');
      expect(annotations[2].compliance.status).toBe('non_compliant');
    });

    it('should handle empty arrays', () => {
      const annotations = annotateFares([], [], []);
      expect(annotations).toHaveLength(0);
    });

    it('should handle single fare', () => {
      const annotations = annotateFares(
        [createApproveDecision()],
        ['sabre-bfm-1'],
        [1]
      );

      expect(annotations).toHaveLength(1);
      expect(annotations[0].compliance.status).toBe('compliant');
    });
  });

  describe('computeSummary', () => {
    it('should compute correct summary statistics', () => {
      const decisions = [createApproveDecision(), createApproveDecision(), createReviewDecision(), createRejectDecision()];
      const offerIds = ['o1', 'o2', 'o3', 'o4'];
      const sequenceNumbers = [1, 2, 3, 4];

      const annotations = annotateFares(decisions, offerIds, sequenceNumbers);
      const summary = computeSummary(annotations);

      expect(summary.totalFares).toBe(4);
      expect(summary.compliant).toBe(2);
      expect(summary.needsApproval).toBe(1);
      expect(summary.nonCompliant).toBe(1);
    });

    it('should handle all compliant fares', () => {
      const decisions = [createApproveDecision(), createApproveDecision()];
      const annotations = annotateFares(decisions, ['o1', 'o2'], [1, 2]);
      const summary = computeSummary(annotations);

      expect(summary.totalFares).toBe(2);
      expect(summary.compliant).toBe(2);
      expect(summary.needsApproval).toBe(0);
      expect(summary.nonCompliant).toBe(0);
    });

    it('should handle empty annotations', () => {
      const summary = computeSummary([]);

      expect(summary.totalFares).toBe(0);
      expect(summary.compliant).toBe(0);
      expect(summary.needsApproval).toBe(0);
      expect(summary.nonCompliant).toBe(0);
    });
  });

  describe('annotateFaresFromBatch', () => {
    it('should annotate fares from a batch policy decision', () => {
      const batchDecision: BatchPolicyDecision = {
        decisions: [createApproveDecision(), createRejectDecision()],
        evaluatedAt: '2025-03-14T10:00:00Z',
        totalDurationMs: 90,
      };

      const annotations = annotateFaresFromBatch(
        batchDecision,
        ['sabre-bfm-1', 'sabre-bfm-2'],
        [1, 2]
      );

      expect(annotations).toHaveLength(2);
      expect(annotations[0].compliance.status).toBe('compliant');
      expect(annotations[1].compliance.status).toBe('non_compliant');
    });
  });
});
