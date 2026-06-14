/**
 * Compliance annotation types for Sabre search results.
 * These types define the visual indicators and metadata attached to each fare option.
 */

import type { PolicyDecision, BudgetStatus, CarbonImpact, Obligation, AlternativeSuggestion } from '@travel-policy/shared';

export type ComplianceStatus = 'compliant' | 'needs_approval' | 'non_compliant';
export type ComplianceColor = 'green' | 'amber' | 'red';

export interface ComplianceAnnotation {
  /** Compliance status category */
  status: ComplianceStatus;
  /** Visual color indicator */
  color: ComplianceColor;
  /** Icon character for display */
  icon: string;
  /** Human-readable message */
  message: string;
  /** Policy decision ID for audit trail */
  decisionId: string;
  /** Rules that determined this outcome */
  ruleNames: string[];
  /** Required actions (for needs_approval status) */
  obligations?: Obligation[];
  /** Suggested alternatives (for non_compliant status) */
  alternatives?: AlternativeSuggestion[];
  /** Current budget utilisation status */
  budgetStatus?: BudgetStatus;
  /** Carbon footprint impact */
  carbonImpact?: CarbonImpact;
}

export interface AnnotatedFare {
  /** Original sequence number from Sabre BFM response */
  sequenceNumber: number;
  /** Offer ID used in policy evaluation */
  offerId: string;
  /** Compliance annotation */
  compliance: ComplianceAnnotation;
}

export interface AnnotatedSearchResult {
  /** Original Sabre BFM response (pass-through) */
  originalResponse: unknown;
  /** Compliance annotations indexed by sequence number */
  annotations: AnnotatedFare[];
  /** Summary statistics */
  summary: ComplianceSummary;
  /** Total time taken for policy evaluation */
  evaluationDurationMs: number;
}

export interface ComplianceSummary {
  totalFares: number;
  compliant: number;
  needsApproval: number;
  nonCompliant: number;
}

export interface PreTicketValidationResult {
  /** Whether ticketing can proceed */
  action: 'proceed' | 'hold' | 'block';
  /** Policy decision result */
  policyResult: PolicyDecision;
  /** Human-readable reason */
  message: string;
  /** Approval workflow ID if hold */
  approvalWorkflowId?: string;
  /** Block reasons if blocked */
  blockReasons?: string[];
}

export interface WebhookProcessingResult {
  /** Whether the webhook was processed successfully */
  success: boolean;
  /** The PNR record locator */
  recordLocator: string;
  /** Action that was performed */
  action: 'booking_created' | 'booking_modified' | 'booking_cancelled';
  /** ID of the ingested booking in our platform */
  internalBookingId?: string;
  /** Error message if processing failed */
  error?: string;
}
