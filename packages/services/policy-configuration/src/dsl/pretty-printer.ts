/**
 * Pretty Printer: PolicyGraph to DSL
 *
 * Converts a compiled PolicyGraph back into formatted DSL text.
 * Ensures round-trip consistency: parse(prettyPrint(graph)) ≡ graph
 *
 * Validates: Requirements 22.3, 22.4
 */

import type {
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  PolicyRuleMetadata,
  ComparisonOp,
} from '@travel-policy/shared';

/**
 * Pretty-print a PolicyGraph back into formatted DSL text.
 *
 * @param graph - The PolicyGraph to convert to DSL
 * @returns Formatted DSL text string
 */
export function prettyPrint(graph: PolicyGraph): string {
  const rules = graph.metadata.rules;
  if (!rules || rules.length === 0) {
    return '';
  }

  const nodeMap = buildNodeMap(graph.nodes);
  const edgeMap = buildEdgeMap(graph.edges);

  const ruleTexts: string[] = [];

  for (const ruleMeta of rules) {
    const ruleText = printRule(ruleMeta, nodeMap, edgeMap);
    ruleTexts.push(ruleText);
  }

  return ruleTexts.join('\n\n') + '\n';
}

// --- Internal Types ---

type NodeMap = Map<string, PolicyNode>;
type EdgeMap = Map<string, PolicyEdge[]>;

// --- Helpers ---

function buildNodeMap(nodes: PolicyNode[]): NodeMap {
  const map = new Map<string, PolicyNode>();
  for (const node of nodes) {
    map.set(node.nodeId, node);
  }
  return map;
}

function buildEdgeMap(edges: PolicyEdge[]): EdgeMap {
  const map = new Map<string, PolicyEdge[]>();
  for (const edge of edges) {
    const existing = map.get(edge.fromNodeId) ?? [];
    existing.push(edge);
    map.set(edge.fromNodeId, existing);
  }
  return map;
}

// --- Rule Printing ---

function printRule(
  ruleMeta: PolicyRuleMetadata,
  nodeMap: NodeMap,
  edgeMap: EdgeMap
): string {
  const lines: string[] = [];

  // Rule header
  const priorityStr = ruleMeta.priority !== null ? ` priority ${ruleMeta.priority}` : '';
  lines.push(`rule "${ruleMeta.name}"${priorityStr}`);

  // When block - reconstruct conditions from the entry node
  lines.push('  when');
  const conditionStr = printConditionNode(ruleMeta.entryNodeId, nodeMap, edgeMap);
  const conditionLines = conditionStr.split('\n');
  for (const line of conditionLines) {
    lines.push(`    ${line}`);
  }

  // Then block - find the terminal and action nodes
  const actions = collectActions(ruleMeta.entryNodeId, nodeMap, edgeMap);
  lines.push('  then');
  for (const actionStr of actions) {
    lines.push(`    ${actionStr}`);
  }

  return lines.join('\n');
}

// --- Condition Printing ---

function printConditionNode(
  nodeId: string,
  nodeMap: NodeMap,
  edgeMap: EdgeMap
): string {
  const node = nodeMap.get(nodeId);
  if (!node) {
    return '';
  }

  switch (node.type) {
    case 'condition':
      return printCondition(node);

    case 'gate':
      return printGate(node, nodeMap, edgeMap);

    default:
      return '';
  }
}

function printCondition(node: PolicyNode): string {
  const cond = node.condition!;
  const field = cond.field;
  const op = reverseMapOperator(cond.operator);
  const value = formatValue(cond.value, cond.operator);

  if (cond.operator === 'between') {
    const betweenVal = cond.value as { low: unknown; high: unknown };
    return `${field} between ${formatScalarValue(betweenVal.low)} and ${formatScalarValue(betweenVal.high)}`;
  }

  return `${field} ${op} ${value}`;
}

function printGate(
  node: PolicyNode,
  nodeMap: NodeMap,
  edgeMap: EdgeMap
): string {
  const edges = edgeMap.get(node.nodeId) ?? [];

  if (node.operator === 'not') {
    // NOT gate has a single child
    const childEdge = edges.find((e) => e.condition === 'default');
    if (!childEdge) return '';
    const innerStr = printConditionNode(childEdge.toNodeId, nodeMap, edgeMap);
    return `NOT (${innerStr})`;
  }

  if (node.operator === 'and' || node.operator === 'or') {
    // Sort children by priority to maintain order
    const sortedEdges = [...edges]
      .filter((e) => e.condition === 'default')
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    if (sortedEdges.length < 2) return '';

    const leftStr = printConditionNode(sortedEdges[0].toNodeId, nodeMap, edgeMap);
    const rightStr = printConditionNode(sortedEdges[1].toNodeId, nodeMap, edgeMap);
    const op = node.operator.toUpperCase();

    // Check if children are gates that need grouping
    const leftNode = nodeMap.get(sortedEdges[0].toNodeId);
    const rightNode = nodeMap.get(sortedEdges[1].toNodeId);

    const leftFormatted = needsGrouping(leftNode, node.operator)
      ? `(${leftStr})`
      : leftStr;
    const rightFormatted = needsGrouping(rightNode, node.operator)
      ? `(${rightStr})`
      : rightStr;

    return `${leftFormatted}\n${op} ${rightFormatted}`;
  }

  return '';
}

/**
 * Determine if a child node needs parentheses for correct precedence.
 * AND binds tighter than OR, so an OR child inside an AND parent needs grouping.
 */
function needsGrouping(
  childNode: PolicyNode | undefined,
  parentOperator: 'and' | 'or'
): boolean {
  if (!childNode || childNode.type !== 'gate') return false;
  // OR inside AND needs grouping
  if (parentOperator === 'and' && childNode.operator === 'or') return true;
  return false;
}

// --- Action Printing ---

function collectActions(
  conditionEntryId: string,
  nodeMap: NodeMap,
  edgeMap: EdgeMap
): string[] {
  // Find the true-edge from the condition entry to the action chain or terminal
  const edges = edgeMap.get(conditionEntryId) ?? [];
  const trueEdge = edges.find((e) => e.condition === 'true');
  if (!trueEdge) return ['approve'];

  const actions: string[] = [];
  let currentNodeId: string | null = trueEdge.toNodeId;

  while (currentNodeId) {
    const node = nodeMap.get(currentNodeId);
    if (!node) break;

    if (node.type === 'action') {
      actions.push(printAction(node));
      // Follow the default edge to the next node
      const nextEdges: PolicyEdge[] = edgeMap.get(currentNodeId) ?? [];
      const nextEdge = nextEdges.find((e: PolicyEdge) => e.condition === 'default');
      currentNodeId = nextEdge ? nextEdge.toNodeId : null;
    } else if (node.type === 'terminal') {
      actions.push(...printTerminal(node));
      currentNodeId = null;
    } else {
      break;
    }
  }

  return actions;
}

function printAction(node: PolicyNode): string {
  const action = node.action!;

  switch (action.type) {
    case 'warn':
      return `warn "${action.params.message}"`;

    case 'suggest_alternative': {
      const field = action.params.field as string;
      const op = reverseMapOperator(action.params.operator as ComparisonOp);
      const value = formatValue(action.params.value, action.params.operator as ComparisonOp);
      return `suggest alternative where ${field} ${op} ${value}`;
    }

    case 'add_obligation': {
      const obligationType = action.params.obligationType as string;
      const dslObligation = reverseMapObligationType(obligationType);
      return `require ${dslObligation}`;
    }

    default:
      return '';
  }
}

function printTerminal(node: PolicyNode): string[] {
  const terminal = node.terminal!;
  const actions: string[] = [];

  switch (terminal.result) {
    case 'approve':
      actions.push('approve');
      break;

    case 'reject':
      if (terminal.reasons.length > 0) {
        // Find the reject reason (not warn messages)
        // The first reason that isn't from a warn action is the reject reason
        actions.push(`reject with reason "${terminal.reasons[0]}"`);
      } else {
        actions.push('reject with reason ""');
      }
      break;

    case 'review':
      // Review is implied by obligations, no explicit action needed
      break;
  }

  return actions;
}

// --- Value Formatting ---

function formatValue(value: unknown, operator: ComparisonOp): string {
  if (operator === 'in' || operator === 'not_in') {
    return formatArrayValue(value as unknown[]);
  }
  return formatScalarValue(value);
}

function formatScalarValue(value: unknown): string {
  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(value)) {
      return `@${value}`;
    }
    return `"${value}"`;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  return String(value);
}

function formatArrayValue(value: unknown[]): string {
  const elements = value.map((el) => formatScalarValue(el));
  return `[${elements.join(', ')}]`;
}

// --- Operator Mapping ---

function reverseMapOperator(op: ComparisonOp): string {
  const mapping: Record<ComparisonOp, string> = {
    'eq': '==',
    'neq': '!=',
    'gt': '>',
    'gte': '>=',
    'lt': '<',
    'lte': '<=',
    'in': 'in',
    'not_in': 'not in',
    'contains': 'contains',
    'matches': 'matches',
    'between': 'between',
  };
  return mapping[op];
}

function reverseMapObligationType(type: string): string {
  const mapping: Record<string, string> = {
    'require_approval': 'approval',
    'require_justification': 'justification',
    'manager_approval': 'manager_approval',
    'finance_approval': 'finance_approval',
  };
  return mapping[type] ?? type;
}
