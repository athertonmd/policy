import { describe, it, expect } from 'vitest';
import { evaluateFares } from '../lib/mock-policy-evaluator';
import { PolicyEvaluationRequest, FareOffer } from '../lib/fare-mapper';

function makeRequest(offers: FareOffer[]): PolicyEvaluationRequest {
  return {
    travellerId: 'trav-001',
    tripContext: {
      origin: 'LHR',
      destination: 'JFK',
      departureDate: '2025-03-15',
    },
    offers,
  };
}

describe('evaluateFares', () => {
  it('Economy ≤£2000 returns green with no violations', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'British Airways',
        flightNumber: 'BA 117',
        cabinClass: 'Economy',
        price: 892,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions).toHaveLength(1);
    expect(decisions[0].status).toBe('green');
    expect(decisions[0].violatedRules).toHaveLength(0);
    expect(decisions[0].obligations).toHaveLength(0);
    expect(decisions[0].reasons).toHaveLength(0);
  });

  it('Premium Economy ≤£2000 returns green with no violations', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'British Airways',
        flightNumber: 'BA 117',
        cabinClass: 'Premium Economy',
        price: 1450,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions[0].status).toBe('green');
    expect(decisions[0].violatedRules).toHaveLength(0);
  });

  it('Business ≤£3500 returns amber with manager approval obligation', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'American Airlines',
        flightNumber: 'AA 100',
        cabinClass: 'Business',
        price: 2890,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions[0].status).toBe('amber');
    expect(decisions[0].reasons).toContain('Exceeds economy cap of £2,000');
    expect(decisions[0].violatedRules).toContain('International Flight Cap');
    expect(decisions[0].obligations).toContain('Requires manager approval');
    expect(decisions[0].alternatives).toContain('Economy at lower fare');
  });

  it('Business >£3500 returns amber with VP approval obligation', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'Virgin Atlantic',
        flightNumber: 'VS 003',
        cabinClass: 'Business',
        price: 4200,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions[0].status).toBe('amber');
    expect(decisions[0].reasons).toContain('Significantly over budget');
    expect(decisions[0].violatedRules).toContain('International Flight Cap');
    expect(decisions[0].obligations).toContain('Requires VP approval');
  });

  it('First class returns red regardless of price', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'British Airways',
        flightNumber: 'BA 117',
        cabinClass: 'First',
        price: 4500,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions[0].status).toBe('red');
    expect(decisions[0].reasons).toContain('First class not permitted for Standard tier');
    expect(decisions[0].violatedRules).toContain('Cabin Class Restriction');
    expect(decisions[0].alternatives).toHaveLength(0);
  });

  it('Fare >£5000 returns red regardless of class', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'British Airways',
        flightNumber: 'BA 117',
        cabinClass: 'Economy',
        price: 5500,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions[0].status).toBe('red');
    expect(decisions[0].reasons).toContain('Exceeds maximum trip budget');
    expect(decisions[0].violatedRules).toContain('Trip Budget Limit');
  });

  it('Every fare gets exactly one decision (output length = input length)', () => {
    const request = makeRequest([
      {
        fareId: 'fare-1',
        airline: 'BA',
        flightNumber: 'BA 1',
        cabinClass: 'Economy',
        price: 500,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        fareId: 'fare-2',
        airline: 'AA',
        flightNumber: 'AA 2',
        cabinClass: 'Business',
        price: 2500,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        fareId: 'fare-3',
        airline: 'VS',
        flightNumber: 'VS 3',
        cabinClass: 'First',
        price: 4500,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ]);

    const decisions = evaluateFares(request);
    expect(decisions).toHaveLength(3);
  });

  it('Empty request returns empty decisions', () => {
    const request = makeRequest([]);

    const decisions = evaluateFares(request);
    expect(decisions).toHaveLength(0);
  });
});
