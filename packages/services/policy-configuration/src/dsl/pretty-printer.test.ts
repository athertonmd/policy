import { describe, it, expect, beforeEach } from 'vitest';
import { prettyPrint } from './pretty-printer.js';
import { compile } from './compiler.js';
import { parse, resetParser } from './parser.js';
import type { PolicyGraph } from '@travel-policy/shared';

beforeEach(() => {
  resetParser();
});

/** Helper to compile DSL and pretty-print back */
function roundTrip(dsl: string): string {
  const ast = parse(dsl);
  const result = compile(ast);
  expect(result.success).toBe(true);
  return prettyPrint(result.policyGraph!);
}

/** Helper to verify round-trip: parse(prettyPrint(compile(parse(dsl)))) produces equivalent AST */
function verifyRoundTrip(dsl: string): void {
  const ast1 = parse(dsl);
  const result1 = compile(ast1);
  expect(result1.success).toBe(true);

  const printed = prettyPrint(result1.policyGraph!);
  const ast2 = parse(printed);
  const result2 = compile(ast2);
  expect(result2.success).toBe(true);

  // Compare the graphs structurally (ignoring IDs and timestamps)
  assertGraphsEquivalent(result1.policyGraph!, result2.policyGraph!);
}

/** Compare two PolicyGraphs for structural equivalence (ignoring generated IDs) */
function assertGraphsEquivalent(g1: PolicyGraph, g2: PolicyGraph): void {
  expect(g1.nodes.length).toBe(g2.nodes.length);
  expect(g1.edges.length).toBe(g2.edges.length);

  // Compare node types and properties
  const sortedNodes1 = sortNodes(g1);
  const sortedNodes2 = sortNodes(g2);

  for (let i = 0; i < sortedNodes1.length; i++) {
    expect(sortedNodes1[i].type).toBe(sortedNodes2[i].type);
    expect(sortedNodes1[i].operator).toBe(sortedNodes2[i].operator);
    if (sortedNodes1[i].condition) {
      expect(sortedNodes1[i].condition).toEqual(sortedNodes2[i].condition);
    }
    if (sortedNodes1[i].action) {
      expect(sortedNodes1[i].action).toEqual(sortedNodes2[i].action);
    }
    if (sortedNodes1[i].terminal) {
      expect(sortedNodes1[i].terminal).toEqual(sortedNodes2[i].terminal);
    }
  }

  // Compare rule metadata
  expect(g1.metadata.rules?.length).toBe(g2.metadata.rules?.length);
  if (g1.metadata.rules && g2.metadata.rules) {
    for (let i = 0; i < g1.metadata.rules.length; i++) {
      expect(g1.metadata.rules[i].name).toBe(g2.metadata.rules[i].name);
      expect(g1.metadata.rules[i].priority).toBe(g2.metadata.rules[i].priority);
    }
  }
}

/** Sort nodes by type and properties for comparison */
function sortNodes(graph: PolicyGraph) {
  return [...graph.nodes].sort((a, b) => {
    const typeOrder = a.type.localeCompare(b.type);
    if (typeOrder !== 0) return typeOrder;
    // Secondary sort by operator or condition field
    const aKey = a.condition?.field ?? a.action?.type ?? a.operator ?? '';
    const bKey = b.condition?.field ?? b.action?.type ?? b.operator ?? '';
    return aKey.localeCompare(bKey);
  });
}

describe('Pretty Printer', () => {
  describe('simple rule round-trips', () => {
    it('prints a simple approve rule', () => {
      const output = roundTrip(`
        rule "Allow Domestic" priority 100
          when
            trip.type == "domestic"
          then
            approve
      `);

      expect(output).toContain('rule "Allow Domestic" priority 100');
      expect(output).toContain('when');
      expect(output).toContain('trip.type == "domestic"');
      expect(output).toContain('then');
      expect(output).toContain('approve');
    });

    it('prints a rule without priority', () => {
      const output = roundTrip(`
        rule "No Priority"
          when
            trip.type == "domestic"
          then
            approve
      `);

      expect(output).toContain('rule "No Priority"');
      expect(output).not.toContain('priority');
    });

    it('round-trips a simple approve rule', () => {
      verifyRoundTrip(`
        rule "Allow Domestic" priority 100
          when
            trip.type == "domestic"
          then
            approve
      `);
    });
  });

  describe('multiple rules', () => {
    it('prints multiple rules separated by blank lines', () => {
      const output = roundTrip(`
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
      `);

      expect(output).toContain('rule "Rule One" priority 100');
      expect(output).toContain('rule "Rule Two" priority 200');
      // Should have blank line between rules
      expect(output).toMatch(/approve\n\nrule "Rule Two"/);
    });

    it('round-trips multiple rules', () => {
      verifyRoundTrip(`
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
      `);
    });
  });

  describe('all operator types', () => {
    it('formats == operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);
      expect(output).toContain('trip.type == "domestic"');
    });

    it('formats != operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type != "domestic"
          then approve
      `);
      expect(output).toContain('trip.type != "domestic"');
    });

    it('formats > operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 1000
          then approve
      `);
      expect(output).toContain('trip.cost > 1000');
    });

    it('formats >= operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost >= 1000
          then approve
      `);
      expect(output).toContain('trip.cost >= 1000');
    });

    it('formats < operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost < 1000
          then approve
      `);
      expect(output).toContain('trip.cost < 1000');
    });

    it('formats <= operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost <= 1000
          then approve
      `);
      expect(output).toContain('trip.cost <= 1000');
    });

    it('formats in operator with array', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type in ["domestic", "regional"]
          then approve
      `);
      expect(output).toContain('trip.type in ["domestic", "regional"]');
    });

    it('formats not in operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type not in ["international"]
          then approve
      `);
      expect(output).toContain('trip.type not in ["international"]');
    });

    it('formats contains operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.tags contains "urgent"
          then approve
      `);
      expect(output).toContain('trip.tags contains "urgent"');
    });

    it('formats matches operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.name matches "^test.*"
          then approve
      `);
      expect(output).toContain('trip.name matches "^test.*"');
    });

    it('formats between operator', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost between 100 and 500
          then approve
      `);
      expect(output).toContain('trip.cost between 100 and 500');
    });

    it('round-trips all operators', () => {
      verifyRoundTrip(`
        rule "Test" priority 1
          when trip.cost > 1000
          then approve
      `);
      verifyRoundTrip(`
        rule "Test" priority 1
          when trip.type in ["a", "b"]
          then approve
      `);
      verifyRoundTrip(`
        rule "Test" priority 1
          when trip.cost between 100 and 500
          then approve
      `);
    });
  });

  describe('all action types', () => {
    it('formats approve action', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);
      expect(output).toContain('approve');
    });

    it('formats reject with reason action', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type == "international"
          then reject with reason "Not allowed"
      `);
      expect(output).toContain('reject with reason "Not allowed"');
    });

    it('formats warn action', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then warn "High cost booking"
      `);
      expect(output).toContain('warn "High cost booking"');
    });

    it('formats suggest alternative action', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when offer.cabinClass != "economy"
          then suggest alternative where offer.cabinClass == "economy"
      `);
      expect(output).toContain('suggest alternative where offer.cabinClass == "economy"');
    });

    it('formats require approval obligation', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then require approval
      `);
      expect(output).toContain('require approval');
    });

    it('formats require justification obligation', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then require justification
      `);
      expect(output).toContain('require justification');
    });

    it('formats require manager_approval obligation', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then require manager_approval
      `);
      expect(output).toContain('require manager_approval');
    });

    it('formats require finance_approval obligation', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 10000
          then require finance_approval
      `);
      expect(output).toContain('require finance_approval');
    });

    it('formats multiple actions in a rule', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then
            warn "High cost"
            require manager_approval
            require justification
      `);
      expect(output).toContain('warn "High cost"');
      expect(output).toContain('require manager_approval');
      expect(output).toContain('require justification');
    });

    it('round-trips all action types', () => {
      verifyRoundTrip(`
        rule "Test" priority 1
          when trip.cost > 5000
          then
            warn "High cost"
            require manager_approval
      `);
    });
  });

  describe('logical expressions', () => {
    it('formats AND conditions', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
          then
            approve
      `);
      expect(output).toContain('trip.type == "domestic"');
      expect(output).toContain('AND trip.duration <= 3');
    });

    it('formats OR conditions', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            OR trip.type == "regional"
          then
            approve
      `);
      expect(output).toContain('trip.type == "domestic"');
      expect(output).toContain('OR trip.type == "regional"');
    });

    it('formats NOT conditions', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            NOT (trip.type == "domestic")
          then
            approve
      `);
      expect(output).toContain('NOT (trip.type == "domestic")');
    });

    it('formats nested AND conditions', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            approve
      `);
      expect(output).toContain('trip.type == "domestic"');
      expect(output).toContain('AND trip.duration <= 3');
      expect(output).toContain('AND offer.cabinClass != "economy"');
    });

    it('formats grouped OR inside AND', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            (trip.type == "domestic" OR trip.type == "regional")
            AND trip.duration <= 5
          then
            approve
      `);
      expect(output).toContain('(trip.type == "domestic"');
      expect(output).toContain('OR trip.type == "regional")');
      expect(output).toContain('AND trip.duration <= 5');
    });

    it('round-trips logical expressions', () => {
      verifyRoundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            AND trip.duration <= 3
          then
            approve
      `);

      verifyRoundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
            OR trip.type == "regional"
          then
            approve
      `);

      verifyRoundTrip(`
        rule "Test" priority 1
          when
            NOT (trip.type == "domestic")
          then
            approve
      `);
    });
  });

  describe('value types', () => {
    it('formats string values', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type == "business"
          then approve
      `);
      expect(output).toContain('"business"');
    });

    it('formats number values', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.cost > 99.99
          then approve
      `);
      expect(output).toContain('99.99');
    });

    it('formats boolean values', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.isUrgent == true
          then approve
      `);
      expect(output).toContain('true');
    });

    it('formats date values', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.departureDate > @2024-06-15
          then approve
      `);
      expect(output).toContain('@2024-06-15');
    });

    it('formats array values', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when trip.type in ["domestic", "regional", "international"]
          then approve
      `);
      expect(output).toContain('["domestic", "regional", "international"]');
    });
  });

  describe('round-trip property', () => {
    it('parse(prettyPrint(compile(parse(dsl)))) produces equivalent graph', () => {
      verifyRoundTrip(`
        rule "Economy Only for Short Trips" priority 100
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            reject with reason "Short domestic trips must use economy class"
            suggest alternative where offer.cabinClass == "economy"
      `);
    });

    it('round-trips the senior staff example', () => {
      verifyRoundTrip(`
        rule "Senior Staff Premium" priority 200
          when
            traveller.seniorityLevel in ["director", "vp", "c-suite"]
          then
            approve
      `);
    });

    it('round-trips complex multi-rule document', () => {
      verifyRoundTrip(`
        rule "Economy Only for Short Trips" priority 100
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            reject with reason "Short domestic trips must use economy class"
            suggest alternative where offer.cabinClass == "economy"

        rule "Senior Staff Premium" priority 200
          when
            traveller.seniorityLevel in ["director", "vp", "c-suite"]
          then
            approve

        rule "High Cost Review" priority 300
          when
            trip.cost > 5000
          then
            warn "High cost booking"
            require manager_approval
      `);
    });
  });

  describe('edge cases', () => {
    it('returns empty string for graph with no rule metadata', () => {
      const graph: PolicyGraph = {
        graphId: 'test',
        version: 1,
        rootNodeId: 'root',
        nodes: [],
        edges: [],
        metadata: {
          createdAt: new Date().toISOString(),
          compiledFrom: 'dsl:0-rules',
          checksum: '00000000',
        },
      };
      expect(prettyPrint(graph)).toBe('');
    });

    it('uses consistent 2-space indentation', () => {
      const output = roundTrip(`
        rule "Test" priority 1
          when
            trip.type == "domestic"
          then
            approve
      `);

      const lines = output.split('\n');
      // Rule header has no indentation
      expect(lines[0]).toMatch(/^rule /);
      // when/then have 2-space indent
      expect(lines[1]).toMatch(/^  when/);
      // conditions have 4-space indent
      expect(lines[2]).toMatch(/^    /);
    });
  });
});
