import { describe, it, expect } from 'vitest';
import {
  resolveConflicts,
  winningRulesToOutcomes,
  type RuleOutcome,
  type ConflictResolutionStrategy,
} from './conflict-resolver.js';
import type { WinningRule } from '@travel-policy/shared';

function createOutcome(overrides?: Partial<RuleOutcome>): RuleOutcome {
  return {
    ruleId: 'rule-001',
    ruleName: 'Test Rule',
    priority: 100,
    result: 'approve',
    reasons: [],
    ...overrides,
  };
}

describe('resolveConflicts', () => {
  describe('with no outcomes', () => {
    it('returns default approve when no rules matched', () => {
      const result = resolveConflicts([], 'highest_priority');

      expect(result.result).toBe('approve');
      expect(result.conflictsDetected).toBe(false);
      expect(result.winningRule.ruleId).toBe('default');
    });
  });

  describe('with a single outcome', () => {
    it('returns the single outcome without conflict', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-1', result: 'reject', priority: 50 }),
      ];

      const result = resolveConflicts(outcomes, 'highest_priority');

      expect(result.result).toBe('reject');
      expect(result.conflictsDetected).toBe(false);
      expect(result.winningRule.ruleId).toBe('rule-1');
    });
  });

  describe('with no conflict (all same result)', () => {
    it('reports no conflict when all outcomes agree', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-1', result: 'approve', priority: 50 }),
        createOutcome({ ruleId: 'rule-2', result: 'approve', priority: 100 }),
      ];

      const result = resolveConflicts(outcomes, 'highest_priority');

      expect(result.result).toBe('approve');
      expect(result.conflictsDetected).toBe(false);
    });
  });

  describe('highest_priority strategy', () => {
    it('selects the rule with lowest priority number', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-low', result: 'approve', priority: 200 }),
        createOutcome({ ruleId: 'rule-high', result: 'reject', priority: 10 }),
        createOutcome({ ruleId: 'rule-mid', result: 'review', priority: 100 }),
      ];

      const result = resolveConflicts(outcomes, 'highest_priority');

      expect(result.result).toBe('reject');
      expect(result.winningRule.ruleId).toBe('rule-high');
      expect(result.conflictsDetected).toBe(true);
      expect(result.strategy).toBe('highest_priority');
    });

    it('breaks ties by most restrictive result', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-a', result: 'approve', priority: 50 }),
        createOutcome({ ruleId: 'rule-b', result: 'reject', priority: 50 }),
      ];

      const result = resolveConflicts(outcomes, 'highest_priority');

      expect(result.result).toBe('reject');
      expect(result.winningRule.ruleId).toBe('rule-b');
    });
  });

  describe('most_restrictive strategy', () => {
    it('selects reject over review and approve', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-approve', result: 'approve', priority: 10 }),
        createOutcome({ ruleId: 'rule-review', result: 'review', priority: 50 }),
        createOutcome({ ruleId: 'rule-reject', result: 'reject', priority: 200 }),
      ];

      const result = resolveConflicts(outcomes, 'most_restrictive');

      expect(result.result).toBe('reject');
      expect(result.winningRule.ruleId).toBe('rule-reject');
      expect(result.conflictsDetected).toBe(true);
    });

    it('selects review over approve', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-approve', result: 'approve', priority: 10 }),
        createOutcome({ ruleId: 'rule-review', result: 'review', priority: 200 }),
      ];

      const result = resolveConflicts(outcomes, 'most_restrictive');

      expect(result.result).toBe('review');
      expect(result.winningRule.ruleId).toBe('rule-review');
    });

    it('breaks ties by priority when same restrictiveness', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-a', result: 'reject', priority: 100 }),
        createOutcome({ ruleId: 'rule-b', result: 'reject', priority: 10 }),
      ];

      const result = resolveConflicts(outcomes, 'most_restrictive');

      expect(result.result).toBe('reject');
      expect(result.winningRule.ruleId).toBe('rule-b');
    });
  });

  describe('most_permissive strategy', () => {
    it('selects approve over review and reject', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-reject', result: 'reject', priority: 10 }),
        createOutcome({ ruleId: 'rule-review', result: 'review', priority: 50 }),
        createOutcome({ ruleId: 'rule-approve', result: 'approve', priority: 200 }),
      ];

      const result = resolveConflicts(outcomes, 'most_permissive');

      expect(result.result).toBe('approve');
      expect(result.winningRule.ruleId).toBe('rule-approve');
      expect(result.conflictsDetected).toBe(true);
    });

    it('selects review over reject', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-reject', result: 'reject', priority: 10 }),
        createOutcome({ ruleId: 'rule-review', result: 'review', priority: 200 }),
      ];

      const result = resolveConflicts(outcomes, 'most_permissive');

      expect(result.result).toBe('review');
      expect(result.winningRule.ruleId).toBe('rule-review');
    });

    it('breaks ties by priority when same permissiveness', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-a', result: 'approve', priority: 100 }),
        createOutcome({ ruleId: 'rule-b', result: 'approve', priority: 10 }),
      ];

      const result = resolveConflicts(outcomes, 'most_permissive');

      expect(result.result).toBe('approve');
      expect(result.winningRule.ruleId).toBe('rule-b');
    });
  });

  describe('default strategy fallback', () => {
    it('falls back to highest_priority for unknown strategy', () => {
      const outcomes: RuleOutcome[] = [
        createOutcome({ ruleId: 'rule-a', result: 'approve', priority: 200 }),
        createOutcome({ ruleId: 'rule-b', result: 'reject', priority: 10 }),
      ];

      // Cast to bypass type checking for unknown strategy
      const result = resolveConflicts(outcomes, 'unknown' as ConflictResolutionStrategy);

      expect(result.result).toBe('reject');
      expect(result.winningRule.ruleId).toBe('rule-b');
    });
  });
});

describe('winningRulesToOutcomes', () => {
  it('converts WinningRule array to RuleOutcome array', () => {
    const winningRules: WinningRule[] = [
      { ruleId: 'r1', ruleName: 'Rule One', priority: 50, outcome: 'approve' },
      { ruleId: 'r2', ruleName: 'Rule Two', priority: 100, outcome: 'reject' },
    ];

    const outcomes = winningRulesToOutcomes(winningRules);

    expect(outcomes).toHaveLength(2);
    expect(outcomes[0].ruleId).toBe('r1');
    expect(outcomes[0].result).toBe('approve');
    expect(outcomes[0].priority).toBe(50);
    expect(outcomes[1].ruleId).toBe('r2');
    expect(outcomes[1].result).toBe('reject');
  });

  it('includes reasons from reasonsByRule map', () => {
    const winningRules: WinningRule[] = [
      { ruleId: 'r1', ruleName: 'Rule One', priority: 50, outcome: 'reject' },
    ];
    const reasonsByRule = new Map<string, string[]>();
    reasonsByRule.set('r1', ['Too expensive', 'Over budget']);

    const outcomes = winningRulesToOutcomes(winningRules, reasonsByRule);

    expect(outcomes[0].reasons).toEqual(['Too expensive', 'Over budget']);
  });

  it('returns empty reasons when no map provided', () => {
    const winningRules: WinningRule[] = [
      { ruleId: 'r1', ruleName: 'Rule One', priority: 50, outcome: 'approve' },
    ];

    const outcomes = winningRulesToOutcomes(winningRules);

    expect(outcomes[0].reasons).toEqual([]);
  });
});
