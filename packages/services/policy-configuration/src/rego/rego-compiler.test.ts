import { describe, it, expect, beforeEach } from 'vitest';
import { compileToRego, sanitizeIdentifier } from './rego-compiler.js';
import { compile } from '../dsl/compiler.js';
import { parse, resetParser } from '../dsl/parser.js';
import type { PolicyGraph } from '@travel-policy/shared';

beforeEach(() => {
  resetParser();
});

/** Helper to compile DSL to PolicyGraph */
function graphFromDSL(dsl: string): PolicyGraph {
  const ast = parse(dsl);
  const result = compile(ast);
  if (!result.success || !result.policyGraph) {
    throw new Error(`Compilation failed: ${JSON.stringify(result.errors)}`);
  }
  return result.policyGraph;
}

describe('Rego Compiler', () => {
  describe('compileToRego', () => {
    it('generates a valid OPA bundle config from a simple rule', () => {
      const graph = graphFromDSL(`
        rule "Economy Only for Short Trips" priority 100
          when
            trip.type == "domestic"
            AND trip.duration <= 3
            AND offer.cabinClass != "economy"
          then
            reject with reason "Short domestic trips must use economy class"
      `);

      const bundle = compileToRego(graph, 'tenant_abc123');

      expect(bundle.tenantId).toBe('tenant_abc123');
      expect(bundle.bundleId).toContain('tenant_abc123');
      expect(bundle.regoModules.length).toBeGreaterThan(0);
      expect(bundle.dataDocuments.length).toBe(1);
      expect(bundle.manifest).toBeDefined();
      expect(bundle.manifest.roots).toContain('tenants/tenant_abc123');
    });

    it('generates correct Rego package declaration', () => {
      const graph = graphFromDSL(`
        rule "Test Rule" priority 50
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant_xyz');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule).toBeDefined();
      expect(ruleModule!.content).toContain('package tenants.tenant_xyz.policies');
    });

    it('generates import statements for future keywords', () => {
      const graph = graphFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'test_tenant');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('import future.keywords.if');
      expect(ruleModule!.content).toContain('import future.keywords.in');
    });

    it('generates correct equality condition', () => {
      const graph = graphFromDSL(`
        rule "Domestic Check" priority 10
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('input.trip.type == "domestic"');
    });

    it('generates correct inequality condition', () => {
      const graph = graphFromDSL(`
        rule "Not Economy" priority 10
          when offer.cabinClass != "economy"
          then reject with reason "Must be economy"
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('input.offer.cabinClass != "economy"');
    });

    it('generates correct numeric comparison conditions', () => {
      const graph = graphFromDSL(`
        rule "Duration Limit" priority 10
          when trip.duration <= 3
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('input.trip.duration <= 3');
    });

    it('generates correct "in" operator for set membership', () => {
      const graph = graphFromDSL(`
        rule "Senior Staff" priority 200
          when traveller.seniorityLevel in ["director", "vp", "c-suite"]
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('input.traveller.seniorityLevel in {"director", "vp", "c-suite"}');
    });

    it('generates reject result with reasons', () => {
      const graph = graphFromDSL(`
        rule "Cost Limit" priority 50
          when offer.totalPrice > 5000
          then reject with reason "Exceeds maximum booking value"
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('"result": "reject"');
      expect(ruleModule!.content).toContain('"Exceeds maximum booking value"');
    });

    it('generates approve result', () => {
      const graph = graphFromDSL(`
        rule "Allow All" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('"result": "approve"');
    });

    it('generates a main evaluator module', () => {
      const graph = graphFromDSL(`
        rule "Rule A" priority 100
          when trip.type == "domestic"
          then approve

        rule "Rule B" priority 200
          when trip.type == "international"
          then reject with reason "International trips need approval"
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const mainModule = bundle.regoModules.find((m) => m.path.includes('main.rego'));

      expect(mainModule).toBeDefined();
      expect(mainModule!.content).toContain('package tenants.tenant1.policies');
      expect(mainModule!.content).toContain('default evaluate');
      expect(mainModule!.content).toContain('evaluate := decision if {');
      expect(mainModule!.content).toContain('matching_rules');
    });

    it('generates one module per rule plus main evaluator', () => {
      const graph = graphFromDSL(`
        rule "Rule 1" priority 10
          when trip.type == "domestic"
          then approve

        rule "Rule 2" priority 20
          when trip.type == "international"
          then reject with reason "Needs approval"

        rule "Rule 3" priority 30
          when offer.cabinClass == "first"
          then reject with reason "No first class"
      `);

      const bundle = compileToRego(graph, 'tenant1');

      // 3 rule modules + 1 main evaluator
      expect(bundle.regoModules.length).toBe(4);
      expect(bundle.regoModules.filter((m) => m.path.includes('rule_')).length).toBe(3);
      expect(bundle.regoModules.filter((m) => m.path.includes('main.rego')).length).toBe(1);
    });

    it('generates correct file paths for modules', () => {
      const graph = graphFromDSL(`
        rule "My Rule" priority 10
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant_abc');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.path).toMatch(/^tenants\/tenant_abc\/policies\/rule_001_/);
      expect(ruleModule!.path).toMatch(/\.rego$/);
    });

    it('generates a data document with tenant config', () => {
      const graph = graphFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant_xyz');

      expect(bundle.dataDocuments.length).toBe(1);
      const dataDoc = bundle.dataDocuments[0];
      expect(dataDoc.path).toContain('data.json');
      expect(dataDoc.content.tenant).toBeDefined();
      expect((dataDoc.content.tenant as Record<string, unknown>).id).toBe('tenant_xyz');
    });

    it('generates a valid manifest', () => {
      const graph = graphFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant_abc');

      expect(bundle.manifest.revision).toBeDefined();
      expect(bundle.manifest.roots).toContain('tenants/tenant_abc');
      expect(bundle.manifest.metadata.tenantId).toBe('tenant_abc');
      expect(bundle.manifest.metadata.graphId).toBe(graph.graphId);
      expect(bundle.manifest.metadata.graphVersion).toBe(graph.version);
      expect(bundle.manifest.metadata.compiledAt).toBeDefined();
    });

    it('includes priority in generated rule result', () => {
      const graph = graphFromDSL(`
        rule "High Priority" priority 999
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('"priority": 999');
    });

    it('handles rules with obligations', () => {
      const graph = graphFromDSL(`
        rule "Needs Approval" priority 50
          when offer.totalPrice > 1000
          then require approval
      `);

      const bundle = compileToRego(graph, 'tenant1');
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).toContain('"result": "review"');
      expect(ruleModule!.content).toContain('"obligations"');
    });

    it('suppresses comments when includeComments is false', () => {
      const graph = graphFromDSL(`
        rule "Test" priority 1
          when trip.type == "domestic"
          then approve
      `);

      const bundle = compileToRego(graph, 'tenant1', { includeComments: false });
      const ruleModule = bundle.regoModules.find((m) => m.path.includes('rule_'));

      expect(ruleModule!.content).not.toContain('# Rule:');
    });

    it('generates valid Rego syntax (no unbalanced braces)', () => {
      const graph = graphFromDSL(`
        rule "Complex Rule" priority 100
          when
            trip.type == "international"
            AND traveller.seniorityLevel in ["junior", "mid"]
            AND offer.totalPrice > 2000
          then
            reject with reason "International trips over 2000 need senior approval"
      `);

      const bundle = compileToRego(graph, 'tenant1');

      for (const mod of bundle.regoModules) {
        const openBraces = (mod.content.match(/{/g) || []).length;
        const closeBraces = (mod.content.match(/}/g) || []).length;
        expect(openBraces).toBe(closeBraces);
      }
    });
  });

  describe('sanitizeIdentifier', () => {
    it('converts spaces to underscores', () => {
      expect(sanitizeIdentifier('My Rule Name')).toBe('my_rule_name');
    });

    it('removes special characters', () => {
      expect(sanitizeIdentifier('rule-with-dashes!')).toBe('rule_with_dashes');
    });

    it('lowercases the result', () => {
      expect(sanitizeIdentifier('CamelCase')).toBe('camelcase');
    });

    it('collapses multiple underscores', () => {
      expect(sanitizeIdentifier('too   many   spaces')).toBe('too_many_spaces');
    });

    it('trims leading/trailing underscores', () => {
      expect(sanitizeIdentifier('__leading__')).toBe('leading');
    });
  });
});
