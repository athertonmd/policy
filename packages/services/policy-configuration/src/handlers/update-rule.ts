/**
 * Lambda handler: Update a policy rule.
 * PUT /v1/policies/rules/{ruleId}
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { parse } from '../dsl/parser.js';
import { compile } from '../dsl/compiler.js';
import { withDatabase } from '../lib/database.js';
import { extractTenantId, extractUserId, successResponse, errorResponse } from './shared.js';

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return errorResponse(400, 'MISSING_RULE_ID', 'ruleId path parameter is required', requestId);
    }

    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    const body = JSON.parse(event.body);
    const { name, description, dslSource, priority, status } = body;
    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
    const userId = extractUserId(event);
    const now = new Date().toISOString();

    // If DSL is provided, parse and compile it
    let policyGraph = null;
    if (dslSource) {
      try {
        const ast = parse(dslSource);
        const compilationResult = compile(ast);
        if (!compilationResult.success || !compilationResult.policyGraph) {
          return errorResponse(400, 'DSL_COMPILATION_ERROR',
            `DSL compilation failed: ${compilationResult.errors?.map(e => e.message).join('; ') ?? 'Unknown error'}`, requestId);
        }
        policyGraph = compilationResult.policyGraph;
      } catch (parseError: any) {
        return errorResponse(400, 'DSL_PARSE_ERROR', `DSL parse error: ${parseError.message}`, requestId);
      }
    }

    const updatedRule = await withDatabase(async (db) => {
      // Build dynamic SET clause
      const setClauses: string[] = ['updated_at = $2'];
      const values: any[] = [ruleId, now];
      let paramIndex = 3;

      if (name !== undefined) { setClauses.push(`name = $${paramIndex}`); values.push(name); paramIndex++; }
      if (description !== undefined) { setClauses.push(`description = $${paramIndex}`); values.push(description); paramIndex++; }
      if (dslSource !== undefined) { setClauses.push(`dsl_source = $${paramIndex}`); values.push(dslSource); paramIndex++; }
      if (policyGraph) { setClauses.push(`policy_graph = $${paramIndex}`); values.push(JSON.stringify(policyGraph)); paramIndex++; }
      if (priority !== undefined) { setClauses.push(`priority = $${paramIndex}`); values.push(priority); paramIndex++; }
      if (status !== undefined) { setClauses.push(`status = $${paramIndex}`); values.push(status); paramIndex++; }

      const result = await db.query(
        `UPDATE ${schemaName}.policy_rules SET ${setClauses.join(', ')} WHERE rule_id = $1 RETURNING *`,
        values
      );

      if (result.rows.length === 0) return null;
      return result.rows[0];
    });

    if (!updatedRule) {
      return errorResponse(404, 'RULE_NOT_FOUND', `Rule ${ruleId} not found`, requestId);
    }

    return successResponse(200, {
      ruleId: updatedRule.rule_id,
      name: updatedRule.name,
      description: updatedRule.description,
      dslSource: updatedRule.dsl_source,
      status: updatedRule.status,
      version: updatedRule.version,
      priority: updatedRule.priority,
      updatedAt: updatedRule.updated_at,
    }, requestId);
  } catch (error) {
    console.error('Update rule failed:', error);
    return errorResponse(500, 'UPDATE_RULE_FAILED', error instanceof Error ? error.message : 'An unexpected error occurred', requestId);
  }
}
