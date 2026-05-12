/**
 * Policy Decision and Configuration types
 */

import { Money } from './common';

export interface PolicyDecisionRequest {
  tenantId: string;
  decisionPoint: string;
  traveller: TravellerContext;
  trip: TripContext;
  offers: Offer[];
  metadata?: Record<string, unknown>;
}

export interface TravellerContext {
  travellerId: string;
  employeeId: string;
  department: string;
  costCentre: string;
  seniorityLevel: string;
  region: string;
  loyaltyTiers?: Record<string, string>;
}

export interface TripContext {
  tripId: string;
  tripType: TripType;
  origin: Location;
  destination: Location;
  departureDate: string;
  returnDate?: string;
  leadTimeDays: number;
  purpose?: string;
}

export type TripType = 'domestic' | 'international' | 'multi-city';

export interface Location {
  code: string;
  city: string;
  country: string;
  region?: string;
}

export interface Offer {
  offerId: string;
  supplier: string;
  productType: ProductType;
  cabinClass?: string;
  totalPrice: Money;
  carbonFootprintKg?: number;
  refundable: boolean;
  segments?: Segment[];
}

export type ProductType = 'air' | 'hotel' | 'car' | 'rail';

export interface Segment {
  segmentId: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  carrier?: string;
  flightNumber?: string;
}

export interface PolicyDecision {
  decisionId: string;
  tenantId: string;
  result: PolicyResult;
  winningRules: WinningRule[];
  reasons: string[];
  obligations: Obligation[];
  alternatives: AlternativeSuggestion[];
  budgetStatus?: BudgetStatus;
  carbonImpact?: CarbonImpact;
  expiresAt: string;
  evaluatedAt: string;
  durationMs: number;
}

export type PolicyResult = 'approve' | 'reject' | 'review';

export interface WinningRule {
  ruleId: string;
  ruleName: string;
  priority: number;
  outcome: PolicyResult;
}

export interface Obligation {
  type: ObligationType;
  description: string;
  metadata?: Record<string, unknown>;
}

export type ObligationType =
  | 'require_approval'
  | 'require_justification'
  | 'manager_approval'
  | 'finance_approval';

export interface AlternativeSuggestion {
  offerId: string;
  reason: string;
  savingsAmount?: Money;
  carbonSavingsKg?: number;
}

export interface BudgetStatus {
  budgetId: string;
  budgetName: string;
  totalBudget: Money;
  currentUtilisation: Money;
  projectedUtilisation: Money;
  percentUsed: number;
  warningThreshold: number;
}

export interface CarbonImpact {
  estimatedKg: number;
  comparisonToAverage: number;
  lowerCarbonAlternativeAvailable: boolean;
}

export interface BatchPolicyRequest {
  tenantId: string;
  decisionPoint: string;
  traveller: TravellerContext;
  trip: TripContext;
  offers: Offer[];
}

export interface BatchPolicyDecision {
  decisions: PolicyDecision[];
  evaluatedAt: string;
  totalDurationMs: number;
}
