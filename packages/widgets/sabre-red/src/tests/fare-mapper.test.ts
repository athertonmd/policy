import { describe, it, expect } from 'vitest';
import { mapToEvaluationRequest } from '../lib/fare-mapper';
import { SearchResultsPayload } from '../lib/message-bridge';

describe('mapToEvaluationRequest', () => {
  const validPayload: SearchResultsPayload = {
    travellerId: 'trav-001',
    origin: 'LHR',
    destination: 'JFK',
    departureDate: '2025-03-15',
    fares: [
      {
        id: 'fare-1',
        flightNumber: 'BA 115',
        airline: 'British Airways',
        route: { origin: 'LHR', destination: 'JFK' },
        cabinClass: 'Economy',
        price: 750,
        currency: '£',
      },
      {
        id: 'fare-2',
        flightNumber: 'AA 101',
        airline: 'American Airlines',
        route: { origin: 'LHR', destination: 'JFK' },
        cabinClass: 'Business',
        price: 2800,
        currency: '£',
      },
    ],
  };

  it('maps valid payload to PolicyEvaluationRequest with correct structure', () => {
    const result = mapToEvaluationRequest(validPayload);

    expect(result.travellerId).toBe('trav-001');
    expect(result.tripContext).toEqual({
      origin: 'LHR',
      destination: 'JFK',
      departureDate: '2025-03-15',
    });
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]).toEqual({
      fareId: 'fare-1',
      airline: 'British Airways',
      flightNumber: 'BA 115',
      cabinClass: 'Economy',
      price: 750,
      currency: '£',
      route: { origin: 'LHR', destination: 'JFK' },
    });
  });

  it('skips fares missing required fields (no id, no price)', () => {
    const payloadWithMissing: SearchResultsPayload = {
      travellerId: 'trav-001',
      origin: 'LHR',
      destination: 'JFK',
      departureDate: '2025-03-15',
      fares: [
        {
          id: '',
          flightNumber: 'BA 115',
          airline: 'British Airways',
          route: { origin: 'LHR', destination: 'JFK' },
          cabinClass: 'Economy',
          price: 750,
          currency: '£',
        },
        {
          id: 'fare-2',
          flightNumber: 'AA 101',
          airline: 'American Airlines',
          route: { origin: 'LHR', destination: 'JFK' },
          cabinClass: 'Business',
          price: 2800,
          currency: '£',
        },
        // fare with missing airline
        {
          id: 'fare-3',
          flightNumber: 'XX 999',
          airline: '',
          route: { origin: 'LHR', destination: 'JFK' },
          cabinClass: 'Economy',
          price: 500,
          currency: '£',
        },
      ],
    };

    const result = mapToEvaluationRequest(payloadWithMissing);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0].fareId).toBe('fare-2');
  });

  it('returns empty offers array for empty fares list', () => {
    const emptyPayload: SearchResultsPayload = {
      travellerId: 'trav-001',
      origin: 'LHR',
      destination: 'JFK',
      departureDate: '2025-03-15',
      fares: [],
    };

    const result = mapToEvaluationRequest(emptyPayload);
    expect(result.offers).toHaveLength(0);
    expect(result.travellerId).toBe('trav-001');
  });

  it('preserves all fare fields correctly', () => {
    const result = mapToEvaluationRequest(validPayload);
    const offer = result.offers[1];

    expect(offer.fareId).toBe('fare-2');
    expect(offer.airline).toBe('American Airlines');
    expect(offer.flightNumber).toBe('AA 101');
    expect(offer.cabinClass).toBe('Business');
    expect(offer.price).toBe(2800);
    expect(offer.currency).toBe('£');
    expect(offer.route).toEqual({ origin: 'LHR', destination: 'JFK' });
  });
});
