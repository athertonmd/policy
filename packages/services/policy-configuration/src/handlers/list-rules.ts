/**
 * Lambda handler: List policy rules.
 * GET /v1/policies/rules
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withDatabase } from '../lib/database.js';
import { extractTenantId, successResponse, errorResponse } from './shared.js';

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

    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;

    const rules = await withDatabase(async (db) => {
      const result = await db.query(
        `SELECT rule_id, tenant_id, name, description, dsl_source, priority, status, version, created_by, created_at, updated_at
         FROM ${schemaName}.policy_rules
         ORDER BY updated_at DESC
         LIMIT 100`
      );
      return result.rows;
    });

    const items = rules.map((row: any) => ({
      ruleId: row.rule_id,
      tenantId: row.tenant_id,
      name: row.name,
      description: row.description,
      dslSource: row.dsl_source,
      priority: row.priority,
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return successResponse(200, { items, totalCount: items.length }, requestId);
  } catch (error) {
    console.error('List rules failed:', error);
    return errorResponse(
      500,
      'LIST_RULES_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
