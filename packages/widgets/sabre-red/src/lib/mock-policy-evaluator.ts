import { PolicyEvaluationRequest, FareOffer } from './fare-mapper';

export interface PolicyDecision {
  fareId: string;
  status: 'green' | 'amber' | 'red';
  reasons: string[];
  violatedRules: string[];
  obligations: string[];
  alternatives: string[];
}

function evaluateSingleFare(offer: FareOffer): PolicyDecision {
  const cabin = (offer.cabinClass || '').toLowerCase();

  // Rule: Any fare > £5000 (regardless of class) → RED
  if (offer.price > 5000) {
    return {
      fareId: offer.fareId,
      status: 'red',
      reasons: ['Exceeds maximum trip budget'],
      violatedRules: ['Trip Budget Limit'],
      obligations: [],
      alternatives: [],
    };
  }

  // Rule: First class (any price) → RED
  if (cabin === 'first') {
    return {
      fareId: offer.fareId,
      status: 'red',
      reasons: ['First class not permitted for Standard tier'],
      violatedRules: ['Cabin Class Restriction'],
      obligations: [],
      alternatives: [],
    };
  }

  // Rule: Business class, price > £3500 → AMBER (significantly over budget)
  if (cabin === 'business' && offer.price > 3500) {
    return {
      fareId: offer.fareId,
      status: 'amber',
      reasons: ['Significantly over budget'],
      violatedRules: ['International Flight Cap'],
      obligations: ['Requires VP approval'],
      alternatives: [],
    };
  }

  // Rule: Business class, price ≤ £3500 → AMBER (exceeds economy cap)
  if (cabin === 'business') {
    return {
      fareId: offer.fareId,
      status: 'amber',
      reasons: ['Exceeds economy cap of £2,000'],
      violatedRules: ['International Flight Cap'],
      obligations: ['Requires manager approval'],
      alternatives: ['Economy at lower fare'],
    };
  }

  // Rule: Economy class, price ≤ £2000 → GREEN
  // Rule: Premium Economy, price ≤ £2000 → GREEN
  // (Any non-business, non-first fare that passed the >5000 check is GREEN)
  return {
    fareId: offer.fareId,
    status: 'green',
    reasons: [],
    violatedRules: [],
    obligations: [],
    alternatives: [],
  };
}

export function evaluateFares(request: PolicyEvaluationRequest): PolicyDecision[] {
  return request.offers.map(evaluateSingleFare);
}
