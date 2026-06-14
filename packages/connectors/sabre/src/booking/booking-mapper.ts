/**
 * Booking Mapper — Maps Sabre PNR/booking data to our PolicyDecisionRequest format.
 * Used by the pre-ticket validator to evaluate a booked PNR against policy.
 */

import type {
  PolicyDecisionRequest,
  TravellerContext,
  TripContext,
  Offer,
  Segment,
} from '@travel-policy/shared';
import type {
  GetReservationRS,
  PassengerInfo,
  AirSegment,
  PriceQuote,
  CabinCode,
} from '../types/sabre-types.js';
import { CABIN_CODE_MAP } from '../types/sabre-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('booking-mapper');

export interface BookingMapperContext {
  /** Tenant ID for policy evaluation */
  tenantId: string;
  /** Pre-resolved traveller context (from profile lookup) */
  traveller?: TravellerContext;
  /** Decision point for this evaluation */
  decisionPoint: string;
}

/**
 * Maps a Sabre GetReservation response to a PolicyDecisionRequest.
 */
export function mapReservationToPolicyRequest(
  reservation: GetReservationRS,
  context: BookingMapperContext
): PolicyDecisionRequest {
  const { Reservation } = reservation;
  const { BookingDetails, PassengerReservation, PriceQuote } = Reservation;

  // Extract air segments
  const airSegments = PassengerReservation.Segments.Segment
    .filter((seg) => seg.Air != null)
    .map((seg) => seg.Air!);

  if (airSegments.length === 0) {
    throw new Error(`No air segments found in PNR ${BookingDetails.RecordLocator}`);
  }

  // Build traveller context
  const traveller = context.traveller ?? buildTravellerFromPassenger(
    PassengerReservation.Passengers.Passenger[0]
  );

  // Build trip context
  const trip = buildTripContext(airSegments, BookingDetails.RecordLocator);

  // Build offer from PNR pricing
  const offer = buildOfferFromReservation(airSegments, PriceQuote, BookingDetails.RecordLocator);

  logger.info('Mapped reservation to policy request', {
    recordLocator: BookingDetails.RecordLocator,
    segmentCount: airSegments.length,
    passengerCount: PassengerReservation.Passengers.Passenger.length,
  });

  return {
    tenantId: context.tenantId,
    decisionPoint: context.decisionPoint,
    traveller,
    trip,
    offers: [offer],
  };
}

/**
 * Builds a minimal TravellerContext from Sabre passenger info.
 * In production, this would be enriched from the traveller profile database.
 */
function buildTravellerFromPassenger(passenger: PassengerInfo): TravellerContext {
  return {
    travellerId: passenger.NameId,
    employeeId: passenger.Loyalty?.MembershipID ?? passenger.NameId,
    department: '', // Would be resolved from profile
    costCentre: '', // Would be resolved from profile
    seniorityLevel: '', // Would be resolved from profile
    region: '', // Would be resolved from profile
    loyaltyTiers: passenger.FrequentFlyer
      ? { [passenger.FrequentFlyer.AirlineCode]: 'member' }
      : undefined,
  };
}

/**
 * Builds trip context from air segments.
 */
function buildTripContext(airSegments: AirSegment[], recordLocator: string): TripContext {
  const firstSegment = airSegments[0];
  const lastSegment = airSegments[airSegments.length - 1];

  const departureDate = firstSegment.DepartureDateTime.split('T')[0];

  // Determine if there's a return leg
  const returnSegments = airSegments.filter(
    (seg) => seg.DepartureAirport === lastSegment.ArrivalAirport
  );
  const returnDate = returnSegments.length > 0
    ? returnSegments[0].DepartureDateTime.split('T')[0]
    : undefined;

  // Calculate lead time
  const now = new Date();
  const departure = new Date(departureDate);
  const leadTimeDays = Math.max(0, Math.floor((departure.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  // Determine trip type
  const uniqueAirports = new Set(
    airSegments.flatMap((seg) => [seg.DepartureAirport, seg.ArrivalAirport])
  );
  const tripType = uniqueAirports.size > 4 ? 'multi-city' : 'domestic';

  return {
    tripId: `pnr-${recordLocator}`,
    tripType,
    origin: {
      code: firstSegment.DepartureAirport,
      city: firstSegment.DepartureAirport,
      country: '',
    },
    destination: {
      code: lastSegment.ArrivalAirport,
      city: lastSegment.ArrivalAirport,
      country: '',
    },
    departureDate,
    returnDate,
    leadTimeDays,
  };
}

/**
 * Builds an Offer from reservation segments and price quote.
 */
function buildOfferFromReservation(
  airSegments: AirSegment[],
  priceQuotes: PriceQuote[] | undefined,
  recordLocator: string
): Offer {
  const firstSegment = airSegments[0];

  // Get total fare from price quote if available
  let totalAmount = 0;
  let currency = 'USD';

  if (priceQuotes && priceQuotes.length > 0) {
    const totalFare = priceQuotes[0].PricedItinerary.AirItineraryPricingInfo.ItinTotalFare.TotalFare;
    totalAmount = parseFloat(totalFare.Amount);
    currency = totalFare.CurrencyCode;
  }

  // Map cabin class
  const cabinClass = CABIN_CODE_MAP[firstSegment.CabinCode as CabinCode] ?? 'economy';

  // Map segments
  const segments: Segment[] = airSegments.map((seg, index) => ({
    segmentId: `seg-${index}`,
    origin: seg.DepartureAirport,
    destination: seg.ArrivalAirport,
    departureTime: seg.DepartureDateTime,
    arrivalTime: seg.ArrivalDateTime,
    carrier: seg.MarketingAirlineCode,
    flightNumber: `${seg.MarketingAirlineCode}${seg.FlightNumber}`,
  }));

  return {
    offerId: `pnr-${recordLocator}`,
    supplier: firstSegment.MarketingAirlineCode,
    productType: 'air',
    cabinClass,
    totalPrice: { amount: totalAmount, currency },
    refundable: false, // Would need fare rules lookup
    segments,
  };
}
