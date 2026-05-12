/**
 * Lambda handler: List policy rule versions.
 * GET /v1/policies/rules/{ruleId}/versions
 *
 * Returns paginated list of versions from policy_rule_versions table.
 *
 * Requirements: 4.6
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { withDatabase } from '../lib/database.js';
import { listVersions, getRuleById } from '../lib/rule-repository.js';
import {
  extractTenantId,
  successResponse,
  errorResponse,
  CORS_HEADERS,
} from './shared.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    // Validate tenant context
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    // Extract ruleId from path
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return errorResponse(400, 'MISSING_RULE_ID', 'Rule ID is required in path', requestId);
    }

    // Parse pagination parameters
    const pageStr = event.queryStringParameters?.page ?? '1';
    const pageSizeStr = event.queryStringParameters?.pageSize ?? String(DEFAULT_PAGE_SIZE);

    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(pageSizeStr, 10) || DEFAULT_PAGE_SIZE));
    const offset = (page - 1) * pageSize;

    const result = await withDatabase(async (db) => {
      // Verify the rule exists and belongs to this tenant
      const rule = await getRuleById(db, tenantId, ruleId);
      if (!rule) {
        return null;
      }

      return listVersions(db, tenantId, ruleId, pageSize, offset);
    });

    if (!result) {
      return errorResponse(404, 'RULE_NOT_FOUND', `Rule ${ruleId} not found`, requestId);
    }

    const totalPages = Math.ceil(result.total / pageSize);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: result.versions,
        pagination: {
          page,
          pageSize,
          total: result.total,
          totalPages,
          hasNext: page < totalPages,
          hasPrevious: page > 1,
        },
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('List versions failed:', error);
    return errorResponse(
      500,
      'LIST_VERSIONS_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
