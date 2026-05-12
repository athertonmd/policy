/**
 * DSL-to-PolicyGraph Compiler
 *
 * Transforms a parsed PolicyDocument AST into a PolicyGraph DAG structure.
 * Performs semantic validation including field reference checking and
 * operator/value type compatibility.
 *
 * Validates: Requirements 22.1, 4.1, 4.3
 */

import { randomUUID } from 'crypto';
import type {
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  PolicyGraphMetadata,
  PolicyCondition,
  PolicyAction,
  PolicyTerminal,
  PolicyRuleMetadata,
  ComparisonOp,
  CompilationResult,
  DSLError,
  DSLWarning,
} from '@travel-policy/shared';
import type { Obligation, ObligationType as SharedObligationType } from '@travel-policy/shared';
import type {
  PolicyDocument,
  RuleNode,
  ConditionExpression,
  ComparisonCondition,
  LogicalExpression,
  NotExpression,
  GroupedExpression,
  ComparisonOperator,
  ValueNode,
  ActionNode,
  ObligationType,
  SourceLocation,
} from './ast.js';

/** Valid field reference prefixes for semantic validation */
const VALID_FIELD_PREFIXES = ['traveller', 'trip', 'offer'];

/** Operators that require numeric values */
const NUMERIC_OPERATORS: ComparisonOperator[] = ['>', '>=', '<', '<=', 'between'];

/** Operators that require array values */
const ARRAY_OPERATORS: ComparisonOperator[] = ['in', 'not in'];

/**
 * Compile a PolicyDocument AST into a PolicyGraph.
 *
 * @param document - The parsed AST from the DSL parser
 * @returns CompilationResult containing either the graph or semantic errors
 */
export function compile(document: PolicyDocument): CompilationResult {
  const errors: DSLError[] = [];
  const warnings: DSLWarning[] = [];

  // Phase 1: Semantic validation
  for (const rule of document.rules) {
    validateRule(rule, errors, warnings);
  }

  if (errors.length > 0) {
    return {
      success: false,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  // Phase 2: Generate the PolicyGraph
  const nodes: PolicyNode[] = [];
  const edges: PolicyEdge[] = [];
  const ruleMetadata: PolicyRuleMetadata[] = [];

  // Create a root gate node that dispatches to each rule sub-graph
  const rootNodeId = generateNodeId();
  const rootNode: PolicyNode = {
    nodeId: rootNodeId,
    type: 'gate',
    operator: 'or',
  };
  nodes.push(rootNode);

  // Compile each rule into a sub-graph
  for (let i = 0; i < document.rules.length; i++) {
    const rule = document.rules[i];
    const ruleEntryNodeId = compileRule(rule, nodes, edges);

    // Store rule metadata for pretty printing
    ruleMetadata.push({
      name: rule.name,
      priority: rule.priority,
      entryNodeId: ruleEntryNodeId,
    });

    // Connect root to each rule's entry node with priority
    edges.push({
      fromNodeId: rootNodeId,
      toNodeId: ruleEntryNodeId,
      condition: 'default',
      priority: rule.priority ?? i,
    });
  }

  const graph: PolicyGraph = {
    graphId: randomUUID(),
    version: 1,
    rootNodeId,
    nodes,
    edges,
    metadata: buildMetadata(document, ruleMetadata),
  };

  return {
    success: true,
    policyGraph: graph,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// --- Rule Compilation ---

/**
 * Compile a single rule into nodes and edges, returning the entry node ID.
 */
function compileRule(
  rule: RuleNode,
  nodes: PolicyNode[],
  edges: PolicyEdge[]
): string {
  // Compile the condition tree
  const conditionEntryId = compileConditionExpression(rule.conditions, nodes, edges);

  // Compile actions and terminal
  const terminalNodeId = compileActions(rule, nodes, edges);

  // Connect condition true-path to the terminal
  edges.push({
    fromNodeId: conditionEntryId,
    toNodeId: terminalNodeId,
    condition: 'true',
  });

  return conditionEntryId;
}

/**
 * Recursively compile a condition expression into nodes/edges.
 * Returns the entry node ID for this sub-expression.
 */
function compileConditionExpression(
  expr: ConditionExpression,
  nodes: PolicyNode[],
  edges: PolicyEdge[]
): string {
  switch (expr.type) {
    case 'comparison':
      return compileComparison(expr, nodes);

    case 'logical':
      return compileLogical(expr, nodes, edges);

    case 'not':
      return compileNot(expr, nodes, edges);

    case 'grouped':
      return compileConditionExpression(expr.expression, nodes, edges);
  }
}

/**
 * Compile a comparison condition into a condition node.
 */
function compileComparison(
  expr: ComparisonCondition,
  nodes: PolicyNode[]
): string {
  const nodeId = generateNodeId();
  const node: PolicyNode = {
    nodeId,
    type: 'condition',
    condition: {
      field: expr.field,
      operator: mapComparisonOperator(expr.operator),
      value: extractValue(expr.value),
      valueType: 'literal',
    },
  };
  nodes.push(node);
  return nodeId;
}

/**
 * Compile a logical expression (AND/OR) into a gate node.
 */
function compileLogical(
  expr: LogicalExpression,
  nodes: PolicyNode[],
  edges: PolicyEdge[]
): string {
  const gateNodeId = generateNodeId();
  const gateNode: PolicyNode = {
    nodeId: gateNodeId,
    type: 'gate',
    operator: expr.operator.toLowerCase() as 'and' | 'or',
  };
  nodes.push(gateNode);

  // Compile left and right sub-expressions
  const leftId = compileConditionExpression(expr.left, nodes, edges);
  const rightId = compileConditionExpression(expr.right, nodes, edges);

  // Connect gate to its children
  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: leftId,
    condition: 'default',
    priority: 0,
  });
  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: rightId,
    condition: 'default',
    priority: 1,
  });

  return gateNodeId;
}

/**
 * Compile a NOT expression into a gate node with 'not' operator.
 */
function compileNot(
  expr: NotExpression,
  nodes: PolicyNode[],
  edges: PolicyEdge[]
): string {
  const gateNodeId = generateNodeId();
  const gateNode: PolicyNode = {
    nodeId: gateNodeId,
    type: 'gate',
    operator: 'not',
  };
  nodes.push(gateNode);

  const innerNodeId = compileConditionExpression(expr.expression, nodes, edges);

  edges.push({
    fromNodeId: gateNodeId,
    toNodeId: innerNodeId,
    condition: 'default',
  });

  return gateNodeId;
}

/**
 * Compile actions and create a terminal node for a rule.
 * Returns the terminal node ID.
 */
function compileActions(
  rule: RuleNode,
  nodes: PolicyNode[],
  edges: PolicyEdge[]
): string {
  const actionNodeIds: string[] = [];

  // Create action nodes for non-terminal actions (warn, suggest, obligation)
  for (const action of rule.actions) {
    const actionNode = compileActionNode(action);
    if (actionNode) {
      nodes.push(actionNode);
      actionNodeIds.push(actionNode.nodeId);
    }
  }

  // Create the terminal node
  const terminalNodeId = generateNodeId();
  const terminal = buildTerminal(rule.actions);
  const terminalNode: PolicyNode = {
    nodeId: terminalNodeId,
    type: 'terminal',
    terminal,
  };
  nodes.push(terminalNode);

  // Chain action nodes together, ending at the terminal
  if (actionNodeIds.length > 0) {
    // Chain actions sequentially
    for (let i = 0; i < actionNodeIds.length - 1; i++) {
      edges.push({
        fromNodeId: actionNodeIds[i],
        toNodeId: actionNodeIds[i + 1],
        condition: 'default',
      });
    }
    // Last action connects to terminal
    edges.push({
      fromNodeId: actionNodeIds[actionNodeIds.length - 1],
      toNodeId: terminalNodeId,
      condition: 'default',
    });

    // Return the first action node as the entry point for the action chain
    // We need to re-wire: condition -> first action -> ... -> terminal
    // The caller connects condition true-path to what we return
    return actionNodeIds[0];
  }

  return terminalNodeId;
}

/**
 * Compile a single action AST node into a PolicyNode (action type).
 * Returns null for approve/reject since those become the terminal.
 */
function compileActionNode(action: ActionNode): PolicyNode | null {
  const nodeId = generateNodeId();

  switch (action.type) {
    case 'approve':
      // Approve is represented in the terminal, not as a separate action node
      return null;

    case 'reject':
      // Reject is represented in the terminal, not as a separate action node
      return null;

    case 'warn':
      return {
        nodeId,
        type: 'action',
        action: {
          type: 'warn',
          params: { message: action.message },
        },
      };

    case 'suggest':
      return {
        nodeId,
        type: 'action',
        action: {
          type: 'suggest_alternative',
          params: {
            field: action.condition.field,
            operator: mapComparisonOperator(action.condition.operator),
            value: extractValue(action.condition.value),
          },
        },
      };

    case 'obligation':
      return {
        nodeId,
        type: 'action',
        action: {
          type: 'add_obligation',
          params: { obligationType: mapObligationType(action.obligation) },
        },
      };
  }
}

/**
 * Build a PolicyTerminal from the rule's actions.
 */
function buildTerminal(actions: ActionNode[]): PolicyTerminal {
  let result: 'approve' | 'reject' | 'review' = 'approve';
  const reasons: string[] = [];
  const obligations: Obligation[] = [];

  for (const action of actions) {
    switch (action.type) {
      case 'approve':
        result = 'approve';
        break;
      case 'reject':
        result = 'reject';
        reasons.push(action.reason);
        break;
      case 'obligation':
        // If there are obligations, the result is 'review' unless explicitly rejected
        if (result === 'approve') {
          result = 'review';
        }
        obligations.push({
          type: mapObligationType(action.obligation),
          description: `Requires ${action.obligation.replace('_', ' ')}`,
        });
        break;
      case 'warn':
        reasons.push(action.message);
        break;
    }
  }

  return { result, reasons, obligations };
}

// --- Semantic Validation ---

/**
 * Validate a rule for semantic correctness.
 */
function validateRule(
  rule: RuleNode,
  errors: DSLError[],
  warnings: DSLWarning[]
): void {
  validateConditionExpression(rule.conditions, errors, warnings);
  validateActions(rule.actions, errors, warnings);
}

/**
 * Recursively validate a condition expression.
 */
function validateConditionExpression(
  expr: ConditionExpression,
  errors: DSLError[],
  warnings: DSLWarning[]
): void {
  switch (expr.type) {
    case 'comparison':
      validateComparison(expr, errors, warnings);
      break;
    case 'logical':
      validateConditionExpression(expr.left, errors, warnings);
      validateConditionExpression(expr.right, errors, warnings);
      break;
    case 'not':
      validateConditionExpression(expr.expression, errors, warnings);
      break;
    case 'grouped':
      validateConditionExpression(expr.expression, errors, warnings);
      break;
  }
}

/**
 * Validate a comparison condition for semantic correctness.
 */
function validateComparison(
  expr: ComparisonCondition,
  errors: DSLError[],
  _warnings: DSLWarning[]
): void {
  // Validate field reference prefix
  validateFieldReference(expr.field, expr.location, errors);

  // Validate operator/value type compatibility
  validateOperatorValueCompatibility(expr, errors);
}

/**
 * Validate that a field reference uses a valid prefix.
 */
function validateFieldReference(
  field: string,
  location: SourceLocation,
  errors: DSLError[]
): void {
  const prefix = field.split('.')[0];

  // Single-segment fields (no dot) are allowed without prefix validation
  if (!field.includes('.')) {
    return;
  }

  if (!VALID_FIELD_PREFIXES.includes(prefix)) {
    errors.push({
      type: 'semantic',
      message: `Invalid field reference "${field}": unknown prefix "${prefix}". Valid prefixes are: ${VALID_FIELD_PREFIXES.join(', ')}`,
      line: location.start.line,
      column: location.start.column,
    });
  }
}

/**
 * Validate that the operator is compatible with the value type.
 */
function validateOperatorValueCompatibility(
  expr: ComparisonCondition,
  errors: DSLError[]
): void {
  const { operator, value, location } = expr;

  // Numeric operators require numeric or date values
  if (NUMERIC_OPERATORS.includes(operator)) {
    if (operator === 'between') {
      if (value.type !== 'between') {
        errors.push({
          type: 'semantic',
          message: `Operator "between" requires a range value (low and high), got "${value.type}"`,
          line: location.start.line,
          column: location.start.column,
        });
      }
    } else if (value.type !== 'number' && value.type !== 'date') {
      errors.push({
        type: 'semantic',
        message: `Operator "${operator}" requires a numeric or date value, got "${value.type}"`,
        line: location.start.line,
        column: location.start.column,
      });
    }
  }

  // Array operators require array values
  if (ARRAY_OPERATORS.includes(operator)) {
    if (value.type !== 'array') {
      errors.push({
        type: 'semantic',
        message: `Operator "${operator}" requires an array value, got "${value.type}"`,
        line: location.start.line,
        column: location.start.column,
      });
    }
  }
}

/**
 * Validate actions for semantic correctness.
 */
function validateActions(
  actions: ActionNode[],
  _errors: DSLError[],
  warnings: DSLWarning[]
): void {
  // Warn if both approve and reject are in the same rule
  const hasApprove = actions.some((a) => a.type === 'approve');
  const hasReject = actions.some((a) => a.type === 'reject');

  if (hasApprove && hasReject) {
    const rejectAction = actions.find((a) => a.type === 'reject')!;
    warnings.push({
      type: 'conflicting_actions',
      message: 'Rule contains both "approve" and "reject" actions; "reject" will take precedence',
      line: rejectAction.location.start.line,
      column: rejectAction.location.start.column,
    });
  }
}

// --- Helpers ---

/** Map AST comparison operator to PolicyGraph ComparisonOp */
function mapComparisonOperator(op: ComparisonOperator): ComparisonOp {
  const mapping: Record<ComparisonOperator, ComparisonOp> = {
    '==': 'eq',
    '!=': 'neq',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    'in': 'in',
    'not in': 'not_in',
    'contains': 'contains',
    'matches': 'matches',
    'between': 'between',
  };
  return mapping[op];
}

/** Map AST obligation type to shared ObligationType */
function mapObligationType(obligation: ObligationType): SharedObligationType {
  const mapping: Record<ObligationType, SharedObligationType> = {
    'approval': 'require_approval',
    'justification': 'require_justification',
    'manager_approval': 'manager_approval',
    'finance_approval': 'finance_approval',
  };
  return mapping[obligation];
}

/** Extract a plain value from a ValueNode */
function extractValue(node: ValueNode): unknown {
  switch (node.type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'date':
      return node.value;
    case 'array':
      return node.elements.map((el) => extractValue(el));
    case 'between':
      return { low: extractValue(node.low), high: extractValue(node.high) };
  }
}

/** Generate a unique node ID */
function generateNodeId(): string {
  return randomUUID();
}

/** Build metadata for the compiled graph */
function buildMetadata(document: PolicyDocument, rules: PolicyRuleMetadata[]): PolicyGraphMetadata {
  return {
    createdAt: new Date().toISOString(),
    compiledFrom: `dsl:${document.rules.length}-rules`,
    checksum: generateChecksum(document),
    rules,
  };
}

/** Generate a simple checksum for the document */
function generateChecksum(document: PolicyDocument): string {
  const content = JSON.stringify(document);
  // Simple hash - in production would use crypto.createHash('sha256')
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}
