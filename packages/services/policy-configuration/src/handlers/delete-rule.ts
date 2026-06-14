/**
 * Lambda handler: Delete a policy rule.
 * DELETE /v1/policies/rules/{ruleId}
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

    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return errorResponse(400, 'MISSING_RULE_ID', 'ruleId path parameter is required', requestId);
    }

    const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;

    const deleted = await withDatabase(async (db) => {
      // Delete version history first
      await db.query(
        `DELETE FROM ${schemaName}.policy_rule_versions WHERE rule_id = $1`,
        [ruleId]
      );
      // Delete the rule
      const result = await db.query(
        `DELETE FROM ${schemaName}.policy_rules WHERE rule_id = $1 RETURNING rule_id`,
        [ruleId]
      );
      return result.rows.length > 0;
    });

    if (!deleted) {
      return errorResponse(404, 'RULE_NOT_FOUND', `Rule ${ruleId} not found`, requestId);
    }

    return successResponse(200, { message: 'Rule deleted successfully', ruleId }, requestId);
  } catch (error) {
    console.error('Delete rule failed:', error);
    return errorResponse(500, 'DELETE_RULE_FAILED', error instanceof Error ? error.message : 'An unexpected error occurred', requestId);
  }
}
