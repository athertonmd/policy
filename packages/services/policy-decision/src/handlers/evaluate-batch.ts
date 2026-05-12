/**
 * Lambda Handler: POST /v1/policies/evaluate-batch
 * Evaluates multiple offers in a single request with conflict resolution,
 * budget status, and carbon impact calculations.
 */

import type {
  BatchPolicyRequest,
  BatchPolicyDecision,
  PolicyDecision,
  PolicyDecisionRequest,
  Offer,
} from '@travel-policy/shared';
import { loadPolicyGraph } from '../engine/bundle-loader.js';
import { evaluatePolicy } from '../engine/policy-evaluator.js';
import {
  resolveConflicts,
  winningRulesToOutcomes,
  type ConflictResolutionStrategy,
} from '../engine/conflict-resolver.js';
import { calculateBudgetStatus, loadBudgetConfig } from '../engine/budget-calculator.js';
import { calculateCarbonImpact } from '../engine/carbon-calculator.js';

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
 * Lambda handler for batch policy evaluation requests.
 * Evaluates each offer independently, applies conflict resolution,
 * and enriches decisions with budget and carbon data.
 */
export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const requestId = event.requestContext?.requestId ?? generateRequestId();
  const startTime = Date.now();

  try {
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: BatchPolicyRequest & { conflictResolution?: ConflictResolutionStrategy };
    try {
      request = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    const validationError = validateBatchRequest(request);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    // Load the tenant's policy graph (cached on warm starts)
    const graph = await loadPolicyGraph(request.tenantId);

    // Determine conflict resolution strategy
    const conflictStrategy: ConflictResolutionStrategy =
      request.conflictResolution ?? 'highest_priority';

    // Load budget config for the traveller
    const budgetConfig = await loadBudgetConfig(request.tenantId, request.traveller);

    // Evaluate each offer independently
    const decisions: PolicyDecision[] = [];

    for (const offer of request.offers) {
      const singleRequest: PolicyDecisionRequest = {
        tenantId: request.tenantId,
        decisionPoint: request.decisionPoint,
        traveller: request.traveller,
        trip: request.trip,
        offers: [offer],
      };

      const decision = evaluatePolicy(singleRequest, graph);

      // Apply conflict resolution if multiple rules matched
      const enrichedDecision = applyConflictResolution(decision, conflictStrategy);

      // Calculate budget status
      const budgetStatus = calculateBudgetStatus({
        tenantId: request.tenantId,
        traveller: request.traveller,
        offers: [offer],
        budgetConfig,
      });
      if (budgetStatus) {
        enrichedDecision.budgetStatus = budgetStatus;
      }

      // Calculate carbon impact
      const carbonImpact = calculateCarbonImpact({
        offers: [offer],
        tripType: request.trip.tripType,
      });
      enrichedDecision.carbonImpact = carbonImpact;

      decisions.push(enrichedDecision);
    }

    const totalDurationMs = Date.now() - startTime;
    const evaluatedAt = new Date().toISOString();

    const batchDecision: BatchPolicyDecision = {
      decisions,
      evaluatedAt,
      totalDurationMs,
    };

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        data: batchDecision,
        metadata: {
          requestId,
          timestamp: evaluatedAt,
          version: 'v1',
        },
      }),
    };
  } catch (error) {
    console.error('Batch policy evaluation failed:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(500, 'EVALUATION_ERROR', message, requestId);
  }
}

/**
 * Applies conflict resolution to a policy decision when multiple rules matched.
 */
function applyConflictResolution(
  decision: PolicyDecision,
  strategy: ConflictResolutionStrategy
): PolicyDecision {
  if (decision.winningRules.length <= 1) {
    return decision;
  }

  const outcomes = winningRulesToOutcomes(decision.winningRules);
  const resolution = resolveConflicts(outcomes, strategy);

  return {
    ...decision,
    result: resolution.result,
  };
}

/**
 * Validates the BatchPolicyRequest payload.
 */
function validateBatchRequest(request: BatchPolicyRequest): string | null {
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

  if (!request.traveller.travellerId) missingFields.push('traveller.travellerId');
  if (!request.traveller.department) missingFields.push('traveller.department');
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
