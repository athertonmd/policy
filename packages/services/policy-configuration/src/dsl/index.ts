/**
 * Policy DSL Parser and Compiler module
 *
 * Provides parsing of the Travel Policy DSL into an AST,
 * with detailed error reporting including line/column positions,
 * compilation of the AST into a PolicyGraph DAG,
 * and pretty printing of PolicyGraph back to DSL text.
 */

export { parse, DSLParseError, resetParser } from './parser.js';
export { compile } from './compiler.js';
export { prettyPrint } from './pretty-printer.js';
export type {
  PolicyDocument,
  RuleNode,
  ConditionExpression,
  ComparisonCondition,
  LogicalExpression,
  NotExpression,
  GroupedExpression,
  ComparisonOperator,
  ValueNode,
  StringValue,
  NumberValue,
  BooleanValue,
  ArrayValue,
  DateValue,
  BetweenValue,
  ActionNode,
  ApproveAction,
  RejectAction,
  WarnAction,
  SuggestAction,
  ObligationAction,
  ObligationType,
  SourceLocation,
  Position,
  ParseError,
} from './ast.js';
