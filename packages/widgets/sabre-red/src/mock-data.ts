import { Fare, Traveller } from './types';
import { mapToEvaluationRequest, PolicyEvaluationRequest } from './lib/fare-mapper';
import { evaluateFares } from './lib/mock-policy-evaluator';
import { SearchResultsPayload } from './lib/message-bridge';

export const mockTraveller: Traveller = {
  name: 'James Smith',
  grade: 'Senior Engineer',
  policyTier: 'Standard',
  budget: {
    remaining: 3200,
    total: 5000,
    currency: '£',
  },
};

// Raw fare data used for evaluation
const rawFares: SearchResultsPayload = {
  travellerId: 'trav-mock-001',
  origin: 'LHR',
  destination: 'JFK',
  departureDate: '2025-03-15',
  fares: [
    {
      id: 'fare-1',
      flightNumber: 'BA 117',
      airline: 'British Airways',
      route: { origin: 'LHR', destination: 'JFK' },
      cabinClass: 'Economy',
      price: 892,
      currency: '£',
    },
    {
      id: 'fare-2',
      flightNumber: 'BA 117',
      airline: 'British Airways',
      route: { origin: 'LHR', destination: 'JFK' },
      cabinClass: 'Premium Economy',
      price: 1450,
      currency: '£',
    },
    {
      id: 'fare-3',
      flightNumber: 'AA 100',
      airline: 'American Airlines',
      route: { origin: 'LHR', destination: 'JFK' },
      cabinClass: 'Business',
      price: 2890,
      currency: '£',
    },
    {
      id: 'fare-4',
      flightNumber: 'VS 003',
      airline: 'Virgin Atlantic',
      route: { origin: 'LHR', destination: 'JFK' },
      cabinClass: 'Business',
      price: 3200,
      currency: '£',
    },
    {
      id: 'fare-5',
      flightNumber: 'BA 117',
      airline: 'British Airways',
      route: { origin: 'LHR', destination: 'JFK' },
      cabinClass: 'First',
      price: 6800,
      currency: '£',
    },
  ],
};

// Run evaluator on mock data for consistency
const request: PolicyEvaluationRequest = mapToEvaluationRequest(rawFares);
const decisions = evaluateFares(request);

export const mockFares: Fare[] = rawFares.fares.map((fare, index) => {
  const decision = decisions[index];
  return {
    id: fare.id,
    flightNumber: fare.flightNumber,
    airline: fare.airline,
    route: fare.route,
    cabinClass: fare.cabinClass,
    price: fare.price,
    currency: fare.currency,
    compliance: {
      status: decision.status,
      reasons: decision.reasons,
      violatedRules: decision.violatedRules,
      obligations: decision.obligations,
      alternatives: decision.alternatives,
    },
  };
});
