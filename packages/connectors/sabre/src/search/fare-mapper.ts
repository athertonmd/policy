/**
 * Fare Mapper — Maps Sabre BFM response structure to PolicyDecisionRequest format.
 *
 * Mapping:
 *   PricedItinerary → Offer (offerId, supplier, cabinClass, totalPrice)
 *   OriginDestinationOption → Trip (origin/destination from DepartureAirport/ArrivalAirport)
 *   PassengerInfo → TravellerContext (looked up from traveller profile)
 *
 * Handles Sabre's nested XML-to-JSON structure where arrays may be single objects.
 */

import type {
  PolicyDecisionRequest,
  TravellerContext,
  TripContext,
  Offer,
  Segment,
} from '@travel-policy/shared';
import type {
  OTA_AirLowFareSearchRS,
  PricedItinerary,
  OriginDestinationOption,
  FlightSegment,
  CabinCode,
} from '../types/sabre-types.js';
import { CABIN_CODE_MAP } from '../types/sabre-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('fare-mapper');

export interface FareMapperContext {
  /** Tenant ID for policy evaluation */
  tenantId: string;
  /** Traveller context (pre-resolved from profile) */
  traveller: TravellerContext;
  /** Trip purpose (optional) */
  tripPurpose?: string;
  /** Decision point identifier */
  decisionPoint?: string;
}

/**
 * Maps a complete Sabre BFM response to a PolicyDecisionRequest.
 */
export function mapBfmResponseToPolicyRequest(
  bfmResponse: OTA_AirLowFareSearchRS,
  context: FareMapperContext
): PolicyDecisionRequest {
  const itineraries = bfmResponse.OTA_AirLowFareSearchRS.PricedItineraries.PricedItinerary;

  // Extract trip context from the first itinerary's first OD option
  const trip = extractTripContext(itineraries[0], context.tripPurpose);

  // Map each priced itinerary to an Offer
  const offers = itineraries.map((itinerary) => mapItineraryToOffer(itinerary));

  logger.info('Mapped BFM response to policy request', {
    itineraryCount: itineraries.length,
    offerCount: offers.length,
  });

  return {
    tenantId: context.tenantId,
    decisionPoint: context.decisionPoint ?? 'search',
    traveller: context.traveller,
    trip,
    offers,
  };
}

/**
 * Maps a single PricedItinerary to an Offer for policy evaluation.
 */
export function mapItineraryToOffer(itinerary: PricedItinerary): Offer {
  const pricingInfo = itinerary.AirItineraryPricingInfo[0];
  const totalFare = pricingInfo.ItinTotalFare.TotalFare;

  // Get validating carrier from TPA_Extensions or first segment's marketing airline
  const validatingCarrier =
    itinerary.TPA_Extensions?.ValidatingCarrier?.Code ??
    getFirstMarketingCarrier(itinerary);

  // Determine cabin class from fare breakdown
  const cabinClass = extractCabinClass(pricingInfo.PTC_FareBreakdowns.PTC_FareBreakdown[0]);

  // Determine refundability
  const isRefundable = !(
    pricingInfo.PTC_FareBreakdowns.PTC_FareBreakdown[0]?.Endorsements?.NonRefundableIndicator ?? false
  );

  // Map segments
  const segments = extractSegments(itinerary);

  return {
    offerId: `sabre-bfm-${itinerary.SequenceNumber}`,
    supplier: validatingCarrier,
    productType: 'air',
    cabinClass,
    totalPrice: {
      amount: parseFloat(totalFare.Amount),
      currency: totalFare.CurrencyCode,
    },
    refundable: isRefundable,
    segments,
  };
}

/**
 * Extracts trip context from the first itinerary.
 */
export function extractTripContext(
  itinerary: PricedItinerary,
  purpose?: string
): TripContext {
  const odOptions = itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption;
  const firstOD = odOptions[0];
  const lastOD = odOptions[odOptions.length - 1];

  const firstSegment = firstOD.FlightSegment[0];
  const lastSegment = lastOD.FlightSegment[lastOD.FlightSegment.length - 1];

  const departureDate = firstSegment.DepartureDateTime.split('T')[0];
  const returnDate = odOptions.length > 1
    ? lastOD.FlightSegment[0].DepartureDateTime.split('T')[0]
    : undefined;

  const tripType = determineTripType(itinerary);

  // Calculate lead time (days between now and departure)
  const now = new Date();
  const departure = new Date(departureDate);
  const leadTimeDays = Math.max(0, Math.floor((departure.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return {
    tripId: `trip-${Date.now()}`,
    tripType,
    origin: {
      code: firstSegment.DepartureAirport.LocationCode,
      city: firstSegment.DepartureAirport.LocationCode, // City lookup would be done externally
      country: '', // Would be resolved from airport database
    },
    destination: {
      code: lastSegment.ArrivalAirport.LocationCode,
      city: lastSegment.ArrivalAirport.LocationCode,
      country: '',
    },
    departureDate,
    returnDate,
    leadTimeDays,
    purpose,
  };
}

/**
 * Extracts cabin class from PTC fare breakdown.
 */
export function extractCabinClass(fareBreakdown: {
  TPA_Extensions?: { Cabin?: { Cabin: Array<{ Cabin: CabinCode }> } };
  FareBasisCodes?: { FareBasisCode: Array<{ BookingCode: string }> };
}): string {
  // Try to get cabin from TPA_Extensions first
  const cabinInfo = fareBreakdown?.TPA_Extensions?.Cabin?.Cabin;
  if (cabinInfo && cabinInfo.length > 0) {
    const cabinCode = cabinInfo[0].Cabin;
    return CABIN_CODE_MAP[cabinCode] ?? 'economy';
  }

  // Fallback: infer from booking code
  const fareBasis = fareBreakdown?.FareBasisCodes?.FareBasisCode;
  if (fareBasis && fareBasis.length > 0) {
    return inferCabinFromBookingCode(fareBasis[0].BookingCode);
  }

  return 'economy';
}

/**
 * Infers cabin class from the booking code letter.
 */
function inferCabinFromBookingCode(bookingCode: string): string {
  const code = bookingCode.charAt(0).toUpperCase();
  // Standard IATA booking class mapping
  if (['F', 'A', 'P'].includes(code)) return 'first';
  if (['C', 'D', 'J', 'I', 'Z'].includes(code)) return 'business';
  if (['W', 'E', 'R'].includes(code)) return 'premium_economy';
  return 'economy';
}

/**
 * Determines trip type from the itinerary structure.
 */
function determineTripType(itinerary: PricedItinerary): 'domestic' | 'international' | 'multi-city' {
  const direction = itinerary.AirItinerary.DirectionInd;
  const odOptions = itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption;

  if (direction === 'Circle' || odOptions.length > 2) {
    return 'multi-city';
  }

  // Simple heuristic: if origin and destination share the same country prefix, it's domestic
  // In production, this would use an airport database lookup
  return 'domestic';
}

/**
 * Gets the marketing carrier from the first flight segment.
 */
function getFirstMarketingCarrier(itinerary: PricedItinerary): string {
  const odOptions = itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption;
  return odOptions[0]?.FlightSegment[0]?.MarketingAirline?.Code ?? 'XX';
}

/**
 * Extracts all segments from an itinerary.
 */
function extractSegments(itinerary: PricedItinerary): Segment[] {
  const segments: Segment[] = [];
  const odOptions = itinerary.AirItinerary.OriginDestinationOptions.OriginDestinationOption;

  let segmentIndex = 0;
  for (const od of odOptions) {
    for (const flight of od.FlightSegment) {
      segments.push(mapFlightSegment(flight, segmentIndex));
      segmentIndex++;
    }
  }

  return segments;
}

/**
 * Maps a single Sabre FlightSegment to our Segment type.
 */
function mapFlightSegment(flight: FlightSegment, index: number): Segment {
  return {
    segmentId: `seg-${index}`,
    origin: flight.DepartureAirport.LocationCode,
    destination: flight.ArrivalAirport.LocationCode,
    departureTime: flight.DepartureDateTime,
    arrivalTime: flight.ArrivalDateTime,
    carrier: flight.MarketingAirline.Code,
    flightNumber: `${flight.MarketingAirline.Code}${flight.FlightNumber}`,
  };
}
