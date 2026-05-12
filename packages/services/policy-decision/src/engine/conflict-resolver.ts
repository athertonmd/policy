/**
 * Conflict Resolver
 * Resolves conflicts when multiple rules match with different outcomes.
 * Supports configurable resolution strategies per tenant.
 */

import type { PolicyResult, WinningRule } from '@travel-policy/shared';

/**
 * Conflict resolution strategy.
 * - "highest_priority": The rule with the lowest priority number (highest priority) wins.
 * - "most_restrictive": reject > review > approve (default safe behaviour).
 * - "most_permissive": approve > review > reject (traveller-friendly).
 */
export type ConflictResolutionStrategy =
  | 'highest_priority'
  | 'most_restrictive'
  | 'most_permissive';

export interface RuleOutcome {
  ruleId: string;
  ruleName: string;
  priority: number;
  result: PolicyResult;
  reasons: string[];
}

export interface ConflictResolutionResult {
  result: PolicyResult;
  winningRule: RuleOutcome;
  strategy: ConflictResolutionStrategy;
  conflictsDetected: boolean;
}

/**
 * Resolves conflicts between multiple rule outcomes using the specified strategy.
 * If all outcomes agree, no conflict resolution is needed.
 */
export function resolveConflicts(
  outcomes: RuleOutcome[],
  strategy: ConflictResolutionStrategy = 'highest_priority'
): ConflictResolutionResult {
  if (outcomes.length === 0) {
    return {
      result: 'approve',
      winningRule: {
        ruleId: 'default',
        ruleName: 'Default (no rules matched)',
        priority: Number.MAX_SAFE_INTEGER,
        result: 'approve',
        reasons: ['No rules matched; default approve'],
      },
      strategy,
      conflictsDetected: false,
    };
  }

  if (outcomes.length === 1) {
    return {
      result: outcomes[0].result,
      winningRule: outcomes[0],
      strategy,
      conflictsDetected: false,
    };
  }

  // Check if there's actually a conflict (different results)
  const uniqueResults = new Set(outcomes.map((o) => o.result));
  const conflictsDetected = uniqueResults.size > 1;

  const winner = selectWinner(outcomes, strategy);

  return {
    result: winner.result,
    winningRule: winner,
    strategy,
    conflictsDetected,
  };
}

/**
 * Selects the winning rule outcome based on the resolution strategy.
 */
function selectWinner(
  outcomes: RuleOutcome[],
  strategy: ConflictResolutionStrategy
): RuleOutcome {
  switch (strategy) {
    case 'highest_priority':
      return selectByPriority(outcomes);
    case 'most_restrictive':
      return selectMostRestrictive(outcomes);
    case 'most_permissive':
      return selectMostPermissive(outcomes);
    default:
      return selectByPriority(outcomes);
  }
}

/**
 * Selects the outcome from the rule with the lowest priority number (highest priority).
 * Ties are broken by most restrictive result.
 */
function selectByPriority(outcomes: RuleOutcome[]): RuleOutcome {
  const sorted = [...outcomes].sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority; // Lower number = higher priority
    }
    // Tie-break: most restrictive wins
    return restrictiveness(b.result) - restrictiveness(a.result);
  });
  return sorted[0];
}

/**
 * Selects the most restrictive outcome: reject > review > approve.
 * Ties (same restrictiveness) are broken by priority.
 */
function selectMostRestrictive(outcomes: RuleOutcome[]): RuleOutcome {
  const sorted = [...outcomes].sort((a, b) => {
    const restrictDiff = restrictiveness(b.result) - restrictiveness(a.result);
    if (restrictDiff !== 0) return restrictDiff;
    return a.priority - b.priority; // Tie-break by priority
  });
  return sorted[0];
}

/**
 * Selects the most permissive outcome: approve > review > reject.
 * Ties (same permissiveness) are broken by priority.
 */
function selectMostPermissive(outcomes: RuleOutcome[]): RuleOutcome {
  const sorted = [...outcomes].sort((a, b) => {
    const restrictDiff = restrictiveness(a.result) - restrictiveness(b.result);
    if (restrictDiff !== 0) return restrictDiff;
    return a.priority - b.priority; // Tie-break by priority
  });
  return sorted[0];
}

/**
 * Returns a numeric restrictiveness score for a policy result.
 */
function restrictiveness(result: PolicyResult): number {
  switch (result) {
    case 'reject':
      return 3;
    case 'review':
      return 2;
    case 'approve':
      return 1;
    default:
      return 0;
  }
}

/**
 * Converts WinningRule array to RuleOutcome array for conflict resolution.
 */
export function winningRulesToOutcomes(
  winningRules: WinningRule[],
  reasonsByRule?: Map<string, string[]>
): RuleOutcome[] {
  return winningRules.map((rule) => ({
    ruleId: rule.ruleId,
    ruleName: rule.ruleName,
    priority: rule.priority,
    result: rule.outcome,
    reasons: reasonsByRule?.get(rule.ruleId) ?? [],
  }));
}
