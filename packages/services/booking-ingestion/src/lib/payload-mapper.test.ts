/**
 * Unit tests for the payload mapping engine.
 * Tests configurable field extraction, type coercion, and canonical output.
 */
import { describe, it, expect } from 'vitest';
import {
  mapPayload,
  extractField,
  PayloadMappingError,
  type PayloadMappingConfig,
} from './payload-mapper.js';

/**
 * Helper: creates a standard mapping config for a typical OBT integration.
 */
function createStandardMappingConfig(): PayloadMappingConfig {
  return {
    tenantIdField: 'organisation.tenantId',
    travellerMapping: {
      travellerIdField: 'traveller.id',
      employeeIdField: 'traveller.employeeNumber',
      departmentField: 'traveller.department',
      costCentreField: 'traveller.costCentre',
      seniorityLevelField: 'traveller.level',
      regionField: 'traveller.region',
    },
    tripMapping: {
      tripIdField: 'booking.tripId',
      tripTypeField: 'booking.type',
      originField: 'booking.origin',
      destinationField: 'booking.destination',
      departureDateField: 'booking.departureDate',
      returnDateField: 'booking.returnDate',
      purposeField: 'booking.purpose',
    },
    offerMapping: {
      offersArrayField: 'booking.offers',
      offerIdField: 'id',
      supplierField: 'supplier',
      productTypeField: 'type',
      cabinClassField: 'cabin',
      totalPriceField: 'price',
      currencyField: 'currency',
      carbonFootprintField: 'carbonKg',
      refundableField: 'refundable',
    },
  };
}

/**
 * Helper: creates a standard raw payload matching the standard mapping config.
 */
function createStandardPayload() {
  return {
    organisation: { tenantId: 'tenant-001' },
    traveller: {
      id: 'trav-123',
      employeeNumber: 'EMP-456',
      department: 'Engineering',
      costCentre: 'CC-100',
      level: 'senior',
      region: 'UK',
    },
    booking: {
      tripId: 'trip-789',
      type: 'domestic',
      origin: { code: 'LHR', city: 'London', country: 'GB' },
      destination: { code: 'EDI', city: 'Edinburgh', country: 'GB' },
      departureDate: '2025-03-15',
      returnDate: '2025-03-18',
      purpose: 'Client meeting',
      offers: [
        {
          id: 'offer-001',
          supplier: 'British Airways',
          type: 'air',
          cabin: 'economy',
          price: 250.0,
          currency: 'GBP',
          carbonKg: 95,
          refundable: true,
        },
        {
          id: 'offer-002',
          supplier: 'LNER',
          type: 'rail',
          cabin: 'standard',
          price: 120.0,
          currency: 'GBP',
          carbonKg: 12,
          refundable: false,
        },
      ],
    },
  };
}

describe('extractField', () => {
  it('should extract a top-level field', () => {
    expect(extractField({ name: 'test' }, 'name')).toBe('test');
  });

  it('should extract a nested field', () => {
    const obj = { a: { b: { c: 'deep' } } };
    expect(extractField(obj, 'a.b.c')).toBe('deep');
  });

  it('should extract from arrays with bracket notation', () => {
    const obj = { items: ['first', 'second', 'third'] };
    expect(extractField(obj, 'items[1]')).toBe('second');
  });

  it('should extract nested objects within arrays', () => {
    const obj = { data: { items: [{ name: 'a' }, { name: 'b' }] } };
    expect(extractField(obj, 'data.items[0].name')).toBe('a');
  });

  it('should return undefined for missing paths', () => {
    expect(extractField({ a: 1 }, 'b')).toBeUndefined();
    expect(extractField({ a: { b: 1 } }, 'a.c')).toBeUndefined();
  });

  it('should return undefined for null/undefined input', () => {
    expect(extractField(null, 'a')).toBeUndefined();
    expect(extractField(undefined, 'a')).toBeUndefined();
  });

  it('should return undefined when traversing non-objects', () => {
    expect(extractField({ a: 'string' }, 'a.b')).toBeUndefined();
  });

  it('should return undefined for array index on non-array', () => {
    expect(extractField({ items: 'not-array' }, 'items[0]')).toBeUndefined();
  });

  it('should handle numeric values', () => {
    expect(extractField({ price: 99.99 }, 'price')).toBe(99.99);
  });

  it('should handle boolean values', () => {
    expect(extractField({ active: true }, 'active')).toBe(true);
  });
});

describe('mapPayload', () => {
  const config = createStandardMappingConfig();

  describe('successful mapping', () => {
    it('should map a complete payload to PolicyDecisionRequest', () => {
      const payload = createStandardPayload();
      const result = mapPayload(payload, config);

      expect(result.tenantId).toBe('tenant-001');
      expect(result.decisionPoint).toBe('post-booking');
      expect(result.traveller.travellerId).toBe('trav-123');
      expect(result.traveller.employeeId).toBe('EMP-456');
      expect(result.traveller.department).toBe('Engineering');
      expect(result.traveller.costCentre).toBe('CC-100');
      expect(result.traveller.seniorityLevel).toBe('senior');
      expect(result.traveller.region).toBe('UK');
    });

    it('should map trip context correctly', () => {
      const payload = createStandardPayload();
      const result = mapPayload(payload, config);

      expect(result.trip.tripId).toBe('trip-789');
      expect(result.trip.tripType).toBe('domestic');
      expect(result.trip.origin).toEqual({ code: 'LHR', city: 'London', country: 'GB' });
      expect(result.trip.destination).toEqual({ code: 'EDI', city: 'Edinburgh', country: 'GB' });
      expect(result.trip.departureDate).toBe('2025-03-15');
      expect(result.trip.returnDate).toBe('2025-03-18');
      expect(result.trip.purpose).toBe('Client meeting');
      expect(result.trip.leadTimeDays).toBeGreaterThanOrEqual(0);
    });

    it('should map offers correctly', () => {
      const payload = createStandardPayload();
      const result = mapPayload(payload, config);

      expect(result.offers).toHaveLength(2);
      expect(result.offers[0]).toEqual({
        offerId: 'offer-001',
        supplier: 'British Airways',
        productType: 'air',
        cabinClass: 'economy',
        totalPrice: { amount: 250.0, currency: 'GBP' },
        carbonFootprintKg: 95,
        refundable: true,
      });
      expect(result.offers[1]).toEqual({
        offerId: 'offer-002',
        supplier: 'LNER',
        productType: 'rail',
        cabinClass: 'standard',
        totalPrice: { amount: 120.0, currency: 'GBP' },
        carbonFootprintKg: 12,
        refundable: false,
      });
    });

    it('should handle string-based location values', () => {
      const payload = createStandardPayload();
      (payload.booking as Record<string, unknown>).origin = 'LHR';
      (payload.booking as Record<string, unknown>).destination = 'EDI';

      const result = mapPayload(payload, config);

      expect(result.trip.origin).toEqual({ code: 'LHR', city: '', country: '' });
      expect(result.trip.destination).toEqual({ code: 'EDI', city: '', country: '' });
    });

    it('should use defaults for optional traveller fields when not configured', () => {
      const minimalConfig: PayloadMappingConfig = {
        ...config,
        travellerMapping: {
          travellerIdField: 'traveller.id',
          employeeIdField: 'traveller.employeeNumber',
          departmentField: 'traveller.department',
        },
      };

      const payload = createStandardPayload();
      const result = mapPayload(payload, minimalConfig);

      expect(result.traveller.costCentre).toBe('default');
      expect(result.traveller.seniorityLevel).toBe('standard');
      expect(result.traveller.region).toBe('global');
    });
  });

  describe('trip type normalisation', () => {
    it('should normalise "international" trip type', () => {
      const payload = createStandardPayload();
      payload.booking.type = 'international';
      const result = mapPayload(payload, config);
      expect(result.trip.tripType).toBe('international');
    });

    it('should normalise "multi-city" trip type', () => {
      const payload = createStandardPayload();
      payload.booking.type = 'multi-city';
      const result = mapPayload(payload, config);
      expect(result.trip.tripType).toBe('multi-city');
    });

    it('should normalise common aliases', () => {
      const payload = createStandardPayload();

      payload.booking.type = 'intl';
      expect(mapPayload(payload, config).trip.tripType).toBe('international');

      payload.booking.type = 'multicity';
      expect(mapPayload(payload, config).trip.tripType).toBe('multi-city');

      payload.booking.type = 'dom';
      expect(mapPayload(payload, config).trip.tripType).toBe('domestic');
    });

    it('should default to "domestic" for unknown trip types', () => {
      const payload = createStandardPayload();
      payload.booking.type = 'unknown_type';
      const result = mapPayload(payload, config);
      expect(result.trip.tripType).toBe('domestic');
    });
  });

  describe('product type normalisation', () => {
    it('should normalise common product type aliases', () => {
      const payload = createStandardPayload();

      payload.booking.offers[0].type = 'flight';
      expect(mapPayload(payload, config).offers[0].productType).toBe('air');

      payload.booking.offers[0].type = 'accommodation';
      expect(mapPayload(payload, config).offers[0].productType).toBe('hotel');

      payload.booking.offers[0].type = 'rental';
      expect(mapPayload(payload, config).offers[0].productType).toBe('car');

      payload.booking.offers[0].type = 'train';
      expect(mapPayload(payload, config).offers[0].productType).toBe('rail');
    });
  });

  describe('type coercion', () => {
    it('should coerce numeric strings to numbers for price', () => {
      const payload = createStandardPayload();
      (payload.booking.offers[0] as Record<string, unknown>).price = '350.50';
      const result = mapPayload(payload, config);
      expect(result.offers[0].totalPrice.amount).toBe(350.5);
    });

    it('should coerce string booleans for refundable', () => {
      const payload = createStandardPayload();
      (payload.booking.offers[0] as Record<string, unknown>).refundable = 'true';
      const result = mapPayload(payload, config);
      expect(result.offers[0].refundable).toBe(true);
    });

    it('should default currency to GBP when missing', () => {
      const payload = createStandardPayload();
      (payload.booking.offers[0] as Record<string, unknown>).currency = '';
      const result = mapPayload(payload, config);
      expect(result.offers[0].totalPrice.currency).toBe('GBP');
    });
  });

  describe('error handling', () => {
    it('should throw PayloadMappingError for null payload', () => {
      expect(() => mapPayload(null, config)).toThrow(PayloadMappingError);
    });

    it('should throw PayloadMappingError for undefined payload', () => {
      expect(() => mapPayload(undefined, config)).toThrow(PayloadMappingError);
    });

    it('should throw PayloadMappingError for non-object payload', () => {
      expect(() => mapPayload('string', config)).toThrow(PayloadMappingError);
    });

    it('should throw PayloadMappingError when tenantId is missing', () => {
      const payload = createStandardPayload();
      delete (payload as Record<string, unknown>).organisation;

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
      try {
        mapPayload(payload, config);
      } catch (e) {
        expect((e as PayloadMappingError).field).toBe('tenantId');
      }
    });

    it('should throw PayloadMappingError when travellerId is missing', () => {
      const payload = createStandardPayload();
      delete (payload.traveller as Record<string, unknown>).id;

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
      try {
        mapPayload(payload, config);
      } catch (e) {
        expect((e as PayloadMappingError).field).toBe('travellerId');
      }
    });

    it('should throw PayloadMappingError when tripId is missing', () => {
      const payload = createStandardPayload();
      delete (payload.booking as Record<string, unknown>).tripId;

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
      try {
        mapPayload(payload, config);
      } catch (e) {
        expect((e as PayloadMappingError).field).toBe('tripId');
      }
    });

    it('should throw PayloadMappingError when offers array is missing', () => {
      const payload = createStandardPayload();
      delete (payload.booking as Record<string, unknown>).offers;

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
      try {
        mapPayload(payload, config);
      } catch (e) {
        expect((e as PayloadMappingError).field).toBe('offers');
      }
    });

    it('should throw PayloadMappingError when offers array is empty', () => {
      const payload = createStandardPayload();
      payload.booking.offers = [];

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
    });

    it('should throw PayloadMappingError when offer is not an object', () => {
      const payload = createStandardPayload();
      (payload.booking.offers as unknown[]) = ['not-an-object'];

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
    });

    it('should throw PayloadMappingError when offerId is missing', () => {
      const payload = createStandardPayload();
      delete (payload.booking.offers[0] as Record<string, unknown>).id;

      expect(() => mapPayload(payload, config)).toThrow(PayloadMappingError);
      try {
        mapPayload(payload, config);
      } catch (e) {
        expect((e as PayloadMappingError).field).toBe('offerId');
      }
    });
  });

  describe('different integration source mappings', () => {
    it('should handle a GDS-style flat payload', () => {
      const gdsConfig: PayloadMappingConfig = {
        tenantIdField: 'tenant',
        travellerMapping: {
          travellerIdField: 'pax.paxId',
          employeeIdField: 'pax.corpId',
          departmentField: 'pax.dept',
        },
        tripMapping: {
          tripIdField: 'pnr',
          tripTypeField: 'journeyType',
          originField: 'segments[0].departure',
          destinationField: 'segments[0].arrival',
          departureDateField: 'segments[0].date',
        },
        offerMapping: {
          offersArrayField: 'fares',
          offerIdField: 'fareId',
          supplierField: 'airline',
          productTypeField: 'mode',
          totalPriceField: 'total',
          currencyField: 'curr',
        },
      };

      const gdsPayload = {
        tenant: 'tenant-gds-001',
        pax: { paxId: 'PAX-1', corpId: 'CORP-1', dept: 'Sales' },
        pnr: 'ABC123',
        journeyType: 'international',
        segments: [
          { departure: 'LHR', arrival: 'JFK', date: '2025-06-01' },
        ],
        fares: [
          { fareId: 'F1', airline: 'AA', mode: 'flight', total: 899, curr: 'USD' },
        ],
      };

      const result = mapPayload(gdsPayload, gdsConfig);

      expect(result.tenantId).toBe('tenant-gds-001');
      expect(result.traveller.travellerId).toBe('PAX-1');
      expect(result.traveller.employeeId).toBe('CORP-1');
      expect(result.traveller.department).toBe('Sales');
      expect(result.trip.tripId).toBe('ABC123');
      expect(result.trip.tripType).toBe('international');
      expect(result.trip.origin).toEqual({ code: 'LHR', city: '', country: '' });
      expect(result.trip.destination).toEqual({ code: 'JFK', city: '', country: '' });
      expect(result.offers[0].offerId).toBe('F1');
      expect(result.offers[0].supplier).toBe('AA');
      expect(result.offers[0].productType).toBe('air');
      expect(result.offers[0].totalPrice).toEqual({ amount: 899, currency: 'USD' });
    });

    it('should handle deeply nested TMC payload', () => {
      const tmcConfig: PayloadMappingConfig = {
        tenantIdField: 'meta.client.id',
        travellerMapping: {
          travellerIdField: 'request.passenger.profile.uid',
          employeeIdField: 'request.passenger.profile.employeeRef',
          departmentField: 'request.passenger.org.division',
          costCentreField: 'request.passenger.org.costCode',
        },
        tripMapping: {
          tripIdField: 'request.itinerary.ref',
          tripTypeField: 'request.itinerary.classification',
          originField: 'request.itinerary.legs[0].from',
          destinationField: 'request.itinerary.legs[0].to',
          departureDateField: 'request.itinerary.legs[0].departDate',
        },
        offerMapping: {
          offersArrayField: 'request.itinerary.quotes',
          offerIdField: 'quoteRef',
          supplierField: 'vendor',
          productTypeField: 'serviceType',
          totalPriceField: 'cost.amount',
          currencyField: 'cost.iso',
        },
      };

      const tmcPayload = {
        meta: { client: { id: 'tenant-tmc-001' } },
        request: {
          passenger: {
            profile: { uid: 'USR-99', employeeRef: 'EMP-99' },
            org: { division: 'Finance', costCode: 'FIN-200' },
          },
          itinerary: {
            ref: 'ITN-555',
            classification: 'dom',
            legs: [
              { from: 'MAN', to: 'LHR', departDate: '2025-04-10' },
            ],
            quotes: [
              {
                quoteRef: 'Q-1',
                vendor: 'EasyJet',
                serviceType: 'air',
                cost: { amount: 89.99, iso: 'GBP' },
              },
            ],
          },
        },
      };

      const result = mapPayload(tmcPayload, tmcConfig);

      expect(result.tenantId).toBe('tenant-tmc-001');
      expect(result.traveller.travellerId).toBe('USR-99');
      expect(result.traveller.costCentre).toBe('FIN-200');
      expect(result.trip.tripId).toBe('ITN-555');
      expect(result.trip.tripType).toBe('domestic');
      expect(result.offers[0].totalPrice).toEqual({ amount: 89.99, currency: 'GBP' });
    });
  });
});
