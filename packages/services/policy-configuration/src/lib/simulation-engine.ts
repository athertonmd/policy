/**
 * Policy Simulation Engine
 *
 * A pure function that evaluates historical trip requests against both
 * active and draft policy graphs, producing a comparison report.
 *
 * This engine never affects live decisions — it operates on its own
 * graph instances and historical data only.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */

import { randomUUID } from 'crypto';
import type {
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  PolicyDecisionRequest,
  PolicyResult,
  SimulationReport,
  ChangedOutcome,
  Money,
} from '@travel-policy/shared';

/**
 * Result of evaluating a single trip against a policy graph.
 */
export interface SingleEvaluationResult {
  result: PolicyResult;
  reasons: string[];
}

/**
 * Input to the simulation engine — all data needed to run a simulation.
 */
export interface SimulationInput {
  draftGraph: PolicyGraph;
  activeGraph: PolicyGraph;
  historicalTrips: PolicyDecisionRequest[];
}

/**
 * EvaluationInput type for the simulation engine's internal use.
 */
export interface EvaluationInput {
  traveller: Record<string, unknown>;
  trip: Record<string, unknown>;
  offer: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Run a policy simulation comparing draft rules against active rules
 * using historical trip data.
 *
 * This is a pure function with no side effects — it does not modify
 * any live policy state or decision records.
 */
export function runSimulationEngine(input: SimulationInput): SimulationReport {
  const { draftGraph, activeGraph, historicalTrips } = input;

  const changedOutcomes: ChangedOutcome[] = [];
  let activeApproveCount = 0;
  let activeRejectCount = 0;
  let draftApproveCount = 0;
  let draftRejectCount = 0;
  let estimatedCostDelta = 0;

  for (const trip of historicalTrips) {
    const activeResult = evaluateTrip(trip, activeGraph);
    const draftResult = evaluateTrip(trip, draftGraph);

    // Track approval/rejection counts
    if (activeResult.result === 'approve') activeApproveCount++;
    if (activeResult.result === 'reject') activeRejectCount++;
    if (draftResult.result === 'approve') draftApproveCount++;
    if (draftResult.result === 'reject') draftRejectCount++;

    // Detect changed outcomes
    if (activeResult.result !== draftResult.result) {
      const tripCost = getTripTotalCost(trip);

      // If a trip moved from reject to approve, that's additional cost
      // If a trip moved from approve to reject, that's cost savings
      if (activeResult.result === 'reject' && draftResult.result === 'approve') {
        estimatedCostDelta += tripCost;
      } else if (activeResult.result === 'approve' && draftResult.result === 'reject') {
        estimatedCostDelta -= tripCost;
      }

      changedOutcomes.push({
        tripId: trip.trip.tripId,
        previousResult: activeResult.result,
        newResult: draftResult.result,
        reason: buildChangeReason(activeResult, draftResult),
      });
    }
  }

  const totalTrips = historicalTrips.length;
  const activeApprovalRate = totalTrips > 0 ? activeApproveCount / totalTrips : 0;
  const draftApprovalRate = totalTrips > 0 ? draftApproveCount / totalTrips : 0;
  const activeRejectionRate = totalTrips > 0 ? activeRejectCount / totalTrips : 0;
  const draftRejectionRate = totalTrips > 0 ? draftRejectCount / totalTrips : 0;

  // Rates expressed as percentage point changes (e.g., 0.05 = 5pp increase)
  const approvalRateChange = draftApprovalRate - activeApprovalRate;
  const rejectionRateChange = draftRejectionRate - activeRejectionRate;

  // Determine currency from first trip or default to GBP
  const currency = historicalTrips.length > 0 && historicalTrips[0].offers.length > 0
    ? historicalTrips[0].offers[0].totalPrice.currency
    : 'GBP';

  return {
    simulationId: `sim_${randomUUID()}`,
    totalTripsEvaluated: totalTrips,
    tripsAffected: changedOutcomes.length,
    approvalRateChange: roundToFourDecimals(approvalRateChange),
    rejectionRateChange: roundToFourDecimals(rejectionRateChange),
    estimatedCostImpact: {
      amount: roundToTwoDecimals(estimatedCostDelta),
      currency,
    },
    changedOutcomes,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Evaluate a single trip request against a policy graph.
 * 
 * Uses priority-based first-match semantics:
 * - Rules are evaluated in priority order (lower number = higher priority)
 * - The first rule whose conditions match determines the result
 * - If no rule matches, the default result is 'approve'
 */
export function evaluateTrip(
  request: PolicyDecisionRequest,
  graph: PolicyGraph
): SingleEvaluationResult {
  // Build lookup maps
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

  // Build evaluation input from the first offer (or empty if no offers)
  const offer = request.offers.length > 0 ? request.offers[0] : {};
  const input: EvaluationInput = {
    traveller: flattenObject(request.traveller),
    trip: flattenObject(request.trip),
    offer: flattenObject(offer),
    metadata: request.metadata as Record<string, unknown> | undefined,
  };

  // If the graph has rule metadata, use priority-based evaluation
  if (graph.metadata.rules && graph.metadata.rules.length > 0) {
    return evaluateByRulePriority(graph, nodeMap, edgesBySource, input);
  }

  // Fallback: walk the graph from root
  return walkGraph(graph.rootNodeId, nodeMap, edgesBySource, input);
}

/**
 * Evaluate rules in priority order (first match wins).
 * Each rule is evaluated independently: if its conditions match,
 * its terminal result is returned. If no rule matches, default is approve.
 */
function evaluateByRulePriority(
  graph: PolicyGraph,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): SingleEvaluationResult {
  // Get rules sorted by priority (lower number = higher priority = evaluated first)
  const rules = [...(graph.metadata.rules ?? [])].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
  );

  // Also get the root edges to determine priority from edge ordering
  const rootEdges = edgesBySource.get(graph.rootNodeId) ?? [];
  const sortedRootEdges = [...rootEdges].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
  );

  // Evaluate each rule in priority order
  for (const rule of rules) {
    const entryNodeId = rule.entryNodeId;
    const entryNode = nodeMap.get(entryNodeId);
    if (!entryNode) continue;

    // Check if the rule's conditions are satisfied
    const conditionsMet = evaluateRuleConditions(entryNode, nodeMap, edgesBySource, input);

    if (conditionsMet) {
      // Find the terminal for this rule by following the true edge
      const terminal = findRuleTerminal(entryNode, nodeMap, edgesBySource, input);
      if (terminal) {
        return terminal;
      }
    }
  }

  // No rule matched — default approve
  return { result: 'approve', reasons: [] };
}

/**
 * Evaluate whether a rule's entry condition is satisfied.
 * The entry node can be a condition node or a gate node (for compound conditions).
 */
function evaluateRuleConditions(
  entryNode: PolicyNode,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): boolean {
  if (entryNode.type === 'condition') {
    return entryNode.condition
      ? evaluateConditionNode(entryNode.condition, input)
      : false;
  }

  if (entryNode.type === 'gate') {
    return evaluateGateCondition(entryNode, nodeMap, edgesBySource, input);
  }

  // Terminal or action nodes are always "matched"
  return true;
}

/**
 * Evaluate a gate node as a boolean condition.
 */
function evaluateGateCondition(
  node: PolicyNode,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): boolean {
  const edges = edgesBySource.get(node.nodeId) ?? [];
  if (edges.length === 0) return true;

  // Filter to only child edges (default/no-condition), not true/false edges
  const childEdges = edges.filter(
    (e) => e.condition === 'default' || e.condition === undefined
  );

  const sortedEdges = [...childEdges].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
  );

  const childTruthValues: boolean[] = [];
  for (const edge of sortedEdges) {
    const childNode = nodeMap.get(edge.toNodeId);
    if (!childNode) {
      childTruthValues.push(true);
      continue;
    }

    if (childNode.type === 'condition') {
      const met = childNode.condition
        ? evaluateConditionNode(childNode.condition, input)
        : false;
      childTruthValues.push(met);
    } else if (childNode.type === 'gate') {
      childTruthValues.push(evaluateGateCondition(childNode, nodeMap, edgesBySource, input));
    } else {
      childTruthValues.push(true);
    }
  }

  switch (node.operator) {
    case 'and':
      return childTruthValues.every((v) => v);
    case 'or':
      return childTruthValues.some((v) => v);
    case 'not':
      return childTruthValues.length > 0 ? !childTruthValues[0] : true;
    default:
      return childTruthValues.some((v) => v);
  }
}

/**
 * Find the terminal result for a rule by following the true edge from its entry node.
 */
function findRuleTerminal(
  entryNode: PolicyNode,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): SingleEvaluationResult | null {
  const edges = edgesBySource.get(entryNode.nodeId) ?? [];
  const trueEdge = edges.find((e) => e.condition === 'true');

  if (trueEdge) {
    return walkToTerminal(trueEdge.toNodeId, nodeMap, edgesBySource, input);
  }

  return null;
}

/**
 * Walk from a node to find the terminal result (following action chains).
 */
function walkToTerminal(
  nodeId: string,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): SingleEvaluationResult {
  const node = nodeMap.get(nodeId);
  if (!node) {
    return { result: 'approve', reasons: [] };
  }

  switch (node.type) {
    case 'terminal':
      return {
        result: node.terminal?.result ?? 'approve',
        reasons: node.terminal?.reasons ?? [],
      };

    case 'action': {
      const actionResult = evaluateActionNode(node);
      const edges = edgesBySource.get(nodeId) ?? [];
      if (edges.length > 0) {
        const nextResult = walkToTerminal(edges[0].toNodeId, nodeMap, edgesBySource, input);
        return mergeResults(actionResult, nextResult);
      }
      return actionResult;
    }

    default:
      return { result: 'approve', reasons: [] };
  }
}

/**
 * Walk the policy graph from a given node (fallback for graphs without rule metadata).
 */
function walkGraph(
  nodeId: string,
  nodeMap: Map<string, PolicyNode>,
  edgesBySource: Map<string, PolicyEdge[]>,
  input: EvaluationInput
): SingleEvaluationResult {
  const node = nodeMap.get(nodeId);
  if (!node) {
    return { result: 'approve', reasons: [] };
  }

  switch (node.type) {
    case 'terminal':
      return {
        result: node.terminal?.result ?? 'approve',
        reasons: node.terminal?.reasons ?? [],
      };

    case 'condition': {
      const conditionMet = node.condition
        ? evaluateConditionNode(node.condition, input)
        : false;

      const edges = edgesBySource.get(nodeId) ?? [];
      const nextEdge = findMatchingEdge(edges, conditionMet);

      if (nextEdge) {
        return walkGraph(nextEdge.toNodeId, nodeMap, edgesBySource, input);
      }
      return { result: 'approve', reasons: [] };
    }

    case 'gate': {
      // For gates in fallback mode, evaluate as condition and follow true/false edges
      const edges = edgesBySource.get(nodeId) ?? [];
      const trueEdge = edges.find((e) => e.condition === 'true');

      if (trueEdge) {
        const conditionMet = evaluateGateCondition(node, nodeMap, edgesBySource, input);
        if (conditionMet) {
          return walkGraph(trueEdge.toNodeId, nodeMap, edgesBySource, input);
        }
        const falseEdge = edges.find((e) => e.condition === 'false');
        if (falseEdge) {
          return walkGraph(falseEdge.toNodeId, nodeMap, edgesBySource, input);
        }
        return { result: 'approve', reasons: [] };
      }

      // Dispatch gate — evaluate children
      const sortedEdges = [...edges].sort(
        (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
      );
      const childResults: SingleEvaluationResult[] = [];
      for (const edge of sortedEdges) {
        childResults.push(walkGraph(edge.toNodeId, nodeMap, edgesBySource, input));
      }
      return combineResults(childResults);
    }

    case 'action': {
      const actionResult = evaluateActionNode(node);
      const edges = edgesBySource.get(nodeId) ?? [];
      if (edges.length > 0) {
        const nextResult = walkGraph(edges[0].toNodeId, nodeMap, edgesBySource, input);
        return mergeResults(actionResult, nextResult);
      }
      return actionResult;
    }

    default:
      return { result: 'approve', reasons: [] };
  }
}

/**
 * Evaluate a condition node against the input.
 */
function evaluateConditionNode(
  condition: { field: string; operator: string; value: unknown; valueType: string },
  input: EvaluationInput
): boolean {
  const fieldValue = resolveField(condition.field, input);
  const targetValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return fieldValue === targetValue;
    case 'neq':
      return fieldValue !== targetValue;
    case 'gt':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue > targetValue;
    case 'gte':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue >= targetValue;
    case 'lt':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue < targetValue;
    case 'lte':
      return typeof fieldValue === 'number' && typeof targetValue === 'number' && fieldValue <= targetValue;
    case 'in':
      return Array.isArray(targetValue) && targetValue.includes(fieldValue);
    case 'not_in':
      return Array.isArray(targetValue) && !targetValue.includes(fieldValue);
    case 'contains':
      return typeof fieldValue === 'string' && typeof targetValue === 'string' && fieldValue.includes(targetValue);
    case 'matches':
      if (typeof fieldValue === 'string' && typeof targetValue === 'string') {
        try {
          return new RegExp(targetValue).test(fieldValue);
        } catch {
          return false;
        }
      }
      return false;
    case 'between':
      if (typeof fieldValue === 'number' && typeof targetValue === 'object' && targetValue !== null) {
        const range = targetValue as { low: number; high: number };
        return fieldValue >= range.low && fieldValue <= range.high;
      }
      return false;
    default:
      return false;
  }
}

/**
 * Resolve a dotted field path against the evaluation input.
 */
function resolveField(field: string, input: EvaluationInput): unknown {
  const parts = field.split('.');
  const prefix = parts[0];
  const rest = parts.slice(1);

  let obj: Record<string, unknown> | undefined;
  switch (prefix) {
    case 'traveller':
      obj = input.traveller;
      break;
    case 'trip':
      obj = input.trip;
      break;
    case 'offer':
      obj = input.offer;
      break;
    default:
      // Try all contexts for single-segment fields
      if (parts.length === 1) {
        if (input.traveller && field in input.traveller) return input.traveller[field];
        if (input.trip && field in input.trip) return input.trip[field];
        if (input.offer && field in input.offer) return input.offer[field];
      }
      return undefined;
  }

  if (!obj) return undefined;

  // Navigate nested path
  let current: unknown = obj;
  for (const part of rest) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Evaluate an action node and return its result.
 */
function evaluateActionNode(node: PolicyNode): SingleEvaluationResult {
  if (!node.action) {
    return { result: 'approve', reasons: [] };
  }

  switch (node.action.type) {
    case 'approve':
      return { result: 'approve', reasons: [] };
    case 'reject':
      return {
        result: 'reject',
        reasons: node.action.params['reason'] ? [String(node.action.params['reason'])] : [],
      };
    case 'review':
      return {
        result: 'review',
        reasons: node.action.params['reason'] ? [String(node.action.params['reason'])] : [],
      };
    case 'add_obligation':
      return { result: 'review', reasons: [] };
    case 'warn':
      return {
        result: 'approve',
        reasons: node.action.params['message'] ? [String(node.action.params['message'])] : [],
      };
    default:
      return { result: 'approve', reasons: [] };
  }
}

/**
 * Find the matching edge based on condition evaluation result.
 */
function findMatchingEdge(edges: PolicyEdge[], conditionMet: boolean): PolicyEdge | undefined {
  const conditionLabel = conditionMet ? 'true' : 'false';
  const matchingEdge = edges.find((e) => e.condition === conditionLabel);
  if (matchingEdge) return matchingEdge;
  return edges.find((e) => e.condition === 'default' || !e.condition);
}

/**
 * Merge two evaluation results (most restrictive wins).
 */
function mergeResults(a: SingleEvaluationResult, b: SingleEvaluationResult): SingleEvaluationResult {
  const resultPriority = (r: PolicyResult): number => {
    switch (r) {
      case 'reject': return 3;
      case 'review': return 2;
      case 'approve': return 1;
      default: return 0;
    }
  };

  const result = resultPriority(a.result) >= resultPriority(b.result) ? a.result : b.result;
  const reasons = [...new Set([...a.reasons, ...b.reasons])];
  return { result, reasons };
}

/**
 * Combine multiple results into one (most restrictive wins).
 */
function combineResults(results: SingleEvaluationResult[]): SingleEvaluationResult {
  if (results.length === 0) return { result: 'approve', reasons: [] };
  return results.reduce((acc, r) => mergeResults(acc, r));
}

/**
 * Get the total cost of a trip from its offers.
 */
function getTripTotalCost(trip: PolicyDecisionRequest): number {
  if (trip.offers.length === 0) return 0;
  return trip.offers.reduce((sum, offer) => sum + offer.totalPrice.amount, 0);
}

/**
 * Build a human-readable reason for a changed outcome.
 */
function buildChangeReason(
  activeResult: SingleEvaluationResult,
  draftResult: SingleEvaluationResult
): string {
  const draftReasons = draftResult.reasons.length > 0
    ? `: ${draftResult.reasons.join('; ')}`
    : '';
  return `Changed from ${activeResult.result} to ${draftResult.result}${draftReasons}`;
}

/**
 * Flatten an object for field resolution.
 */
function flattenObject(obj: unknown): Record<string, unknown> {
  if (obj === null || obj === undefined) return {};
  if (typeof obj !== 'object') return {};
  return obj as Record<string, unknown>;
}

function roundToFourDecimals(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function roundToTwoDecimals(n: number): number {
  return Math.round(n * 100) / 100;
}
