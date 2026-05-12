/**
 * PolicyGraph-to-OPA Rego Compiler
 *
 * Transforms a PolicyGraph into OPA-compatible Rego source code.
 * Generates one Rego module per rule plus a main evaluator module.
 *
 * Validates: Requirements 4.1, 5.3
 */

import type {
  PolicyGraph,
  PolicyNode,
  PolicyEdge,
  PolicyCondition,
  PolicyTerminal,
  PolicyRuleMetadata,
  ComparisonOp,
} from '@travel-policy/shared';

/** A generated Rego module with path and content */
export interface RegoModule {
  path: string;
  content: string;
}

/** Data document included in the OPA bundle */
export interface DataDocument {
  path: string;
  content: Record<string, unknown>;
}

/** OPA bundle manifest */
export interface BundleManifest {
  revision: string;
  roots: string[];
  metadata: {
    tenantId: string;
    compiledAt: string;
    graphId: string;
    graphVersion: number;
  };
}

/** Complete OPA bundle configuration */
export interface OPABundleConfig {
  tenantId: string;
  bundleId: string;
  regoModules: RegoModule[];
  dataDocuments: DataDocument[];
  manifest: BundleManifest;
}

/** Options for the Rego compiler */
export interface RegoCompilerOptions {
  /** Include debug comments in generated Rego */
  includeComments?: boolean;
}

/**
 * Compile a PolicyGraph into an OPA bundle configuration.
 *
 * @param graph - The PolicyGraph to compile
 * @param tenantId - The tenant identifier
 * @param options - Optional compiler settings
 * @returns Complete OPA bundle configuration
 */
export function compileToRego(
  graph: PolicyGraph,
  tenantId: string,
  options: RegoCompilerOptions = {}
): OPABundleConfig {
  const { includeComments = true } = options;
  const sanitizedTenantId = sanitizeIdentifier(tenantId);
  const packagePrefix = `tenants.${sanitizedTenantId}.policies`;
  const pathPrefix = `tenants/${sanitizedTenantId}/policies`;

  const regoModules: RegoModule[] = [];
  const rules = graph.metadata.rules ?? [];

  // Generate a Rego module for each rule
  for (let i = 0; i < rules.length; i++) {
    const ruleMeta = rules[i];
    const ruleId = sanitizeIdentifier(ruleMeta.name);
    const regoContent = generateRuleModule(
      graph,
      ruleMeta,
      packagePrefix,
      ruleId,
      includeComments
    );

    regoModules.push({
      path: `${pathPrefix}/rule_${String(i + 1).padStart(3, '0')}_${ruleId}.rego`,
      content: regoContent,
    });
  }

  // Generate the main evaluator module
  const mainContent = generateMainEvaluator(
    rules,
    packagePrefix,
    includeComments
  );
  regoModules.push({
    path: `${pathPrefix}/main.rego`,
    content: mainContent,
  });

  // Generate data document with tenant config
  const dataDocument: DataDocument = {
    path: `${pathPrefix}/data.json`,
    content: {
      tenant: {
        id: tenantId,
        rules: rules.map((r, i) => ({
          index: i,
          name: r.name,
          priority: r.priority ?? 0,
        })),
      },
    },
  };

  const bundleId = `${sanitizedTenantId}-${graph.graphId}-v${graph.version}`;
  const manifest: BundleManifest = {
    revision: `${graph.graphId}-v${graph.version}-${Date.now()}`,
    roots: [`tenants/${sanitizedTenantId}`],
    metadata: {
      tenantId,
      compiledAt: new Date().toISOString(),
      graphId: graph.graphId,
      graphVersion: graph.version,
    },
  };

  return {
    tenantId,
    bundleId,
    regoModules,
    dataDocuments: [dataDocument],
    manifest,
  };
}

/**
 * Generate a Rego module for a single policy rule.
 */
function generateRuleModule(
  graph: PolicyGraph,
  ruleMeta: PolicyRuleMetadata,
  packagePrefix: string,
  ruleId: string,
  includeComments: boolean
): string {
  const lines: string[] = [];

  lines.push(`package ${packagePrefix}`);
  lines.push('');
  lines.push('import future.keywords.if');
  lines.push('import future.keywords.in');
  lines.push('');

  if (includeComments) {
    lines.push(`# Rule: ${ruleMeta.name} (priority: ${ruleMeta.priority ?? 0})`);
  }

  // Traverse the graph from the rule's entry node to collect conditions and terminal
  const { conditions, terminal } = traverseRuleSubgraph(graph, ruleMeta.entryNodeId);

  // Generate the rule body
  const ruleName = `rule_${ruleId}`;
  lines.push(`${ruleName} := result if {`);

  // Generate condition expressions
  for (const condition of conditions) {
    const regoExpr = conditionToRego(condition);
    lines.push(`  ${regoExpr}`);
  }

  // Generate the result object
  if (terminal) {
    lines.push(`  result := {`);
    lines.push(`    "ruleName": ${JSON.stringify(ruleMeta.name)},`);
    lines.push(`    "result": ${JSON.stringify(terminal.result)},`);
    lines.push(`    "reasons": ${JSON.stringify(terminal.reasons)},`);
    lines.push(`    "obligations": ${JSON.stringify(terminal.obligations.map(o => o.type))},`);
    lines.push(`    "priority": ${ruleMeta.priority ?? 0}`);
    lines.push(`  }`);
  } else {
    // Default to approve if no terminal found
    lines.push(`  result := {`);
    lines.push(`    "ruleName": ${JSON.stringify(ruleMeta.name)},`);
    lines.push(`    "result": "approve",`);
    lines.push(`    "reasons": [],`);
    lines.push(`    "obligations": [],`);
    lines.push(`    "priority": ${ruleMeta.priority ?? 0}`);
    lines.push(`  }`);
  }

  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate the main evaluator module that combines all rule results.
 */
function generateMainEvaluator(
  rules: PolicyRuleMetadata[],
  packagePrefix: string,
  includeComments: boolean
): string {
  const lines: string[] = [];

  lines.push(`package ${packagePrefix}`);
  lines.push('');
  lines.push('import future.keywords.if');
  lines.push('import future.keywords.in');
  lines.push('import future.keywords.every');
  lines.push('');

  if (includeComments) {
    lines.push('# Main evaluation: collect all matching rules, return highest priority decision');
  }

  // Default decision when no rules match
  lines.push('default evaluate := {');
  lines.push('  "result": "approve",');
  lines.push('  "reasons": [],');
  lines.push('  "obligations": [],');
  lines.push('  "matchedRules": []');
  lines.push('}');
  lines.push('');

  // Generate the evaluate rule that collects all matching rule results
  lines.push('evaluate := decision if {');

  // Collect all matching rules into an array
  const ruleRefs = rules.map((r) => `rule_${sanitizeIdentifier(r.name)}`);

  lines.push('  matching_rules := [r |');
  for (let i = 0; i < ruleRefs.length; i++) {
    if (i === 0) {
      lines.push(`    some r in [${ruleRefs.map(ref => `${ref}`).join(', ')}]`);
    }
  }
  lines.push('    r != null');
  lines.push('  ]');
  lines.push('');
  lines.push('  count(matching_rules) > 0');
  lines.push('');

  if (includeComments) {
    lines.push('  # Sort by priority (highest first) and take the winning rule');
  }
  lines.push('  sorted_rules := sort(matching_rules, func(a, b) {');
  lines.push('    a.priority > b.priority');
  lines.push('  })');
  lines.push('');
  lines.push('  winning := sorted_rules[0]');
  lines.push('');
  lines.push('  decision := {');
  lines.push('    "result": winning.result,');
  lines.push('    "reasons": winning.reasons,');
  lines.push('    "obligations": winning.obligations,');
  lines.push('    "matchedRules": matching_rules');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

/**
 * Traverse the rule subgraph starting from the entry node to collect
 * all conditions and find the terminal node.
 */
function traverseRuleSubgraph(
  graph: PolicyGraph,
  entryNodeId: string
): { conditions: PolicyCondition[]; terminal: PolicyTerminal | null } {
  const conditions: PolicyCondition[] = [];
  let terminal: PolicyTerminal | null = null;
  const visited = new Set<string>();

  function traverse(nodeId: string): void {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);

    const node = graph.nodes.find((n) => n.nodeId === nodeId);
    if (!node) return;

    switch (node.type) {
      case 'condition':
        if (node.condition) {
          conditions.push(node.condition);
        }
        break;
      case 'terminal':
        if (node.terminal) {
          terminal = node.terminal;
        }
        return; // Don't traverse past terminal
      case 'gate':
        // For gate nodes, traverse children
        break;
      case 'action':
        // Skip action nodes for Rego generation (actions are in terminal)
        break;
    }

    // Follow outgoing edges
    const outEdges = graph.edges.filter((e) => e.fromNodeId === nodeId);
    for (const edge of outEdges) {
      traverse(edge.toNodeId);
    }
  }

  traverse(entryNodeId);
  return { conditions, terminal };
}

/**
 * Convert a PolicyCondition to a Rego expression string.
 */
function conditionToRego(condition: PolicyCondition): string {
  const field = fieldToRegoPath(condition.field);
  const op = condition.operator;
  const value = condition.value;

  switch (op) {
    case 'eq':
      return `${field} == ${valueToRego(value)}`;
    case 'neq':
      return `${field} != ${valueToRego(value)}`;
    case 'gt':
      return `${field} > ${valueToRego(value)}`;
    case 'gte':
      return `${field} >= ${valueToRego(value)}`;
    case 'lt':
      return `${field} < ${valueToRego(value)}`;
    case 'lte':
      return `${field} <= ${valueToRego(value)}`;
    case 'in':
      return `${field} in ${valueToRego(value)}`;
    case 'not_in':
      return `not ${field} in ${valueToRego(value)}`;
    case 'contains':
      return `contains(${field}, ${valueToRego(value)})`;
    case 'matches':
      return `regex.match(${valueToRego(value)}, ${field})`;
    case 'between': {
      const range = value as { low: unknown; high: unknown };
      return `${field} >= ${valueToRego(range.low)}; ${field} <= ${valueToRego(range.high)}`;
    }
    default:
      return `# unsupported operator: ${op}`;
  }
}

/**
 * Convert a DSL field reference to a Rego input path.
 * e.g., "trip.type" → "input.trip.type"
 */
function fieldToRegoPath(field: string): string {
  return `input.${field}`;
}

/**
 * Convert a value to its Rego representation.
 */
function valueToRego(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const elements = value.map((v) => valueToRego(v));
    return `{${elements.join(', ')}}`;
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  // For objects (like between ranges), serialize as JSON
  return JSON.stringify(value);
}

/**
 * Sanitize a string to be a valid Rego/OPA identifier.
 * Replaces non-alphanumeric characters with underscores and lowercases.
 */
export function sanitizeIdentifier(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}
