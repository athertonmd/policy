import { describe, it, expect } from 'vitest';
import { calculateCarbonImpact, estimateOfferEmissions } from './carbon-calculator.js';
import type { Offer } from '@travel-policy/shared';

function createOffer(overrides?: Partial<Offer>): Offer {
  return {
    offerId: 'offer-001',
    supplier: 'Test Airline',
    productType: 'air',
    cabinClass: 'economy',
    totalPrice: { amount: 500, currency: 'GBP' },
    refundable: true,
    ...overrides,
  };
}

describe('estimateOfferEmissions', () => {
  it('uses carbonFootprintKg from offer when available', () => {
    const offer = createOffer({ carbonFootprintKg: 120 });

    const result = estimateOfferEmissions(offer, 'domestic');

    expect(result).toBe(120);
  });

  it('calculates emissions for air economy domestic', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'economy' });

    const result = estimateOfferEmissions(offer, 'domestic');

    // 500km * 0.255 kg/km * 1.0 multiplier = 127.5
    expect(result).toBe(127.5);
  });

  it('calculates emissions for air business international', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'business' });

    const result = estimateOfferEmissions(offer, 'international');

    // 3000km * 0.255 kg/km * 2.9 multiplier = 2218.5
    expect(result).toBe(2218.5);
  });

  it('calculates emissions for air first class', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'first' });

    const result = estimateOfferEmissions(offer, 'domestic');

    // 500km * 0.255 kg/km * 4.0 multiplier = 510
    expect(result).toBe(510);
  });

  it('calculates emissions for rail', () => {
    const offer = createOffer({
      productType: 'rail',
      carbonFootprintKg: undefined,
      cabinClass: undefined,
    });

    const result = estimateOfferEmissions(offer, 'domestic');

    // 500km * 0.041 kg/km * 1.0 = 20.5
    expect(result).toBe(20.5);
  });

  it('calculates emissions for hotel (per-night, not distance-based)', () => {
    const offer = createOffer({
      productType: 'hotel',
      carbonFootprintKg: undefined,
      cabinClass: undefined,
    });

    const result = estimateOfferEmissions(offer, 'domestic');

    // Hotel: flat 20 kg per night
    expect(result).toBe(20.0);
  });

  it('uses custom distance when provided', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'economy' });

    const result = estimateOfferEmissions(offer, 'domestic', 1000);

    // 1000km * 0.255 kg/km * 1.0 = 255
    expect(result).toBe(255);
  });

  it('defaults to domestic distance when tripType is undefined', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'economy' });

    const result = estimateOfferEmissions(offer, undefined);

    // 500km (domestic default) * 0.255 * 1.0 = 127.5
    expect(result).toBe(127.5);
  });

  it('handles unknown cabin class with multiplier 1.0', () => {
    const offer = createOffer({ carbonFootprintKg: undefined, cabinClass: 'premium_plus' });

    const result = estimateOfferEmissions(offer, 'domestic');

    // 500km * 0.255 * 1.0 (unknown class) = 127.5
    expect(result).toBe(127.5);
  });
});

describe('calculateCarbonImpact', () => {
  it('returns carbon impact for a single offer', () => {
    const offers = [createOffer({ carbonFootprintKg: 100 })];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    expect(result.estimatedKg).toBe(100);
    expect(result.lowerCarbonAlternativeAvailable).toBe(false);
    expect(result.comparisonToAverage).toBeGreaterThan(0);
  });

  it('sums emissions across multiple offers', () => {
    const offers = [
      createOffer({ offerId: 'o1', carbonFootprintKg: 100 }),
      createOffer({ offerId: 'o2', carbonFootprintKg: 50 }),
    ];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    expect(result.estimatedKg).toBe(150);
  });

  it('detects lower carbon alternative when emissions differ by >10%', () => {
    const offers = [
      createOffer({ offerId: 'o1', carbonFootprintKg: 200 }),
      createOffer({ offerId: 'o2', carbonFootprintKg: 50 }),
    ];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    expect(result.lowerCarbonAlternativeAvailable).toBe(true);
  });

  it('does not flag alternative when emissions are similar', () => {
    const offers = [
      createOffer({ offerId: 'o1', carbonFootprintKg: 100 }),
      createOffer({ offerId: 'o2', carbonFootprintKg: 105 }),
    ];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    expect(result.lowerCarbonAlternativeAvailable).toBe(false);
  });

  it('calculates comparison to average correctly for economy', () => {
    // Economy class should be close to average (ratio ~1.0)
    const offers = [createOffer({ carbonFootprintKg: undefined, cabinClass: 'economy' })];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    // Economy with default distance: estimated = average, so ratio = 1.0
    expect(result.comparisonToAverage).toBe(1.0);
  });

  it('calculates comparison to average > 1 for business class', () => {
    const offers = [createOffer({ carbonFootprintKg: undefined, cabinClass: 'business' })];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic' });

    // Business class multiplier is 2.9, so comparison should be ~2.9
    expect(result.comparisonToAverage).toBe(2.9);
  });

  it('uses provided distanceKm over defaults', () => {
    const offers = [createOffer({ carbonFootprintKg: undefined, cabinClass: 'economy' })];

    const result = calculateCarbonImpact({ offers, tripType: 'domestic', distanceKm: 1000 });

    // 1000km * 0.255 * 1.0 = 255
    expect(result.estimatedKg).toBe(255);
  });

  it('handles empty offers array', () => {
    const result = calculateCarbonImpact({ offers: [], tripType: 'domestic' });

    expect(result.estimatedKg).toBe(0);
    expect(result.comparisonToAverage).toBe(1.0);
    expect(result.lowerCarbonAlternativeAvailable).toBe(false);
  });
});
