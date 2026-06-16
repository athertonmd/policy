import { describe, it, expect } from 'vitest';
import { searchScenarios, createSearchMessage } from '../lib/search-scenarios';

describe('Search Scenarios', () => {
  it('LHR→JFK scenario has 5 fares with correct route', () => {
    const scenario = searchScenarios.find((s) => s.origin === 'LHR' && s.destination === 'JFK');
    expect(scenario).toBeDefined();
    expect(scenario!.fares).toHaveLength(5);
    scenario!.fares.forEach((fare) => {
      expect(fare.route).toEqual({ origin: 'LHR', destination: 'JFK' });
    });
  });

  it('MAN→DXB scenario has 4 fares with correct route', () => {
    const scenario = searchScenarios.find((s) => s.origin === 'MAN' && s.destination === 'DXB');
    expect(scenario).toBeDefined();
    expect(scenario!.fares).toHaveLength(4);
    scenario!.fares.forEach((fare) => {
      expect(fare.route).toEqual({ origin: 'MAN', destination: 'DXB' });
    });
  });

  it('LHR→SIN scenario has 5 fares with correct route', () => {
    const scenario = searchScenarios.find((s) => s.origin === 'LHR' && s.destination === 'SIN');
    expect(scenario).toBeDefined();
    expect(scenario!.fares).toHaveLength(5);
    scenario!.fares.forEach((fare) => {
      expect(fare.route).toEqual({ origin: 'LHR', destination: 'SIN' });
    });
  });

  it('createSearchMessage returns valid SEARCH_RESULTS message shape', () => {
    const scenario = searchScenarios[0];
    const message = createSearchMessage(scenario);

    expect(message.type).toBe('SEARCH_RESULTS');
    expect(message.correlationId).toEqual(expect.any(String));
    expect(message.timestamp).toEqual(expect.any(Number));
    expect(message.payload).toEqual(
      expect.objectContaining({
        travellerId: expect.any(String),
        origin: scenario.origin,
        destination: scenario.destination,
        departureDate: scenario.departureDate,
        fares: expect.any(Array),
      })
    );
    expect(message.payload.fares).toHaveLength(scenario.fares.length);
  });

  it('All fares in each scenario have required fields', () => {
    for (const scenario of searchScenarios) {
      for (const fare of scenario.fares) {
        expect(fare.id).toEqual(expect.any(String));
        expect(fare.id.length).toBeGreaterThan(0);
        expect(fare.flightNumber).toEqual(expect.any(String));
        expect(fare.flightNumber.length).toBeGreaterThan(0);
        expect(fare.airline).toEqual(expect.any(String));
        expect(fare.airline.length).toBeGreaterThan(0);
        expect(fare.cabinClass).toEqual(expect.any(String));
        expect(fare.cabinClass.length).toBeGreaterThan(0);
        expect(fare.price).toEqual(expect.any(Number));
        expect(fare.price).toBeGreaterThan(0);
        expect(fare.currency).toEqual(expect.any(String));
        expect(fare.currency.length).toBeGreaterThan(0);
      }
    }
  });
});
