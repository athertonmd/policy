/**
 * Lambda Handler: POST /v1/policies/evaluate
 * Evaluates a trip request against the tenant's policy graph.
 */

import type { PolicyDecisionRequest, PolicyDecision } from '@travel-policy/shared';
import { loadPolicyGraph } from '../engine/bundle-loader.js';
import { evaluatePolicy } from '../engine/policy-evaluator.js';

export interface ApiGatewayEvent {
  httpMethod: string;
  path: string;
  headers: Record<string, string | undefined>;
  body: string | null;
  pathParameters?: Record<string, string>;
  queryStringParameters?: Record<string, string>;
  requestContext?: {
    requestId: string;
    authorizer?: Record<string, unknown>;
  };
}

export interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Tenant-Id',
};

/**
 * Lambda handler for policy evaluation requests.
 */
export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const requestId = event.requestContext?.requestId ?? generateRequestId();

  try {
    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: PolicyDecisionRequest;
    try {
      request = JSON.parse(event.body) as PolicyDecisionRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate required fields
    const validationError = validateRequest(request);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    // Load the tenant's policy graph (cached on warm starts)
    const graph = await loadPolicyGraph(request.tenantId);

    // Evaluate the policy
    const decision: PolicyDecision = evaluatePolicy(request, graph);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: decision,
        metadata: {
          requestId,
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('Policy evaluation failed:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(500, 'EVALUATION_ERROR', message, requestId);
  }
}

/**
 * Validates the PolicyDecisionRequest payload.
 * Returns an error message if invalid, or null if valid.
 */
function validateRequest(request: PolicyDecisionRequest): string | null {
  const missingFields: string[] = [];

  if (!request.tenantId) missingFields.push('tenantId');
  if (!request.decisionPoint) missingFields.push('decisionPoint');
  if (!request.traveller) missingFields.push('traveller');
  if (!request.trip) missingFields.push('trip');
  if (!request.offers || !Array.isArray(request.offers) || request.offers.length === 0) {
    missingFields.push('offers');
  }

  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(', ')}`;
  }

  // Validate traveller context
  if (!request.traveller.travellerId) missingFields.push('traveller.travellerId');
  if (!request.traveller.department) missingFields.push('traveller.department');

  // Validate trip context
  if (!request.trip.tripId) missingFields.push('trip.tripId');
  if (!request.trip.tripType) missingFields.push('trip.tripType');

  if (missingFields.length > 0) {
    return `Missing required fields: ${missingFields.join(', ')}`;
  }

  return null;
}

function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  requestId: string
): ApiGatewayResponse {
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

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
