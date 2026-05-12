/**
 * Carbon Calculator
 * Estimates CO2 emissions based on offer type, distance, and cabin class.
 * Includes CarbonImpact in the decision response.
 */

import type { CarbonImpact, Offer } from '@travel-policy/shared';

/**
 * Average CO2 emissions per passenger-km by transport mode (kg CO2 per km).
 * Source: UK DEFRA / ICAO methodology (simplified).
 */
const EMISSION_FACTORS: Record<string, number> = {
  air: 0.255, // kg CO2 per passenger-km (average)
  rail: 0.041, // kg CO2 per passenger-km
  car: 0.171, // kg CO2 per km (average occupancy)
  hotel: 20.0, // kg CO2 per night (average)
};

/**
 * Cabin class multipliers for air travel.
 * Business/first class passengers occupy more space, increasing per-passenger emissions.
 */
const CABIN_CLASS_MULTIPLIERS: Record<string, number> = {
  economy: 1.0,
  premium_economy: 1.5,
  business: 2.9,
  first: 4.0,
};

/**
 * Average distance assumptions when actual distance is not available (km).
 */
const DEFAULT_DISTANCES: Record<string, number> = {
  domestic: 500,
  international: 3000,
  'multi-city': 5000,
};

export interface CarbonCalculationInput {
  offers: Offer[];
  tripType?: string;
  distanceKm?: number;
}

/**
 * Calculates the carbon impact for a set of offers.
 * Uses the offer's carbonFootprintKg if available, otherwise estimates from
 * product type, cabin class, and distance.
 */
export function calculateCarbonImpact(input: CarbonCalculationInput): CarbonImpact {
  const { offers, tripType, distanceKm } = input;

  let totalEstimatedKg = 0;
  let totalAverageKg = 0;
  let hasLowerCarbonAlternative = false;

  const offerEmissions: number[] = [];

  for (const offer of offers) {
    const estimatedKg = estimateOfferEmissions(offer, tripType, distanceKm);
    offerEmissions.push(estimatedKg);
    totalEstimatedKg += estimatedKg;

    // Calculate what the "average" would be for this offer type
    const averageKg = estimateAverageEmissions(offer.productType, tripType, distanceKm);
    totalAverageKg += averageKg;
  }

  // Check if any offer has a lower-carbon alternative among the set
  if (offerEmissions.length > 1) {
    const minEmission = Math.min(...offerEmissions);
    const maxEmission = Math.max(...offerEmissions);
    hasLowerCarbonAlternative = maxEmission > minEmission * 1.1; // 10% threshold
  }

  // Comparison to average: ratio of estimated vs average (1.0 = average, >1 = above average)
  const comparisonToAverage =
    totalAverageKg > 0
      ? Math.round((totalEstimatedKg / totalAverageKg) * 100) / 100
      : 1.0;

  return {
    estimatedKg: Math.round(totalEstimatedKg * 10) / 10,
    comparisonToAverage,
    lowerCarbonAlternativeAvailable: hasLowerCarbonAlternative,
  };
}

/**
 * Estimates CO2 emissions for a single offer.
 * Uses the offer's carbonFootprintKg if provided, otherwise calculates from factors.
 */
export function estimateOfferEmissions(
  offer: Offer,
  tripType?: string,
  distanceKm?: number
): number {
  // If the offer already has a carbon footprint, use it
  if (offer.carbonFootprintKg !== undefined && offer.carbonFootprintKg > 0) {
    return offer.carbonFootprintKg;
  }

  const productType = offer.productType;

  // Hotel emissions are per-night, not distance-based
  if (productType === 'hotel') {
    return EMISSION_FACTORS['hotel'] ?? 20.0;
  }

  // For transport modes, calculate based on distance and cabin class
  const distance = distanceKm ?? getDefaultDistance(tripType);
  const baseFactor = EMISSION_FACTORS[productType] ?? EMISSION_FACTORS['air']!;
  const cabinMultiplier = getCabinClassMultiplier(offer.cabinClass);

  return distance * baseFactor * cabinMultiplier;
}

/**
 * Estimates the "average" emissions for a product type (economy class, average distance).
 * Used as a baseline for comparison.
 */
function estimateAverageEmissions(
  productType: string,
  tripType?: string,
  distanceKm?: number
): number {
  if (productType === 'hotel') {
    return EMISSION_FACTORS['hotel'] ?? 20.0;
  }

  const distance = distanceKm ?? getDefaultDistance(tripType);
  const baseFactor = EMISSION_FACTORS[productType] ?? EMISSION_FACTORS['air']!;

  // Average assumes economy class (multiplier = 1.0)
  return distance * baseFactor;
}

/**
 * Gets the cabin class multiplier for emissions calculation.
 */
function getCabinClassMultiplier(cabinClass?: string): number {
  if (!cabinClass) return 1.0;
  return CABIN_CLASS_MULTIPLIERS[cabinClass.toLowerCase()] ?? 1.0;
}

/**
 * Gets the default distance based on trip type when actual distance is unknown.
 */
function getDefaultDistance(tripType?: string): number {
  if (!tripType) return DEFAULT_DISTANCES['domestic']!;
  return DEFAULT_DISTANCES[tripType] ?? DEFAULT_DISTANCES['domestic']!;
}
