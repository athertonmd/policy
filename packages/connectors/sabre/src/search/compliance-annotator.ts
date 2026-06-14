/**
 * Compliance Annotator — Maps policy decision results to visual indicators
 * for each fare option in the search results.
 *
 * Decision mapping:
 *   "approve" → { status: "compliant", color: "green", icon: "✓" }
 *   "review"  → { status: "needs_approval", color: "amber", icon: "⚠" }
 *   "reject"  → { status: "non_compliant", color: "red", icon: "✗" }
 */

import type { PolicyDecision, BatchPolicyDecision } from '@travel-policy/shared';
import type {
  ComplianceAnnotation,
  AnnotatedFare,
  ComplianceSummary,
  ComplianceStatus,
  ComplianceColor,
} from '../types/compliance-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('compliance-annotator');

interface StatusMapping {
  status: ComplianceStatus;
  color: ComplianceColor;
  icon: string;
  defaultMessage: string;
}

const STATUS_MAP: Record<string, StatusMapping> = {
  approve: {
    status: 'compliant',
    color: 'green',
    icon: '✓',
    defaultMessage: 'Within policy',
  },
  review: {
    status: 'needs_approval',
    color: 'amber',
    icon: '⚠',
    defaultMessage: 'Requires manager approval',
  },
  reject: {
    status: 'non_compliant',
    color: 'red',
    icon: '✗',
    defaultMessage: 'Out of policy',
  },
};

/**
 * Annotates a list of fare offers with compliance information from policy decisions.
 *
 * @param decisions - Array of policy decisions (one per offer, in order)
 * @param offerIds - Array of offer IDs corresponding to each decision
 * @param sequenceNumbers - Array of Sabre sequence numbers for each fare
 */
export function annotateFares(
  decisions: PolicyDecision[],
  offerIds: string[],
  sequenceNumbers: number[]
): AnnotatedFare[] {
  if (decisions.length !== offerIds.length || decisions.length !== sequenceNumbers.length) {
    logger.warn('Mismatched array lengths in annotateFares', {
      decisions: decisions.length,
      offerIds: offerIds.length,
      sequenceNumbers: sequenceNumbers.length,
    });
  }

  const annotations: AnnotatedFare[] = [];

  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i];
    const offerId = offerIds[i];
    const sequenceNumber = sequenceNumbers[i];

    annotations.push({
      sequenceNumber,
      offerId,
      compliance: mapDecisionToAnnotation(decision),
    });
  }

  logger.info('Annotated fares with compliance status', {
    total: annotations.length,
    compliant: annotations.filter((a) => a.compliance.status === 'compliant').length,
    needsApproval: annotations.filter((a) => a.compliance.status === 'needs_approval').length,
    nonCompliant: annotations.filter((a) => a.compliance.status === 'non_compliant').length,
  });

  return annotations;
}

/**
 * Maps a single PolicyDecision to a ComplianceAnnotation.
 */
export function mapDecisionToAnnotation(decision: PolicyDecision): ComplianceAnnotation {
  const mapping = STATUS_MAP[decision.result] ?? STATUS_MAP.reject;

  const annotation: ComplianceAnnotation = {
    status: mapping.status,
    color: mapping.color,
    icon: mapping.icon,
    message: buildMessage(decision, mapping),
    decisionId: decision.decisionId,
    ruleNames: decision.winningRules.map((r) => r.ruleName),
  };

  // Add obligations for review decisions
  if (decision.result === 'review' && decision.obligations.length > 0) {
    annotation.obligations = decision.obligations;
  }

  // Add alternatives for reject decisions
  if (decision.result === 'reject' && decision.alternatives.length > 0) {
    annotation.alternatives = decision.alternatives;
  }

  // Always include budget and carbon if available
  if (decision.budgetStatus) {
    annotation.budgetStatus = decision.budgetStatus;
  }

  if (decision.carbonImpact) {
    annotation.carbonImpact = decision.carbonImpact;
  }

  return annotation;
}

/**
 * Builds a human-readable message from the policy decision.
 */
function buildMessage(decision: PolicyDecision, mapping: StatusMapping): string {
  if (decision.result === 'reject' && decision.reasons.length > 0) {
    return `Out of policy: ${decision.reasons[0]}`;
  }

  if (decision.result === 'review' && decision.obligations.length > 0) {
    const approvalType = decision.obligations[0].description;
    return `Requires approval: ${approvalType}`;
  }

  return mapping.defaultMessage;
}

/**
 * Computes summary statistics from annotated fares.
 */
export function computeSummary(annotations: AnnotatedFare[]): ComplianceSummary {
  return {
    totalFares: annotations.length,
    compliant: annotations.filter((a) => a.compliance.status === 'compliant').length,
    needsApproval: annotations.filter((a) => a.compliance.status === 'needs_approval').length,
    nonCompliant: annotations.filter((a) => a.compliance.status === 'non_compliant').length,
  };
}

/**
 * Annotates fares from a batch policy decision response.
 * Used when the policy API supports batch evaluation.
 */
export function annotateFaresFromBatch(
  batchDecision: BatchPolicyDecision,
  offerIds: string[],
  sequenceNumbers: number[]
): AnnotatedFare[] {
  return annotateFares(batchDecision.decisions, offerIds, sequenceNumbers);
}
