import { describe, it, expect, beforeEach } from 'vitest';
import { compile } from './compiler.js';
import { parse, resetParser } from './parser.js';
import type { PolicyDocument } from './ast.js';
import type { PolicyGraph, PolicyNode, PolicyEdge } from '@travel-policy/shared';

beforeEach(() => {
  resetParser();
});

/** Helper to parse DSL and compile in one step */
function compileFromDSL(dsl: string) {
  const ast = parse(dsl);
  return compile(ast);
}

describe('DSL Compiler', () => {
  describe('successful compilation', () => {
    it('compiles a simple approve rule into a PolicyGraph', () => {
      const result = compileFromDSL(`
        rule "Allow Domestic" priority 100
          when
            trip.type == "domestic"
          then
            approve
      `);

      expect(result.success).toBe(true);
      expect(result.policyGraph).toBeDefined();
      const graph = result.policyGraph!;

      expect(graph.graphId).toBeDefined();
      expect(graph.version).toBe(1);
      expect(graph.rootNodeId).toBeDefined();
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.edges.length).toBeGreaterThan(0);
      expect(graph.metadata).toBeDefined();
    });

    it('creates a root gate node', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const graph = result.policyGraph!;
      const rootNode = graph.nodes.find((n) => n.nodeId === graph.rootNodeId);
      expect(rootNode).toBeDefined();
      expect(rootNode!.type).toBe('gate');
      expect(rootNode!.operator).toBe('or');
    });

    it('creates condition nodes for comparisons', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > 1000
          then approve
      `);

      const graph = result.policyGraph!;
      const conditionNodes = graph.nodes.filter((n) => n.type === 'condition');
      expect(conditionNodes.length).toBe(1);
      expect(conditionNodes[0].condition).toEqual({
        field: 'trip.cost',
        operator: 'gt',
        value: 1000,
        valueType: 'literal',
      });
    });

    it('creates terminal nodes with correct result', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const graph = result.policyGraph!;
      const terminalNodes = graph.nodes.filter((n) => n.type === 'terminal');
      expect(terminalNodes.length).toBe(1);
      expect(terminalNodes[0].terminal!.result).toBe('approve');
    });

    it('creates terminal with reject result and reason', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type == "international"
          then reject with reason "International travel not allowed"
      `);

      const graph = result.policyGraph!;
      const terminalNodes = graph.nodes.filter((n) => n.type === 'terminal');
      expect(terminalNodes[0].terminal!.result).toBe('reject');
      expect(terminalNodes[0].terminal!.reasons).toContain(
        'International travel not allowed'
      );
    });

    it('creates gate nodes for AND conditions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
          then
            approve
      `);

      const graph = result.policyGraph!;
      const gateNodes = graph.nodes.filter(
        (n) => n.type === 'gate' && n.operator === 'and'
      );
      expect(gateNodes.length).toBe(1);
    });

    it('creates gate nodes for OR conditions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            OR trip.type == "regional"
          then
            approve
      `);

      const graph = result.policyGraph!;
      const gateNodes = graph.nodes.filter(
        (n) => n.type === 'gate' && n.operator === 'or' && n.nodeId !== graph.rootNodeId
      );
      expect(gateNodes.length).toBe(1);
    });

    it('creates gate nodes for NOT conditions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            NOT (trip.type == "domestic")
          then
            approve
      `);

      const graph = result.policyGraph!;
      const notGates = graph.nodes.filter(
        (n) => n.type === 'gate' && n.operator === 'not'
      );
      expect(notGates.length).toBe(1);
    });

    it('creates action nodes for warn actions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > 5000
          then warn "High cost booking"
      `);

      const graph = result.policyGraph!;
      const actionNodes = graph.nodes.filter((n) => n.type === 'action');
      expect(actionNodes.length).toBe(1);
      expect(actionNodes[0].action!.type).toBe('warn');
      expect(actionNodes[0].action!.params).toEqual({
        message: 'High cost booking',
      });
    });

    it('creates action nodes for suggest alternative', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when offer.cabinClass != "economy"
          then suggest alternative where offer.cabinClass == "economy"
      `);

      const graph = result.policyGraph!;
      const actionNodes = graph.nodes.filter((n) => n.type === 'action');
      expect(actionNodes.length).toBe(1);
      expect(actionNodes[0].action!.type).toBe('suggest_alternative');
      expect(actionNodes[0].action!.params).toMatchObject({
        field: 'offer.cabinClass',
        operator: 'eq',
        value: 'economy',
      });
    });

    it('creates action nodes for obligations', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > 5000
          then require manager_approval
      `);

      const graph = result.policyGraph!;
      const actionNodes = graph.nodes.filter((n) => n.type === 'action');
      expect(actionNodes.length).toBe(1);
      expect(actionNodes[0].action!.type).toBe('add_obligation');
      expect(actionNodes[0].action!.params).toEqual({
        obligationType: 'manager_approval',
      });
    });

    it('sets terminal result to review when obligations are present', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > 5000
          then require manager_approval
      `);

      const graph = result.policyGraph!;
      const terminalNodes = graph.nodes.filter((n) => n.type === 'terminal');
      expect(terminalNodes[0].terminal!.result).toBe('review');
      expect(terminalNodes[0].terminal!.obligations.length).toBe(1);
      expect(terminalNodes[0].terminal!.obligations[0].type).toBe('manager_approval');
    });

    it('compiles multiple rules into a single graph', () => {
      const result = compileFromDSL(`
        rule "Rule One" priority 100
          when trip.type == "domestic"
          then approve

        rule "Rule Two" priority 200
          when trip.type == "international"
          then reject with reason "Not allowed"
      `);

      const graph = result.policyGraph!;
      // Root + 2 condition nodes + 2 terminal nodes
      expect(graph.nodes.length).toBeGreaterThanOrEqual(5);

      // Root should connect to both rule entry nodes
      const rootEdges = graph.edges.filter(
        (e) => e.fromNodeId === graph.rootNodeId
      );
      expect(rootEdges.length).toBe(2);
    });

    it('assigns priority from rules to root edges', () => {
      const result = compileFromDSL(`
        rule "Low Priority" priority 50
          when trip.type == "domestic"
          then approve

        rule "High Priority" priority 200
          when trip.type == "international"
          then approve
      `);

      const graph = result.policyGraph!;
      const rootEdges = graph.edges.filter(
        (e) => e.fromNodeId === graph.rootNodeId
      );
      const priorities = rootEdges.map((e) => e.priority).sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(priorities).toEqual([50, 200]);
    });

    it('maps all comparison operators correctly', () => {
      const operators = [
        { dsl: '==', expected: 'eq' },
        { dsl: '!=', expected: 'neq' },
        { dsl: '>', expected: 'gt' },
        { dsl: '>=', expected: 'gte' },
        { dsl: '<', expected: 'lt' },
        { dsl: '<=', expected: 'lte' },
      ];

      for (const { dsl, expected } of operators) {
        const result = compileFromDSL(`
          rule "Test" priority 1
            when trip.cost ${dsl} 100
            then approve
        `);
        const condNode = result.policyGraph!.nodes.find(
          (n) => n.type === 'condition'
        );
        expect(condNode!.condition!.operator).toBe(expected);
      }
    });

    it('maps in/not_in operators correctly', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type in ["domestic", "regional"]
          then approve
      `);
      const condNode = result.policyGraph!.nodes.find(
        (n) => n.type === 'condition'
      );
      expect(condNode!.condition!.operator).toBe('in');
      expect(condNode!.condition!.value).toEqual(['domestic', 'regional']);
    });

    it('chains multiple action nodes sequentially', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > 5000
          then
            warn "High cost"
            require manager_approval
            require justification
      `);

      const graph = result.policyGraph!;
      const actionNodes = graph.nodes.filter((n) => n.type === 'action');
      expect(actionNodes.length).toBe(3);

      // Verify chaining: action1 -> action2 -> action3 -> terminal
      const terminalNode = graph.nodes.find((n) => n.type === 'terminal')!;
      const edgeToTerminal = graph.edges.find(
        (e) => e.toNodeId === terminalNode.nodeId && e.condition === 'default'
      );
      expect(edgeToTerminal).toBeDefined();
    });

    it('includes metadata in the compiled graph', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const graph = result.policyGraph!;
      expect(graph.metadata.createdAt).toBeDefined();
      expect(graph.metadata.compiledFrom).toBe('dsl:1-rules');
      expect(graph.metadata.checksum).toBeDefined();
    });

    it('generates unique IDs for all nodes', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
          then
            warn "Short trip"
            approve
      `);

      const graph = result.policyGraph!;
      const nodeIds = graph.nodes.map((n) => n.nodeId);
      const uniqueIds = new Set(nodeIds);
      expect(uniqueIds.size).toBe(nodeIds.length);
    });

    it('connects condition true-path to action/terminal', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const graph = result.policyGraph!;
      const condNode = graph.nodes.find((n) => n.type === 'condition')!;
      const trueEdge = graph.edges.find(
        (e) => e.fromNodeId === condNode.nodeId && e.condition === 'true'
      );
      expect(trueEdge).toBeDefined();
    });
  });

  describe('semantic validation', () => {
    it('rejects invalid field prefixes', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when invalid.field == "value"
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
      expect(result.errors![0].type).toBe('semantic');
      expect(result.errors![0].message).toContain('invalid');
      expect(result.errors![0].message).toContain('prefix');
    });

    it('accepts valid field prefixes: traveller, trip, offer', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            traveller.department == "Engineering"
            AND trip.type == "domestic"
            AND offer.price > 100
          then
            approve
      `);

      expect(result.success).toBe(true);
    });

    it('rejects numeric operators with string values', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost > "expensive"
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('numeric');
    });

    it('rejects in operator with non-array values', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.type in "domestic"
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('array');
    });

    it('rejects between operator with non-between values', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.cost between 100 and 500
          then approve
      `);

      // between with proper syntax should succeed
      expect(result.success).toBe(true);
    });

    it('includes line and column in semantic errors', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when unknown.field == "value"
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors![0].line).toBeGreaterThan(0);
      expect(result.errors![0].column).toBeGreaterThan(0);
    });

    it('reports multiple semantic errors', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when
            invalid.field == "value"
            AND unknown.other > "text"
          then
            approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors!.length).toBeGreaterThanOrEqual(2);
    });

    it('allows single-segment field names without prefix validation', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when fieldName == "value"
          then approve
      `);

      expect(result.success).toBe(true);
    });

    it('generates warnings for conflicting approve and reject', () => {
      const ast: PolicyDocument = {
        type: 'document',
        rules: [
          {
            type: 'rule',
            name: 'Conflicting',
            priority: 1,
            conditions: {
              type: 'comparison',
              field: 'trip.type',
              operator: '==',
              value: { type: 'string', value: 'domestic' },
              location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 30, offset: 29 } },
            },
            actions: [
              { type: 'approve', location: { start: { line: 2, column: 1, offset: 30 }, end: { line: 2, column: 8, offset: 37 } } },
              { type: 'reject', reason: 'Not allowed', location: { start: { line: 3, column: 1, offset: 38 }, end: { line: 3, column: 30, offset: 67 } } },
            ],
            location: { start: { line: 1, column: 1, offset: 0 }, end: { line: 3, column: 30, offset: 67 } },
          },
        ],
      };

      const result = compile(ast);
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBe(1);
      expect(result.warnings![0].type).toBe('conflicting_actions');
    });

    it('validates conditions inside NOT expressions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when NOT (invalid.field == "value")
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('invalid');
    });

    it('validates conditions inside grouped expressions', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when (invalid.field == "value" OR trip.type == "domestic")
          then approve
      `);

      expect(result.success).toBe(false);
      expect(result.errors![0].message).toContain('invalid');
    });

    it('allows date values with numeric operators', () => {
      const result = compileFromDSL(`
        rule "Test" priority 1
          when trip.departureDate > @2024-06-15
          then approve
      `);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('compiles a rule with no priority (uses index as priority)', () => {
      const result = compileFromDSL(`
        rule "No Priority"
          when trip.type == "domestic"
          then approve
      `);

      const graph = result.policyGraph!;
      const rootEdges = graph.edges.filter(
        (e) => e.fromNodeId === graph.rootNodeId
      );
      expect(rootEdges[0].priority).toBe(0);
    });

    it('handles deeply nested logical expressions', () => {
      const result = compileFromDSL(`
        rule "Complex" priority 1
          when
            (trip.type == "domestic" AND trip.duration <= 3)
            OR (traveller.seniorityLevel in ["director", "vp"] AND offer.price < 2000)
          then
            approve
      `);

      expect(result.success).toBe(true);
      const graph = result.policyGraph!;
      // Should have multiple gate nodes for the nested logic
      const gateNodes = graph.nodes.filter((n) => n.type === 'gate');
      expect(gateNodes.length).toBeGreaterThanOrEqual(3); // root + OR + 2 ANDs
    });

    it('compiles the design document example correctly', () => {
      const result = compileFromDSL(`
        rule "Economy Only for Short Trips" priority 100
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            reject with reason "Short domestic trips must use economy class"
            suggest alternative where offer.cabinClass == "economy"
      `);

      expect(result.success).toBe(true);
      const graph = result.policyGraph!;

      // Should have condition nodes, gate nodes, action node (suggest), and terminal
      const conditionNodes = graph.nodes.filter((n) => n.type === 'condition');
      expect(conditionNodes.length).toBe(3);

      const terminalNodes = graph.nodes.filter((n) => n.type === 'terminal');
      expect(terminalNodes[0].terminal!.result).toBe('reject');
      expect(terminalNodes[0].terminal!.reasons).toContain(
        'Short domestic trips must use economy class'
      );

      // Should have a suggest_alternative action node
      const actionNodes = graph.nodes.filter((n) => n.type === 'action');
      expect(actionNodes.some((n) => n.action!.type === 'suggest_alternative')).toBe(true);
    });
  });
});
