/**
 * Policy Evaluator
 * Core evaluation engine that walks the PolicyGraph DAG to produce a PolicyDecision.
 */

import type {
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  PolicyTerminal,
  PolicyDecisionRequest,
  PolicyDecision,
  WinningRule,
  Obligation,
  AlternativeSuggestion,
  PolicyResult,
  Offer,
} from '@travel-policy/shared';
import { evaluateCondition, type EvaluationInput } from './condition-evaluator.js';

export interface EvaluationResult {
  result: PolicyResult;
  winningRules: WinningRule[];
  reasons: string[];
  obligations: Obligation[];
  alternatives: AlternativeSuggestion[];
}

/**
 * Evaluates a PolicyDecisionRequest against a PolicyGraph.
 * Walks the graph from the root node, evaluating conditions and collecting results.
 * Returns a full PolicyDecision response.
 */
export function evaluatePolicy(
  request: PolicyDecisionRequest,
  graph: PolicyGraph
): PolicyDecision {
  const startTime = Date.now();

  // Build lookup maps for efficient traversal
  const nodeMap = new Map<string, PolicyNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const edgesBySource = new Map<string, PolicyEdge[]>();
  for (const edge of graph.edges) {
    const existing = edgesBySource.get(edge.fromNodeId) ?? [];
    existing.push(edge);
    edgesBySource.set(edge.fromNodeId, existing);
  }

  // Evaluate each offer independently and collect results
  const allResults: EvaluationResult[] = [];

  for (const offer of request.offers) {
    const input: EvaluationInput = {
      traveller: flattenObject(request.traveller),
      trip: flattenObject(request.trip),
      offer: flattenObject(offer),
      metadata: request.metadata as Record<string, unknown> | undefined,
    };

    const result = walkGraph(graph.rootNodeId, nodeMap, edgesBySource, input, graph);
    allResults.push(result);
  }

  // Merge results across all offers — most restrictive result wins
  const mergedResult = mergeResults(allResults);

  // Find cheaper alternatives if any offers were rejected
  const alternatives = findAlternatives(request.offers, allResults);

  const evaluatedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  return {
    decisionId: generateDecisionId(),
    tenantId: request.tenantId,
    result: mergedResult.result,
    winningRules: mergedResult.winningRules,
    reasons: mergedResult.reasons,
    obligations: mergedResult.obligations,
    alternatives: [...mergedResult.alternatives, ...alternatives],
    evaluatedAt,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
    durationMs,
  };
}

/**
 * Walks the policy graph from a given node, evaluating conditions and following edges.
 */
function walkGraph(
  nodeId: string,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput,
  graph: PolicyGraph
): EvaluationResult {
  const node = nodeMap.get(nodeId);
  if (!node) {
    return defaultResult();
  }

  switch (node.type) {
    case 'terminal':
      return terminalToResult(node, graph);

    case 'condition': {
      const conditionMet = node.condition
        ? evaluateCondition(node.condition, input)
        : false;

      const edges = edgesBySource.get(nodeId) ?? [];
      const nextEdge = findMatchingEdge(edges, conditionMet);

      if (nextEdge) {
        return walkGraph(nextEdge.toNodeId, nodeMap, edgesBySource, input, graph);
      }
      return defaultResult();
    }

    case 'gate': {
      return evaluateGate(node, nodeMap, edgesBySource, input, graph);
    }

    case 'action': {
      // Action nodes produce a result and may continue to next node
      const actionResult = evaluateAction(node, graph);
      const edges = edgesBySource.get(nodeId) ?? [];
      if (edges.length > 0) {
        const nextResult = walkGraph(edges[0].toNodeId, nodeMap, edgesBySource, input, graph);
        return mergeResults([actionResult, nextResult]);
      }
      return actionResult;
    }

    default:
      return defaultResult();
  }
}

/**
 * Evaluates a gate node (AND/OR/NOT) by evaluating all child branches.
 */
function evaluateGate(
  node: PolicyNode,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput,
  graph: PolicyGraph
): EvaluationResult {
  const edges = edgesBySource.get(node.nodeId) ?? [];

  if (edges.length === 0) {
    return defaultResult();
  }

  // Sort edges by priority (lower number = higher priority)
  const sortedEdges = [...edges].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));

  const childResults: EvaluationResult[] = [];
  for (const edge of sortedEdges) {
    const result = walkGraph(edge.toNodeId, nodeMap, edgesBySource, input, graph);
    childResults.push(result);
  }

  switch (node.operator) {
    case 'and': {
      // All children must approve for the gate to approve
      const hasReject = childResults.some((r) => r.result === 'reject');
      if (hasReject) {
        return mergeResults(childResults.filter((r) => r.result === 'reject'));
      }
      const hasReview = childResults.some((r) => r.result === 'review');
      if (hasReview) {
        return mergeResults(childResults.filter((r) => r.result === 'review'));
      }
      return mergeResults(childResults);
    }

    case 'or': {
      // Any child approving means approve; return most permissive
      const hasApprove = childResults.some((r) => r.result === 'approve');
      if (hasApprove) {
        return mergeResults(childResults.filter((r) => r.result === 'approve'));
      }
      const hasReview = childResults.some((r) => r.result === 'review');
      if (hasReview) {
        return mergeResults(childResults.filter((r) => r.result === 'review'));
      }
      return mergeResults(childResults);
    }

    case 'not': {
      // Invert the first child result
      if (childResults.length > 0) {
        const inverted = { ...childResults[0] };
        if (inverted.result === 'approve') {
          inverted.result = 'reject';
        } else if (inverted.result === 'reject') {
          inverted.result = 'approve';
        }
        return inverted;
      }
      return defaultResult();
    }

    default:
      // No operator — evaluate by priority, most restrictive wins
      return mergeResults(childResults);
  }
}

/**
 * Converts an action node into an evaluation result.
 */
function evaluateAction(node: PolicyNode, graph: PolicyGraph): EvaluationResult {
  if (!node.action) {
    return defaultResult();
  }

  const action = node.action;
  const result: EvaluationResult = {
    result: 'approve',
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: [],
  };

  switch (action.type) {
    case 'approve':
      result.result = 'approve';
      break;
    case 'reject':
      result.result = 'reject';
      if (action.params['reason']) {
        result.reasons.push(String(action.params['reason']));
      }
      break;
    case 'review':
      result.result = 'review';
      if (action.params['reason']) {
        result.reasons.push(String(action.params['reason']));
      }
      break;
    case 'add_obligation':
      result.obligations.push({
        type: (action.params['obligationType'] as Obligation['type']) ?? 'require_approval',
        description: String(action.params['description'] ?? 'Approval required'),
        metadata: action.params['metadata'] as Record<string, unknown> | undefined,
      });
      result.result = 'review';
      break;
    case 'suggest_alternative':
      result.alternatives.push({
        offerId: String(action.params['offerId'] ?? ''),
        reason: String(action.params['reason'] ?? 'A cheaper alternative is available'),
        savingsAmount: action.params['savingsAmount'] as { amount: number; currency: string } | undefined,
        carbonSavingsKg: action.params['carbonSavingsKg'] as number | undefined,
      });
      break;
    case 'warn':
      if (action.params['reason']) {
        result.reasons.push(String(action.params['reason']));
      }
      break;
  }

  // Add winning rule info if available
  if (action.params['ruleName']) {
    result.winningRules.push({
      ruleId: String(action.params['ruleId'] ?? node.nodeId),
      ruleName: String(action.params['ruleName']),
      priority: Number(action.params['priority'] ?? 100),
      outcome: result.result,
    });
  }

  return result;
}

/**
 * Converts a terminal node into an evaluation result.
 */
function terminalToResult(node: PolicyNode, graph: PolicyGraph): EvaluationResult {
  const terminal = node.terminal;
  if (!terminal) {
    return defaultResult();
  }

  // Find the rule metadata for this terminal node
  const ruleMetadata = graph.metadata.rules?.find((r) => {
    // A terminal belongs to a rule if it's reachable from the rule's entry node
    return r.entryNodeId === node.nodeId;
  });

  const winningRules: WinningRule[] = [];
  if (ruleMetadata) {
    winningRules.push({
      ruleId: ruleMetadata.entryNodeId,
      ruleName: ruleMetadata.name,
      priority: ruleMetadata.priority ?? 100,
      outcome: terminal.result,
    });
  }

  return {
    result: terminal.result,
    winningRules,
    reasons: [...terminal.reasons],
    obligations: [...terminal.obligations],
    alternatives: [],
  };
}

/**
 * Finds the matching edge based on condition evaluation result.
 */
function findMatchingEdge(edges: PolicyEdge[], conditionMet: boolean): PolicyEdge | undefined {
  const conditionLabel = conditionMet ? 'true' : 'false';

  // First try to find an edge matching the condition result
  const matchingEdge = edges.find((e) => e.condition === conditionLabel);
  if (matchingEdge) return matchingEdge;

  // Fall back to default edge
  const defaultEdge = edges.find((e) => e.condition === 'default' || !e.condition);
  return defaultEdge;
}

/**
 * Merges multiple evaluation results, with most restrictive result winning.
 * Priority: reject > review > approve
 */
function mergeResults(results: EvaluationResult[]): EvaluationResult {
  if (results.length === 0) return defaultResult();
  if (results.length === 1) return results[0];

  const merged: EvaluationResult = {
    result: 'approve',
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: [],
  };

  for (const r of results) {
    // Most restrictive result wins
    if (resultPriority(r.result) > resultPriority(merged.result)) {
      merged.result = r.result;
    }
    merged.winningRules.push(...r.winningRules);
    merged.reasons.push(...r.reasons);
    merged.obligations.push(...r.obligations);
    merged.alternatives.push(...r.alternatives);
  }

  // Deduplicate reasons
  merged.reasons = [...new Set(merged.reasons)];

  return merged;
}

function resultPriority(result: PolicyResult): number {
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
 * Finds cheaper alternatives among offers that were approved when others were rejected.
 */
function findAlternatives(
  offers: Offer[],
  results: EvaluationResult[]
): AlternativeSuggestion[] {
  const alternatives: AlternativeSuggestion[] = [];

  for (let i = 0; i < offers.length; i++) {
    if (results[i]?.result === 'approve') {
      // Check if there are rejected offers that are more expensive
      for (let j = 0; j < offers.length; j++) {
        if (i !== j && results[j]?.result === 'reject') {
          const approvedPrice = offers[i].totalPrice.amount;
          const rejectedPrice = offers[j].totalPrice.amount;
          if (approvedPrice < rejectedPrice) {
            alternatives.push({
              offerId: offers[i].offerId,
              reason: `Compliant alternative saving ${offers[j].totalPrice.currency} ${(rejectedPrice - approvedPrice).toFixed(2)}`,
              savingsAmount: {
                amount: rejectedPrice - approvedPrice,
                currency: offers[j].totalPrice.currency,
              },
            });
          }
        }
      }
    }
  }

  return alternatives;
}

/**
 * Flattens an object for field resolution.
 * Keeps nested objects intact for dot-notation traversal.
 */
function flattenObject(obj: unknown): Record<string, unknown> {
  if (obj === null || obj === undefined) return {};
  if (typeof obj !== 'object') return {};
  return obj as Record<string, unknown>;
}

function defaultResult(): EvaluationResult {
  return {
    result: 'approve',
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: [],
  };
}

function generateDecisionId(): string {
  return `dec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
