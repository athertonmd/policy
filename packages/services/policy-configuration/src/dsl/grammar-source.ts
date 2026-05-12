/**
 * Embedded PEG grammar source for the Travel Policy DSL.
 * This avoids file system dependencies at runtime.
 */

export const GRAMMAR_SOURCE = `
/**
 * PEG Grammar for the Travel Policy DSL
 */

{{
function buildLogicalTree(head, tail) {
  return tail.reduce((left, [, , op, , right]) => ({
    type: 'logical',
    operator: op,
    left,
    right,
    location: location()
  }), head);
}
}}

// --- Document ---

PolicyDocument
  = _ rules:Rule+ _ {
      return { type: 'document', rules };
    }

// --- Rule ---

Rule
  = _ "rule" __ name:StringLiteral _ priority:Priority? _
    "when" _ conditions:ConditionBlock _
    "then" _ actions:ActionBlock _ {
      return {
        type: 'rule',
        name,
        priority,
        conditions,
        actions,
        location: location()
      };
    }

Priority
  = "priority" __ value:Integer {
      return value;
    }

// --- Condition Block ---

ConditionBlock
  = head:ConditionOr {
      return head;
    }

ConditionOr
  = head:ConditionAnd tail:(_ "OR" _ ConditionAnd)* {
      return tail.length === 0 ? head : tail.reduce((left, [, op, , right]) => ({
        type: 'logical',
        operator: 'OR',
        left,
        right,
        location: location()
      }), head);
    }

ConditionAnd
  = head:ConditionUnary tail:(_ "AND" _ ConditionUnary)* {
      return tail.length === 0 ? head : tail.reduce((left, [, op, , right]) => ({
        type: 'logical',
        operator: 'AND',
        left,
        right,
        location: location()
      }), head);
    }

ConditionUnary
  = "NOT" _ "(" _ expr:ConditionBlock _ ")" {
      return {
        type: 'not',
        expression: expr,
        location: location()
      };
    }
  / "(" _ expr:ConditionBlock _ ")" {
      return {
        type: 'grouped',
        expression: expr,
        location: location()
      };
    }
  / Comparison

// --- Comparison ---

Comparison
  = field:FieldRef _ op:BetweenOp _ low:Value _ "and" _ high:Value {
      return {
        type: 'comparison',
        field,
        operator: op,
        value: { type: 'between', low, high },
        location: location()
      };
    }
  / field:FieldRef _ op:ComparisonOp _ value:Value {
      return {
        type: 'comparison',
        field,
        operator: op,
        value,
        location: location()
      };
    }

FieldRef
  = head:Identifier tail:("." Identifier)* {
      return [head, ...tail.map(t => t[1])].join('.');
    }

BetweenOp
  = "between" { return 'between'; }

ComparisonOp
  = "==" { return '=='; }
  / "!=" { return '!='; }
  / ">=" { return '>='; }
  / "<=" { return '<='; }
  / ">" { return '>'; }
  / "<" { return '<'; }
  / "not in" { return 'not in'; }
  / "in" { return 'in'; }
  / "contains" { return 'contains'; }
  / "matches" { return 'matches'; }

// --- Action Block ---

ActionBlock
  = head:Action tail:(_ Action)* {
      return [head, ...tail.map(t => t[1])];
    }

Action
  = ApproveAction
  / RejectAction
  / WarnAction
  / SuggestAction
  / ObligationAction

ApproveAction
  = "approve" !IdentifierChar {
      return { type: 'approve', location: location() };
    }

RejectAction
  = "reject" __ "with" __ "reason" __ reason:StringLiteral {
      return { type: 'reject', reason, location: location() };
    }

WarnAction
  = "warn" __ message:StringLiteral {
      return { type: 'warn', message, location: location() };
    }

SuggestAction
  = "suggest" __ "alternative" __ "where" __ condition:Comparison {
      return { type: 'suggest', condition, location: location() };
    }

ObligationAction
  = "require" __ obligation:ObligationType {
      return { type: 'obligation', obligation, location: location() };
    }

ObligationType
  = "manager_approval" { return 'manager_approval'; }
  / "finance_approval" { return 'finance_approval'; }
  / "justification" { return 'justification'; }
  / "approval" { return 'approval'; }

// --- Values ---

Value
  = DateLiteral
  / ArrayLiteral
  / StringLiteral_
  / NumberLiteral
  / BooleanLiteral

StringLiteral
  = '"' chars:DoubleStringChar* '"' {
      return chars.join('');
    }

StringLiteral_
  = '"' chars:DoubleStringChar* '"' {
      return { type: 'string', value: chars.join('') };
    }

DoubleStringChar
  = '\\\\' char:EscapeChar { return char; }
  / [^"\\\\]

EscapeChar
  = '"' { return '"'; }
  / '\\\\' { return '\\\\'; }
  / 'n' { return '\\n'; }
  / 't' { return '\\t'; }
  / 'r' { return '\\r'; }

NumberLiteral
  = sign:"-"? digits:[0-9]+ decimal:("." [0-9]+)? {
      const numStr = (sign || '') + digits.join('') + (decimal ? '.' + decimal[1].join('') : '');
      return { type: 'number', value: parseFloat(numStr) };
    }

BooleanLiteral
  = "true" !IdentifierChar { return { type: 'boolean', value: true }; }
  / "false" !IdentifierChar { return { type: 'boolean', value: false }; }

ArrayLiteral
  = "[" _ head:Value tail:(_ "," _ Value)* _ "]" {
      return { type: 'array', elements: [head, ...tail.map(t => t[3])] };
    }
  / "[" _ "]" {
      return { type: 'array', elements: [] };
    }

DateLiteral
  = "@" year:$([0-9][0-9][0-9][0-9]) "-" month:$([0-9][0-9]) "-" day:$([0-9][0-9]) time:("T" $([0-9][0-9] ":" [0-9][0-9] (":" [0-9][0-9])?))? {
      const dateStr = year + '-' + month + '-' + day + (time ? 'T' + time[1] : '');
      return { type: 'date', value: dateStr };
    }

Integer
  = digits:[0-9]+ {
      return parseInt(digits.join(''), 10);
    }

Identifier
  = head:[a-zA-Z_] tail:[a-zA-Z0-9_]* {
      return head + tail.join('');
    }

IdentifierChar
  = [a-zA-Z0-9_]

// --- Whitespace and Comments ---

_  "whitespace"
  = (WhitespaceChar / Comment)*

__ "mandatory whitespace"
  = (WhitespaceChar / Comment)+

WhitespaceChar
  = [ \\t\\n\\r]

Comment
  = "//" [^\\n\\r]* [\\n\\r]?
`;
