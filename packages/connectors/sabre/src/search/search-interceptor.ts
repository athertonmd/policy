/**
 * Search Interceptor — Intercepts Sabre BFM search results, evaluates each fare
 * against the Policy Decision API, and returns annotated results.
 *
 * Performance budget: Must complete within 2 seconds total.
 * The Policy API is <200ms, so the budget covers mapping + network overhead.
 */

import type { PolicyDecisionRequest, PolicyDecision } from '@travel-policy/shared';
import type { SabreConfig } from '../config.js';
import type { OTA_AirLowFareSearchRS } from '../types/sabre-types.js';
import type { AnnotatedSearchResult } from '../types/compliance-types.js';
import { mapBfmResponseToPolicyRequest, type FareMapperContext } from './fare-mapper.js';
import { annotateFares, computeSummary } from './compliance-annotator.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('search-interceptor');

export interface PolicyApiClient {
  evaluate(request: PolicyDecisionRequest): Promise<PolicyDecision[]>;
}

/**
 * Creates a policy API client that calls POST /v1/policies/evaluate.
 */
export function createPolicyApiClient(config: SabreConfig): PolicyApiClient {
  const { policyApiBaseUrl, policyApiKey, tenantId } = config;

  return {
    async evaluate(request: PolicyDecisionRequest): Promise<PolicyDecision[]> {
      const url = `${policyApiBaseUrl}/v1/policies/evaluate`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${policyApiKey}`,
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(1500), // Hard timeout to stay within 2s budget
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Policy API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as { data: PolicyDecision | PolicyDecision[] };

      // The API may return a single decision or array depending on offer count
      const decisions = Array.isArray(result.data) ? result.data : [result.data];
      return decisions;
    },
  };
}

/**
 * Intercepts a Sabre BFM response, evaluates policy compliance for each fare,
 * and returns the annotated search results.
 *
 * @param bfmResponse - The raw Sabre BFM response
 * @param context - Traveller and tenant context for policy evaluation
 * @param policyClient - Policy API client instance
 * @param config - Sabre connector configuration
 * @returns Annotated search results with compliance status per fare
 */
export async function interceptSearchResults(
  bfmResponse: OTA_AirLowFareSearchRS,
  context: FareMapperContext,
  policyClient: PolicyApiClient,
  config: SabreConfig
): Promise<AnnotatedSearchResult> {
  const startTime = Date.now();
  const budgetMs = config.searchPolicyBudgetMs ?? 2000;

  try {
    // Step 1: Map BFM response to PolicyDecisionRequest
    const policyRequest = mapBfmResponseToPolicyRequest(bfmResponse, context);

    const mappingDuration = Date.now() - startTime;
    logger.debug('Fare mapping completed', { durationMs: mappingDuration, offerCount: policyRequest.offers.length });

    // Check if we still have time budget
    if (Date.now() - startTime > budgetMs * 0.8) {
      logger.warn('Time budget nearly exhausted after mapping, returning unannotated results');
      return createFallbackResult(bfmResponse, startTime);
    }

    // Step 2: Call Policy Decision API
    const decisions = await policyClient.evaluate(policyRequest);

    const policyDuration = Date.now() - startTime - mappingDuration;
    logger.debug('Policy evaluation completed', { durationMs: policyDuration, decisionCount: decisions.length });

    // Step 3: Annotate fares with compliance status
    const itineraries = bfmResponse.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary;
    const offerIds = policyRequest.offers.map((o) => o.offerId);
    const sequenceNumbers = itineraries.map((it) => it.SequenceNumber);

    const annotations = annotateFares(decisions, offerIds, sequenceNumbers);
    const summary = computeSummary(annotations);

    const totalDuration = Date.now() - startTime;

    logger.info('Search interception completed', {
      totalDurationMs: totalDuration,
      withinBudget: totalDuration <= budgetMs,
      summary,
    });

    return {
      originalResponse: bfmResponse,
      annotations,
      summary,
      evaluationDurationMs: totalDuration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      'Search interception failed, returning unannotated results',
      error instanceof Error ? error : new Error(String(error)),
      { durationMs: duration }
    );

    // Graceful degradation: return original results without annotations
    return createFallbackResult(bfmResponse, startTime);
  }
}

/**
 * Creates a fallback result when policy evaluation fails or times out.
 * Returns the original response with no compliance annotations.
 */
function createFallbackResult(
  bfmResponse: OTA_AirLowFareSearchRS,
  startTime: number
): AnnotatedSearchResult {
  const itineraryCount =
    bfmResponse.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary.length;

  return {
    originalResponse: bfmResponse,
    annotations: [],
    summary: {
      totalFares: itineraryCount,
      compliant: 0,
      needsApproval: 0,
      nonCompliant: 0,
    },
    evaluationDurationMs: Date.now() - startTime,
  };
}
