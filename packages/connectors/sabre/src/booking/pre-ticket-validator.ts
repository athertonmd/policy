/**
 * Pre-Ticket Validator — Validates a booking against policy before ticketing.
 *
 * Called before the TKT (ticketing) command is issued.
 * Retrieves PNR details via Sabre GetReservation API, maps to PolicyDecisionRequest,
 * and evaluates against the Policy Decision API.
 *
 * Results:
 *   "approve" → proceed with ticketing
 *   "review"  → hold ticketing, initiate approval workflow
 *   "reject"  → block ticketing with reason
 */

import type { PolicyDecision, TravellerContext } from '@travel-policy/shared';
import type { SabreConfig } from '../config.js';
import type { SabreClient } from '../utils/sabre-client.js';
import type { GetReservationRS } from '../types/sabre-types.js';
import type { PreTicketValidationResult } from '../types/compliance-types.js';
import { mapReservationToPolicyRequest } from './booking-mapper.js';
import { createPolicyApiClient } from '../search/search-interceptor.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pre-ticket-validator');

export interface PreTicketValidatorOptions {
  /** Sabre HTTP client */
  sabreClient: SabreClient;
  /** Connector configuration */
  config: SabreConfig;
  /** Optional pre-resolved traveller context */
  traveller?: TravellerContext;
}

/**
 * Validates a PNR against travel policy before ticketing.
 *
 * @param recordLocator - The Sabre PNR record locator (e.g., "ABCDEF")
 * @param options - Validator configuration and dependencies
 * @returns Validation result indicating whether to proceed, hold, or block
 */
export async function validatePreTicket(
  recordLocator: string,
  options: PreTicketValidatorOptions
): Promise<PreTicketValidationResult> {
  const { sabreClient, config, traveller } = options;

  logger.info('Starting pre-ticket validation', { recordLocator });

  try {
    // Step 1: Retrieve PNR details from Sabre
    const reservation = await retrieveReservation(sabreClient, recordLocator);

    // Step 2: Map to PolicyDecisionRequest
    const policyRequest = mapReservationToPolicyRequest(reservation, {
      tenantId: config.tenantId,
      traveller,
      decisionPoint: 'pre_book',
    });

    // Step 3: Evaluate against Policy Decision API
    const policyClient = createPolicyApiClient(config);
    const decisions = await policyClient.evaluate(policyRequest);

    if (decisions.length === 0) {
      logger.warn('No policy decisions returned', { recordLocator });
      return {
        action: 'proceed',
        policyResult: createDefaultApproval(),
        message: 'No policy rules matched — proceeding with ticketing',
      };
    }

    const decision = decisions[0];

    // Step 4: Map decision to validation result
    return mapDecisionToResult(decision, recordLocator);
  } catch (error) {
    logger.error(
      'Pre-ticket validation failed',
      error instanceof Error ? error : new Error(String(error)),
      { recordLocator }
    );

    // Fail-open: allow ticketing if policy check fails (configurable)
    return {
      action: 'proceed',
      policyResult: createDefaultApproval(),
      message: 'Policy validation unavailable — proceeding with ticketing (fail-open)',
    };
  }
}

/**
 * Retrieves PNR details from Sabre's GetReservation API.
 */
async function retrieveReservation(
  sabreClient: SabreClient,
  recordLocator: string
): Promise<GetReservationRS> {
  const response = await sabreClient.request<GetReservationRS>({
    method: 'GET',
    path: `/v1/trip/orders/getBooking?confirmationId=${recordLocator}`,
    timeoutMs: 5000,
  });

  return response.data;
}

/**
 * Maps a policy decision to a pre-ticket validation result.
 */
function mapDecisionToResult(
  decision: PolicyDecision,
  recordLocator: string
): PreTicketValidationResult {
  switch (decision.result) {
    case 'approve':
      logger.info('Pre-ticket validation: APPROVED', { recordLocator });
      return {
        action: 'proceed',
        policyResult: decision,
        message: 'Booking is within policy — proceed with ticketing',
      };

    case 'review':
      logger.info('Pre-ticket validation: HOLD (requires approval)', {
        recordLocator,
        obligations: decision.obligations.map((o) => o.type),
      });
      return {
        action: 'hold',
        policyResult: decision,
        message: `Ticketing held — ${decision.obligations[0]?.description ?? 'requires approval'}`,
        approvalWorkflowId: decision.decisionId,
      };

    case 'reject':
      logger.info('Pre-ticket validation: BLOCKED', {
        recordLocator,
        reasons: decision.reasons,
      });
      return {
        action: 'block',
        policyResult: decision,
        message: `Ticketing blocked: ${decision.reasons[0] ?? 'out of policy'}`,
        blockReasons: decision.reasons,
      };

    default:
      return {
        action: 'proceed',
        policyResult: decision,
        message: 'Unknown policy result — proceeding with ticketing',
      };
  }
}

/**
 * Creates a default approval decision for fallback scenarios.
 */
function createDefaultApproval(): PolicyDecision {
  return {
    decisionId: `fallback-${Date.now()}`,
    tenantId: '',
    result: 'approve',
    winningRules: [],
    reasons: [],
    obligations: [],
    alternatives: [],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    evaluatedAt: new Date().toISOString(),
    durationMs: 0,
  };
}
