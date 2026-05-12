import { describe, it, expect, beforeEach } from 'vitest';
import { parse, DSLParseError, resetParser } from './parser.js';
import type {
  PolicyDocument,
  ComparisonCondition,
  LogicalExpression,
  NotExpression,
  GroupedExpression,
} from './ast.js';

beforeEach(() => {
  resetParser();
});

describe('DSL Parser', () => {
  describe('valid rule parsing', () => {
    it('parses a simple rule with approve action', () => {
      const dsl = `
        rule "Allow All" priority 100
          when
            trip.type == "domestic"
          then
            approve
      `;

      const result = parse(dsl);

      expect(result.type).toBe('document');
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].name).toBe('Allow All');
      expect(result.rules[0].priority).toBe(100);
      expect(result.rules[0].actions).toHaveLength(1);
      expect(result.rules[0].actions[0].type).toBe('approve');
    });

    it('parses a rule without priority', () => {
      const dsl = `
        rule "No Priority Rule"
          when
            trip.type == "international"
          then
            approve
      `;

      const result = parse(dsl);

      expect(result.rules[0].name).toBe('No Priority Rule');
      expect(result.rules[0].priority).toBeNull();
    });

    it('parses the example from the design document', () => {
      const dsl = `
        rule "Economy Only for Short Trips" priority 100
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            reject with reason "Short domestic trips must use economy class"
            suggest alternative where offer.cabinClass == "economy"
      `;

      const result = parse(dsl);

      expect(result.rules).toHaveLength(1);
      const rule = result.rules[0];
      expect(rule.name).toBe('Economy Only for Short Trips');
      expect(rule.priority).toBe(100);
      expect(rule.actions).toHaveLength(2);
      expect(rule.actions[0].type).toBe('reject');
      expect(rule.actions[1].type).toBe('suggest');
    });

    it('parses multiple rules in a document', () => {
      const dsl = `
        rule "Rule One" priority 100
          when
            trip.type == "domestic"
          then
            approve

        rule "Rule Two" priority 200
          when
            trip.type == "international"
          then
            reject with reason "Not allowed"
      `;

      const result = parse(dsl);

      expect(result.rules).toHaveLength(2);
      expect(result.rules[0].name).toBe('Rule One');
      expect(result.rules[1].name).toBe('Rule Two');
    });

    it('parses the senior staff example from design', () => {
      const dsl = `
        rule "Senior Staff Premium" priority 200
          when
            traveller.seniorityLevel in ["director", "vp", "c-suite"]
          then
            approve
      `;

      const result = parse(dsl);

      const rule = result.rules[0];
      expect(rule.name).toBe('Senior Staff Premium');
      const condition = rule.conditions as ComparisonCondition;
      expect(condition.type).toBe('comparison');
      expect(condition.field).toBe('traveller.seniorityLevel');
      expect(condition.operator).toBe('in');
      expect(condition.value).toEqual({
        type: 'array',
        elements: [
          { type: 'string', value: 'director' },
          { type: 'string', value: 'vp' },
          { type: 'string', value: 'c-suite' },
        ],
      });
    });
  });

  describe('comparison operators', () => {
    const operators = [
      { op: '==', field: 'a.b', value: '"test"', expectedOp: '==' },
      { op: '!=', field: 'a.b', value: '"test"', expectedOp: '!=' },
      { op: '>', field: 'a.b', value: '10', expectedOp: '>' },
      { op: '>=', field: 'a.b', value: '10', expectedOp: '>=' },
      { op: '<', field: 'a.b', value: '10', expectedOp: '<' },
      { op: '<=', field: 'a.b', value: '10', expectedOp: '<=' },
      { op: 'in', field: 'a.b', value: '["x", "y"]', expectedOp: 'in' },
      { op: 'not in', field: 'a.b', value: '["x"]', expectedOp: 'not in' },
      { op: 'contains', field: 'a.b', value: '"sub"', expectedOp: 'contains' },
      { op: 'matches', field: 'a.b', value: '"^test.*"', expectedOp: 'matches' },
    ];

    for (const { op, field, value, expectedOp } of operators) {
      it(`parses the "${op}" operator`, () => {
        const dsl = `
          rule "Test" priority 1
            when
              ${field} ${op} ${value}
            then
              approve
        `;

        const result = parse(dsl);
        const condition = result.rules[0].conditions as ComparisonCondition;
        expect(condition.operator).toBe(expectedOp);
      });
    }

    it('parses the "between" operator', () => {
      const dsl = `
        rule "Test Between" priority 1
          when
            trip.cost between 100 and 500
          then
            approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.operator).toBe('between');
      expect(condition.value).toEqual({
        type: 'between',
        low: { type: 'number', value: 100 },
        high: { type: 'number', value: 500 },
      });
    });
  });

  describe('logical operators and grouping', () => {
    it('parses AND conditions', () => {
      const dsl = `
        rule "Test AND" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
          then
            approve
      `;

      const result = parse(dsl);
      const conditions = result.rules[0].conditions as LogicalExpression;
      expect(conditions.type).toBe('logical');
      expect(conditions.operator).toBe('AND');
    });

    it('parses OR conditions', () => {
      const dsl = `
        rule "Test OR" priority 1
          when
            trip.type == "domestic"
            OR trip.type == "regional"
          then
            approve
      `;

      const result = parse(dsl);
      const conditions = result.rules[0].conditions as LogicalExpression;
      expect(conditions.type).toBe('logical');
      expect(conditions.operator).toBe('OR');
    });

    it('parses mixed AND/OR with correct precedence (AND binds tighter)', () => {
      const dsl = `
        rule "Test Precedence" priority 1
          when
            a.x == 1
            OR b.y == 2
            AND c.z == 3
          then
            approve
      `;

      const result = parse(dsl);
      const conditions = result.rules[0].conditions as LogicalExpression;
      // OR is at the top level since AND binds tighter
      expect(conditions.type).toBe('logical');
      expect(conditions.operator).toBe('OR');
      // Right side should be AND
      const right = conditions.right as LogicalExpression;
      expect(right.type).toBe('logical');
      expect(right.operator).toBe('AND');
    });

    it('parses NOT expressions', () => {
      const dsl = `
        rule "Test NOT" priority 1
          when
            NOT (trip.type == "domestic")
          then
            approve
      `;

      const result = parse(dsl);
      const conditions = result.rules[0].conditions as NotExpression;
      expect(conditions.type).toBe('not');
      const inner = conditions.expression as ComparisonCondition;
      expect(inner.type).toBe('comparison');
      expect(inner.field).toBe('trip.type');
    });

    it('parses parenthesized expressions for grouping', () => {
      const dsl = `
        rule "Test Grouping" priority 1
          when
            (trip.type == "domestic" OR trip.type == "regional")
            AND trip.duration <= 5
          then
            approve
      `;

      const result = parse(dsl);
      const conditions = result.rules[0].conditions as LogicalExpression;
      expect(conditions.type).toBe('logical');
      expect(conditions.operator).toBe('AND');
      // Left side should be a grouped expression containing OR
      const left = conditions.left as GroupedExpression;
      expect(left.type).toBe('grouped');
      const inner = left.expression as LogicalExpression;
      expect(inner.operator).toBe('OR');
    });
  });

  describe('action types', () => {
    it('parses approve action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then approve
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({ type: 'approve' });
    });

    it('parses reject with reason action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then reject with reason "Not allowed for this trip type"
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'reject',
        reason: 'Not allowed for this trip type',
      });
    });

    it('parses warn action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then warn "This booking exceeds budget guidelines"
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'warn',
        message: 'This booking exceeds budget guidelines',
      });
    });

    it('parses suggest alternative action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then suggest alternative where offer.cabinClass == "economy"
      `;

      const result = parse(dsl);
      const action = result.rules[0].actions[0];
      expect(action.type).toBe('suggest');
      if (action.type === 'suggest') {
        expect(action.condition.field).toBe('offer.cabinClass');
        expect(action.condition.operator).toBe('==');
      }
    });

    it('parses require approval action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then require approval
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'obligation',
        obligation: 'approval',
      });
    });

    it('parses require justification action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then require justification
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'obligation',
        obligation: 'justification',
      });
    });

    it('parses require manager_approval action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then require manager_approval
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'obligation',
        obligation: 'manager_approval',
      });
    });

    it('parses require finance_approval action', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "any"
          then require finance_approval
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions[0]).toMatchObject({
        type: 'obligation',
        obligation: 'finance_approval',
      });
    });

    it('parses multiple actions in a rule', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.cost > 5000
          then
            warn "High cost booking"
            require manager_approval
            require justification
      `;

      const result = parse(dsl);
      expect(result.rules[0].actions).toHaveLength(3);
      expect(result.rules[0].actions[0].type).toBe('warn');
      expect(result.rules[0].actions[1].type).toBe('obligation');
      expect(result.rules[0].actions[2].type).toBe('obligation');
    });
  });

  describe('value types', () => {
    it('parses string values', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type == "business"
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'string', value: 'business' });
    });

    it('parses integer values', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.duration == 5
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'number', value: 5 });
    });

    it('parses decimal values', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.cost > 99.99
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'number', value: 99.99 });
    });

    it('parses negative numbers', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.offset > -5
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'number', value: -5 });
    });

    it('parses boolean true', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.isUrgent == true
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'boolean', value: true });
    });

    it('parses boolean false', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.isUrgent == false
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'boolean', value: false });
    });

    it('parses array values', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.type in ["domestic", "regional", "international"]
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({
        type: 'array',
        elements: [
          { type: 'string', value: 'domestic' },
          { type: 'string', value: 'regional' },
          { type: 'string', value: 'international' },
        ],
      });
    });

    it('parses empty arrays', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.tags in []
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'array', elements: [] });
    });

    it('parses date literals', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.departureDate > @2024-06-15
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'date', value: '2024-06-15' });
    });

    it('parses date-time literals', () => {
      const dsl = `
        rule "Test" priority 1
          when trip.departureDate > @2024-06-15T14:30
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.value).toEqual({ type: 'date', value: '2024-06-15T14:30' });
    });
  });

  describe('comments handling', () => {
    it('ignores single-line comments', () => {
      const dsl = `
        // This is a comment
        rule "Test" priority 1
          when
            // Check trip type
            trip.type == "domestic"
          then
            // Approve domestic trips
            approve
      `;

      const result = parse(dsl);
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].name).toBe('Test');
    });

    it('handles comments at end of lines', () => {
      const dsl = `
        rule "Test" priority 1 // rule definition
          when
            trip.type == "domestic" // only domestic
          then
            approve // auto-approve
      `;

      const result = parse(dsl);
      expect(result.rules).toHaveLength(1);
    });
  });

  describe('field references', () => {
    it('parses simple field references', () => {
      const dsl = `
        rule "Test" priority 1
          when fieldName == "value"
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.field).toBe('fieldName');
    });

    it('parses dot-notation field references', () => {
      const dsl = `
        rule "Test" priority 1
          when traveller.department.name == "Engineering"
          then approve
      `;

      const result = parse(dsl);
      const condition = result.rules[0].conditions as ComparisonCondition;
      expect(condition.field).toBe('traveller.department.name');
    });
  });

  describe('error reporting', () => {
    it('throws DSLParseError for syntax errors', () => {
      const dsl = `
        rule "Test" priority 1
          when
            trip.type ==
          then
            approve
      `;

      expect(() => parse(dsl)).toThrow(DSLParseError);
    });

    it('includes line and column in error', () => {
      const dsl = `rule "Test" priority 1
  when
    !!!
  then
    approve`;

      try {
        parse(dsl);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DSLParseError);
        const parseError = error as DSLParseError;
        expect(parseError.line).toBeGreaterThan(0);
        expect(parseError.column).toBeGreaterThan(0);
      }
    });

    it('includes expected tokens in error', () => {
      const dsl = `rule "Test" priority 1 when then approve`;

      try {
        parse(dsl);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DSLParseError);
        const parseError = error as DSLParseError;
        expect(parseError.expected.length).toBeGreaterThan(0);
      }
    });

    it('reports error for missing rule name', () => {
      const dsl = `rule priority 1 when trip.type == "x" then approve`;

      expect(() => parse(dsl)).toThrow(DSLParseError);
    });

    it('reports error for missing when block', () => {
      const dsl = `rule "Test" priority 1 then approve`;

      expect(() => parse(dsl)).toThrow(DSLParseError);
    });

    it('reports error for missing then block', () => {
      const dsl = `rule "Test" priority 1 when trip.type == "x"`;

      expect(() => parse(dsl)).toThrow(DSLParseError);
    });

    it('provides toJSON method on error', () => {
      try {
        parse('invalid!!!');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(DSLParseError);
        const parseError = error as DSLParseError;
        const json = parseError.toJSON();
        expect(json).toHaveProperty('message');
        expect(json).toHaveProperty('line');
        expect(json).toHaveProperty('column');
        expect(json).toHaveProperty('expected');
        expect(json).toHaveProperty('found');
      }
    });
  });

  describe('whitespace handling', () => {
    it('handles minimal whitespace', () => {
      const dsl = `rule "Test" priority 1 when trip.type == "x" then approve`;

      const result = parse(dsl);
      expect(result.rules).toHaveLength(1);
    });

    it('handles excessive whitespace', () => {
      const dsl = `

        rule    "Test"    priority    1

          when

            trip.type    ==    "x"

          then

            approve

      `;

      const result = parse(dsl);
      expect(result.rules).toHaveLength(1);
    });

    it('handles tabs and mixed whitespace', () => {
      const dsl = `rule\t"Test"\tpriority\t1\n\twhen\n\t\ttrip.type == "x"\n\tthen\n\t\tapprove`;

      const result = parse(dsl);
      expect(result.rules).toHaveLength(1);
    });
  });

  describe('location tracking', () => {
    it('includes location info on rule nodes', () => {
      const dsl = `rule "Test" priority 1 when trip.type == "x" then approve`;

      const result = parse(dsl);
      const rule = result.rules[0];
      expect(rule.location).toBeDefined();
      expect(rule.location.start).toHaveProperty('line');
      expect(rule.location.start).toHaveProperty('column');
      expect(rule.location.start).toHaveProperty('offset');
    });
  });
});
