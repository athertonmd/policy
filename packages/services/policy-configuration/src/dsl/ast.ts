/**
 * AST Node type definitions for the Policy DSL.
 * These types represent the parsed structure of a DSL document
 * before it is compiled into a PolicyGraph.
 *
 * Validates: Requirements 22.1, 22.5
 */

/** Root node of a parsed DSL document */
export interface PolicyDocument {
  type: 'document';
  rules: RuleNode[];
}

/** A single policy rule declaration */
export interface RuleNode {
  type: 'rule';
  name: string;
  priority: number | null;
  conditions: ConditionExpression;
  actions: ActionNode[];
  location: SourceLocation;
}

/** Source location for error reporting */
export interface SourceLocation {
  start: Position;
  end: Position;
}

export interface Position {
  line: number;
  column: number;
  offset: number;
}

// --- Condition Expressions ---

export type ConditionExpression =
  | ComparisonCondition
  | LogicalExpression
  | NotExpression
  | GroupedExpression;

/** A comparison between a field reference and a value */
export interface ComparisonCondition {
  type: 'comparison';
  field: string;
  operator: ComparisonOperator;
  value: ValueNode;
  location: SourceLocation;
}

/** Logical combination of conditions (AND/OR) */
export interface LogicalExpression {
  type: 'logical';
  operator: 'AND' | 'OR';
  left: ConditionExpression;
  right: ConditionExpression;
  location: SourceLocation;
}

/** NOT expression wrapping a condition */
export interface NotExpression {
  type: 'not';
  expression: ConditionExpression;
  location: SourceLocation;
}

/** Parenthesized expression for grouping */
export interface GroupedExpression {
  type: 'grouped';
  expression: ConditionExpression;
  location: SourceLocation;
}

/** All supported comparison operators */
export type ComparisonOperator =
  | '=='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'in'
  | 'not in'
  | 'contains'
  | 'matches'
  | 'between';

// --- Value Nodes ---

export type ValueNode =
  | StringValue
  | NumberValue
  | BooleanValue
  | ArrayValue
  | DateValue
  | BetweenValue;

export interface StringValue {
  type: 'string';
  value: string;
}

export interface NumberValue {
  type: 'number';
  value: number;
}

export interface BooleanValue {
  type: 'boolean';
  value: boolean;
}

export interface ArrayValue {
  type: 'array';
  elements: ValueNode[];
}

export interface DateValue {
  type: 'date';
  value: string;
}

/** Value for 'between' operator: two bounds */
export interface BetweenValue {
  type: 'between';
  low: ValueNode;
  high: ValueNode;
}

// --- Action Nodes ---

export type ActionNode =
  | ApproveAction
  | RejectAction
  | WarnAction
  | SuggestAction
  | ObligationAction;

export interface ApproveAction {
  type: 'approve';
  location: SourceLocation;
}

export interface RejectAction {
  type: 'reject';
  reason: string;
  location: SourceLocation;
}

export interface WarnAction {
  type: 'warn';
  message: string;
  location: SourceLocation;
}

export interface SuggestAction {
  type: 'suggest';
  condition: ComparisonCondition;
  location: SourceLocation;
}

export type ObligationType =
  | 'approval'
  | 'justification'
  | 'manager_approval'
  | 'finance_approval';

export interface ObligationAction {
  type: 'obligation';
  obligation: ObligationType;
  location: SourceLocation;
}

// --- Parse Error ---

/** Detailed parse error with location information */
export interface ParseError {
  message: string;
  line: number;
  column: number;
  offset: number;
  expected: string[];
  found: string | null;
}
