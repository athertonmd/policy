import { describe, it, expect } from 'vitest';
import {
  mapBfmResponseToPolicyRequest,
  mapItineraryToOffer,
  extractTripContext,
  extractCabinClass,
} from '../src/search/fare-mapper.js';
import type { OTA_AirLowFareSearchRS, PricedItinerary } from '../src/types/sabre-types.js';
import type { FareMapperContext } from '../src/search/fare-mapper.js';

// --- Test Fixtures ---

function createMockBfmResponse(overrides?: Partial<PricedItinerary>): OTA_AirLowFareSearchRS {
  return {
    OTA_AirLowFareSearchRS: {
      PricedItineraries: {
        PricedItinerary: [createMockItinerary(1, overrides), createMockItinerary(2, overrides)],
      },
    },
  };
}

function createMockItinerary(sequenceNumber: number, overrides?: Partial<PricedItinerary>): PricedItinerary {
  return {
    SequenceNumber: sequenceNumber,
    AirItinerary: {
      DirectionInd: 'Return',
      OriginDestinationOptions: {
        OriginDestinationOption: [
          {
            FlightSegment: [
              {
                DepartureAirport: { LocationCode: 'JFK' },
                ArrivalAirport: { LocationCode: 'LHR' },
                DepartureDateTime: '2025-03-15T08:00:00',
                ArrivalDateTime: '2025-03-15T20:00:00',
                FlightNumber: '100',
                MarketingAirline: { Code: 'BA' },
                ResBookDesigCode: 'Y',
                ElapsedTime: 420,
                StopQuantity: 0,
              },
            ],
            ElapsedTime: 420,
          },
          {
            FlightSegment: [
              {
                DepartureAirport: { LocationCode: 'LHR' },
                ArrivalAirport: { LocationCode: 'JFK' },
                DepartureDateTime: '2025-03-20T10:00:00',
                ArrivalDateTime: '2025-03-20T14:00:00',
                FlightNumber: '101',
                MarketingAirline: { Code: 'BA' },
                ResBookDesigCode: 'Y',
                ElapsedTime: 480,
                StopQuantity: 0,
              },
            ],
            ElapsedTime: 480,
          },
        ],
      },
    },
    AirItineraryPricingInfo: [
      {
        PricingSource: 'ATPC',
        PricingSubSource: 'S',
        FareReturned: true,
        ItinTotalFare: {
          BaseFare: { Amount: '800.00', CurrencyCode: 'USD', DecimalPlaces: 2 },
          Taxes: { Tax: [{ TaxCode: 'US', Amount: '50.00', CurrencyCode: 'USD' }], TotalAmount: '50.00' },
          TotalFare: { Amount: '850.00', CurrencyCode: 'USD', DecimalPlaces: 2 },
        },
        PTC_FareBreakdowns: {
          PTC_FareBreakdown: [
            {
              PassengerTypeQuantity: { Code: 'ADT', Quantity: 1 },
              FareBasisCodes: {
                FareBasisCode: [
                  {
                    BookingCode: 'Y',
                    DepartureAirportCode: 'JFK',
                    ArrivalAirportCode: 'LHR',
                    FareComponentBeginAirport: 'JFK',
                    FareComponentEndAirport: 'LHR',
                    content: 'YOWUS',
                  },
                ],
              },
              PassengerFare: {
                BaseFare: { Amount: '800.00', CurrencyCode: 'USD' },
                Taxes: { Tax: [{ TaxCode: 'US', Amount: '50.00', CurrencyCode: 'USD' }], TotalAmount: '50.00' },
                TotalFare: { Amount: '850.00', CurrencyCode: 'USD' },
              },
              Endorsements: { NonRefundableIndicator: false },
              TPA_Extensions: {
                Cabin: { Cabin: [{ Cabin: 'Y' }] },
              },
            },
          ],
        },
      },
    ],
    TicketingInfo: { TicketType: 'eTicket' },
    TPA_Extensions: {
      ValidatingCarrier: { Code: 'BA' },
    },
    ...overrides,
  };
}

const mockContext: FareMapperContext = {
  tenantId: 'tenant-123',
  traveller: {
    travellerId: 'trav-001',
    employeeId: 'emp-001',
    department: 'Engineering',
    costCentre: 'CC-100',
    seniorityLevel: 'senior',
    region: 'US',
  },
  tripPurpose: 'client meeting',
  decisionPoint: 'search',
};

// --- Tests ---

describe('fare-mapper', () => {
  describe('mapBfmResponseToPolicyRequest', () => {
    it('should map a BFM response to a PolicyDecisionRequest', () => {
      const bfmResponse = createMockBfmResponse();
      const result = mapBfmResponseToPolicyRequest(bfmResponse, mockContext);

      expect(result.tenantId).toBe('tenant-123');
      expect(result.decisionPoint).toBe('search');
      expect(result.traveller).toEqual(mockContext.traveller);
      expect(result.offers).toHaveLength(2);
      expect(result.trip).toBeDefined();
    });

    it('should include trip purpose in the trip context', () => {
      const bfmResponse = createMockBfmResponse();
      const result = mapBfmResponseToPolicyRequest(bfmResponse, mockContext);

      expect(result.trip.purpose).toBe('client meeting');
    });

    it('should use default decisionPoint when not provided', () => {
      const bfmResponse = createMockBfmResponse();
      const contextWithoutDecisionPoint = { ...mockContext, decisionPoint: undefined };
      const result = mapBfmResponseToPolicyRequest(bfmResponse, contextWithoutDecisionPoint);

      expect(result.decisionPoint).toBe('search');
    });
  });

  describe('mapItineraryToOffer', () => {
    it('should map a PricedItinerary to an Offer', () => {
      const itinerary = createMockItinerary(1);
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.offerId).toBe('sabre-bfm-1');
      expect(offer.supplier).toBe('BA');
      expect(offer.productType).toBe('air');
      expect(offer.cabinClass).toBe('economy');
      expect(offer.totalPrice).toEqual({ amount: 850, currency: 'USD' });
      expect(offer.refundable).toBe(true);
    });

    it('should extract segments from all OD options', () => {
      const itinerary = createMockItinerary(1);
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.segments).toHaveLength(2);
      expect(offer.segments![0].origin).toBe('JFK');
      expect(offer.segments![0].destination).toBe('LHR');
      expect(offer.segments![1].origin).toBe('LHR');
      expect(offer.segments![1].destination).toBe('JFK');
    });

    it('should use ValidatingCarrier from TPA_Extensions', () => {
      const itinerary = createMockItinerary(1);
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.supplier).toBe('BA');
    });

    it('should fall back to first marketing carrier when ValidatingCarrier is missing', () => {
      const itinerary = createMockItinerary(1, { TPA_Extensions: undefined });
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.supplier).toBe('BA');
    });

    it('should mark non-refundable fares correctly', () => {
      const itinerary = createMockItinerary(1);
      itinerary.AirItineraryPricingInfo[0].PTC_FareBreakdowns.PTC_FareBreakdown[0].Endorsements = {
        NonRefundableIndicator: true,
      };
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.refundable).toBe(false);
    });

    it('should generate correct flight numbers', () => {
      const itinerary = createMockItinerary(1);
      const offer = mapItineraryToOffer(itinerary);

      expect(offer.segments![0].flightNumber).toBe('BA100');
      expect(offer.segments![1].flightNumber).toBe('BA101');
    });
  });

  describe('extractTripContext', () => {
    it('should extract origin and destination from first/last segments', () => {
      const itinerary = createMockItinerary(1);
      const trip = extractTripContext(itinerary);

      expect(trip.origin.code).toBe('JFK');
      expect(trip.destination.code).toBe('JFK'); // Return trip ends at origin
    });

    it('should extract departure date from first segment', () => {
      const itinerary = createMockItinerary(1);
      const trip = extractTripContext(itinerary);

      expect(trip.departureDate).toBe('2025-03-15');
    });

    it('should extract return date from second OD option', () => {
      const itinerary = createMockItinerary(1);
      const trip = extractTripContext(itinerary);

      expect(trip.returnDate).toBe('2025-03-20');
    });

    it('should calculate lead time in days', () => {
      const itinerary = createMockItinerary(1);
      const trip = extractTripContext(itinerary);

      // Lead time should be >= 0 (depends on current date)
      expect(trip.leadTimeDays).toBeGreaterThanOrEqual(0);
    });

    it('should include trip purpose when provided', () => {
      const itinerary = createMockItinerary(1);
      const trip = extractTripContext(itinerary, 'conference');

      expect(trip.purpose).toBe('conference');
    });
  });

  describe('extractCabinClass', () => {
    it('should extract cabin class from TPA_Extensions', () => {
      const fareBreakdown = {
        TPA_Extensions: { Cabin: { Cabin: [{ Cabin: 'C' as const }] } },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('business');
    });

    it('should map Y cabin code to economy', () => {
      const fareBreakdown = {
        TPA_Extensions: { Cabin: { Cabin: [{ Cabin: 'Y' as const }] } },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('economy');
    });

    it('should map F cabin code to first', () => {
      const fareBreakdown = {
        TPA_Extensions: { Cabin: { Cabin: [{ Cabin: 'F' as const }] } },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('first');
    });

    it('should map J cabin code to business', () => {
      const fareBreakdown = {
        TPA_Extensions: { Cabin: { Cabin: [{ Cabin: 'J' as const }] } },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('business');
    });

    it('should map S cabin code to premium_economy', () => {
      const fareBreakdown = {
        TPA_Extensions: { Cabin: { Cabin: [{ Cabin: 'S' as const }] } },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('premium_economy');
    });

    it('should fall back to booking code inference when cabin info is missing', () => {
      const fareBreakdown = {
        FareBasisCodes: {
          FareBasisCode: [
            {
              BookingCode: 'C',
              DepartureAirportCode: 'JFK',
              ArrivalAirportCode: 'LHR',
              FareComponentBeginAirport: 'JFK',
              FareComponentEndAirport: 'LHR',
              content: 'COWUS',
            },
          ],
        },
      };
      expect(extractCabinClass(fareBreakdown)).toBe('business');
    });

    it('should default to economy when no cabin info is available', () => {
      const fareBreakdown = {};
      expect(extractCabinClass(fareBreakdown)).toBe('economy');
    });
  });
});
