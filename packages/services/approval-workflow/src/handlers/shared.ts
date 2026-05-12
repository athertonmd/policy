/**
 * Shared handler utilities — response helpers, tenant context extraction, CORS headers.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

/** Standard CORS headers for all responses */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Content-Type': 'application/json',
};

/**
 * Extract tenant ID from the request (header or authorizer context).
 */
export function extractTenantId(event: APIGatewayProxyEvent): string | null {
  // Check custom header first
  const headerTenantId = event.headers?.['x-tenant-id'] ?? event.headers?.['X-Tenant-Id'];
  if (headerTenantId) {
    return headerTenantId;
  }

  // Check authorizer context
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === 'object' && 'tenantId' in authContext) {
    return authContext.tenantId as string;
  }

  return null;
}

/**
 * Extract the user ID from the request context.
 */
export function extractUserId(event: APIGatewayProxyEvent): string {
  const authContext = event.requestContext?.authorizer;
  if (authContext && typeof authContext === 'object' && 'userId' in authContext) {
    return authContext.userId as string;
  }
  return event.requestContext?.authorizer?.claims?.sub ?? 'system';
}

/**
 * Create a successful JSON response.
 */
export function successResponse(
  statusCode: number,
  data: unknown,
  requestId: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      data,
      metadata: {
        requestId,
        timestamp: new Date().toISOString(),
        version: 'v1',
      },
    }),
  };
}

/**
 * Create an error JSON response.
 */
export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify({
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    }),
  };
}
