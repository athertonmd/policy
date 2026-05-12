/**
 * Payload Mapping Engine for Booking Ingestion Service.
 *
 * Transforms raw webhook payloads from various integration sources (OBT, GDS, TMC)
 * into canonical PolicyDecisionRequest structures using configurable field mappings.
 *
 * Supports JSONPath-like field extraction, nested objects, arrays, and type coercion.
 *
 * Requirements: 7.2
 */
import type {
  PolicyDecisionRequest,
  TravellerContext,
  TripContext,
  Offer,
  TripType,
  ProductType,
} from '@travel-policy/shared';

/**
 * Configurable payload mapping per integration source.
 * Each field uses a dot-notation path to extract values from the raw payload.
 */
export interface PayloadMappingConfig {
  tenantIdField: string;
  travellerMapping: {
    travellerIdField: string;
    employeeIdField: string;
    departmentField: string;
    costCentreField?: string;
    seniorityLevelField?: string;
    regionField?: string;
  };
  tripMapping: {
    tripIdField: string;
    tripTypeField: string;
    originField: string;
    destinationField: string;
    departureDateField: string;
    returnDateField?: string;
    purposeField?: string;
  };
  offerMapping: {
    offersArrayField: string;
    offerIdField: string;
    supplierField: string;
    productTypeField: string;
    cabinClassField?: string;
    totalPriceField: string;
    currencyField: string;
    carbonFootprintField?: string;
    refundableField?: string;
  };
}

/**
 * Errors thrown when payload mapping fails.
 */
export class PayloadMappingError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly path: string
  ) {
    super(message);
    this.name = 'PayloadMappingError';
  }
}

/**
 * Extracts a value from a nested object using dot-notation path.
 * Supports array indexing with bracket notation (e.g., "items[0].name").
 *
 * @param obj - The source object to extract from
 * @param path - Dot-notation path (e.g., "booking.traveller.name")
 * @returns The extracted value, or undefined if not found
 */
export function extractField(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  const segments = parsePath(path);
  let current: unknown = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (segment.type === 'property') {
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[segment.key];
    } else if (segment.type === 'index') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment.index];
    }
  }

  return current;
}

interface PropertySegment {
  type: 'property';
  key: string;
}

interface IndexSegment {
  type: 'index';
  index: number;
}

type PathSegment = PropertySegment | IndexSegment;

/**
 * Parses a dot-notation path into segments.
 * Handles bracket notation for array indices.
 */
function parsePath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const parts = path.split('.');

  for (const part of parts) {
    const bracketMatch = part.match(/^([^[]*)\[(\d+)\]$/);
    if (bracketMatch) {
      const [, key, indexStr] = bracketMatch;
      if (key) {
        segments.push({ type: 'property', key });
      }
      segments.push({ type: 'index', index: parseInt(indexStr, 10) });
    } else {
      segments.push({ type: 'property', key: part });
    }
  }

  return segments;
}

/**
 * Coerces a value to a string. Returns empty string for null/undefined.
 */
function coerceString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/**
 * Coerces a value to a number. Returns 0 for non-numeric values.
 */
function coerceNumber(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const num = Number(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Coerces a value to a boolean.
 */
function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1' || value === 'yes';
  }
  return Boolean(value);
}

/**
 * Validates and normalises a trip type string.
 */
function normaliseTripType(value: unknown): TripType {
  const str = coerceString(value).toLowerCase();
  const validTypes: TripType[] = ['domestic', 'international', 'multi-city'];
  if (validTypes.includes(str as TripType)) {
    return str as TripType;
  }
  // Common aliases
  if (str === 'multicity' || str === 'multi_city') return 'multi-city';
  if (str === 'intl' || str === 'int') return 'international';
  if (str === 'dom') return 'domestic';
  return 'domestic';
}

/**
 * Validates and normalises a product type string.
 */
function normaliseProductType(value: unknown): ProductType {
  const str = coerceString(value).toLowerCase();
  const validTypes: ProductType[] = ['air', 'hotel', 'car', 'rail'];
  if (validTypes.includes(str as ProductType)) {
    return str as ProductType;
  }
  // Common aliases
  if (str === 'flight' || str === 'flights') return 'air';
  if (str === 'accommodation' || str === 'lodging') return 'hotel';
  if (str === 'rental' || str === 'car_rental') return 'car';
  if (str === 'train' || str === 'railway') return 'rail';
  return 'air';
}

/**
 * Parses a location value. Accepts either a string (code) or an object with code/city/country.
 */
function parseLocation(value: unknown): { code: string; city: string; country: string } {
  if (typeof value === 'string') {
    return { code: value, city: '', country: '' };
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return {
      code: coerceString(obj.code ?? obj.iata ?? obj.airport ?? ''),
      city: coerceString(obj.city ?? ''),
      country: coerceString(obj.country ?? ''),
    };
  }
  return { code: '', city: '', country: '' };
}

/**
 * Calculates lead time in days from departure date to now.
 */
function calculateLeadTimeDays(departureDate: string): number {
  const departure = new Date(departureDate);
  const now = new Date();
  const diffMs = departure.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Maps a raw webhook payload into a canonical PolicyDecisionRequest
 * using the provided mapping configuration.
 *
 * @param rawPayload - The raw payload from the webhook
 * @param mappingConfig - The field mapping configuration for this integration
 * @returns A canonical PolicyDecisionRequest
 * @throws PayloadMappingError if required fields cannot be extracted
 */
export function mapPayload(
  rawPayload: unknown,
  mappingConfig: PayloadMappingConfig
): PolicyDecisionRequest {
  if (rawPayload === null || rawPayload === undefined || typeof rawPayload !== 'object') {
    throw new PayloadMappingError(
      'Raw payload must be a non-null object',
      'payload',
      ''
    );
  }

  // Extract tenant ID
  const tenantId = coerceString(extractField(rawPayload, mappingConfig.tenantIdField));
  if (!tenantId) {
    throw new PayloadMappingError(
      `Required field 'tenantId' not found at path: ${mappingConfig.tenantIdField}`,
      'tenantId',
      mappingConfig.tenantIdField
    );
  }

  // Map traveller context
  const traveller = mapTraveller(rawPayload, mappingConfig.travellerMapping);

  // Map trip context
  const trip = mapTrip(rawPayload, mappingConfig.tripMapping);

  // Map offers
  const offers = mapOffers(rawPayload, mappingConfig.offerMapping);

  return {
    tenantId,
    decisionPoint: 'post-booking',
    traveller,
    trip,
    offers,
  };
}

/**
 * Maps traveller fields from the raw payload.
 */
function mapTraveller(
  payload: unknown,
  mapping: PayloadMappingConfig['travellerMapping']
): TravellerContext {
  const travellerId = coerceString(extractField(payload, mapping.travellerIdField));
  if (!travellerId) {
    throw new PayloadMappingError(
      `Required field 'travellerId' not found at path: ${mapping.travellerIdField}`,
      'travellerId',
      mapping.travellerIdField
    );
  }

  const employeeId = coerceString(extractField(payload, mapping.employeeIdField));
  if (!employeeId) {
    throw new PayloadMappingError(
      `Required field 'employeeId' not found at path: ${mapping.employeeIdField}`,
      'employeeId',
      mapping.employeeIdField
    );
  }

  const department = coerceString(extractField(payload, mapping.departmentField));
  if (!department) {
    throw new PayloadMappingError(
      `Required field 'department' not found at path: ${mapping.departmentField}`,
      'department',
      mapping.departmentField
    );
  }

  return {
    travellerId,
    employeeId,
    department,
    costCentre: mapping.costCentreField
      ? coerceString(extractField(payload, mapping.costCentreField)) || 'default'
      : 'default',
    seniorityLevel: mapping.seniorityLevelField
      ? coerceString(extractField(payload, mapping.seniorityLevelField)) || 'standard'
      : 'standard',
    region: mapping.regionField
      ? coerceString(extractField(payload, mapping.regionField)) || 'global'
      : 'global',
  };
}

/**
 * Maps trip fields from the raw payload.
 */
function mapTrip(
  payload: unknown,
  mapping: PayloadMappingConfig['tripMapping']
): TripContext {
  const tripId = coerceString(extractField(payload, mapping.tripIdField));
  if (!tripId) {
    throw new PayloadMappingError(
      `Required field 'tripId' not found at path: ${mapping.tripIdField}`,
      'tripId',
      mapping.tripIdField
    );
  }

  const tripType = normaliseTripType(extractField(payload, mapping.tripTypeField));
  const origin = parseLocation(extractField(payload, mapping.originField));
  const destination = parseLocation(extractField(payload, mapping.destinationField));

  const departureDate = coerceString(extractField(payload, mapping.departureDateField));
  if (!departureDate) {
    throw new PayloadMappingError(
      `Required field 'departureDate' not found at path: ${mapping.departureDateField}`,
      'departureDate',
      mapping.departureDateField
    );
  }

  const returnDate = mapping.returnDateField
    ? coerceString(extractField(payload, mapping.returnDateField)) || undefined
    : undefined;

  const purpose = mapping.purposeField
    ? coerceString(extractField(payload, mapping.purposeField)) || undefined
    : undefined;

  return {
    tripId,
    tripType,
    origin,
    destination,
    departureDate,
    returnDate,
    leadTimeDays: calculateLeadTimeDays(departureDate),
    purpose,
  };
}

/**
 * Maps offers from the raw payload.
 */
function mapOffers(
  payload: unknown,
  mapping: PayloadMappingConfig['offerMapping']
): Offer[] {
  const offersArray = extractField(payload, mapping.offersArrayField);

  if (!Array.isArray(offersArray)) {
    throw new PayloadMappingError(
      `Offers array not found at path: ${mapping.offersArrayField}`,
      'offers',
      mapping.offersArrayField
    );
  }

  if (offersArray.length === 0) {
    throw new PayloadMappingError(
      'Offers array is empty',
      'offers',
      mapping.offersArrayField
    );
  }

  return offersArray.map((offerData, index) => mapSingleOffer(offerData, mapping, index));
}

/**
 * Maps a single offer from the raw payload.
 */
function mapSingleOffer(
  offerData: unknown,
  mapping: PayloadMappingConfig['offerMapping'],
  index: number
): Offer {
  if (typeof offerData !== 'object' || offerData === null) {
    throw new PayloadMappingError(
      `Offer at index ${index} is not an object`,
      'offers',
      `${mapping.offersArrayField}[${index}]`
    );
  }

  const offerId = coerceString(extractField(offerData, mapping.offerIdField));
  if (!offerId) {
    throw new PayloadMappingError(
      `Required field 'offerId' not found in offer at index ${index}`,
      'offerId',
      `${mapping.offersArrayField}[${index}].${mapping.offerIdField}`
    );
  }

  const supplier = coerceString(extractField(offerData, mapping.supplierField));
  const productType = normaliseProductType(extractField(offerData, mapping.productTypeField));
  const totalPrice = coerceNumber(extractField(offerData, mapping.totalPriceField));
  const currency = coerceString(extractField(offerData, mapping.currencyField)) || 'GBP';

  const cabinClass = mapping.cabinClassField
    ? coerceString(extractField(offerData, mapping.cabinClassField)) || undefined
    : undefined;

  const carbonFootprintKg = mapping.carbonFootprintField
    ? coerceNumber(extractField(offerData, mapping.carbonFootprintField)) || undefined
    : undefined;

  const refundable = mapping.refundableField
    ? coerceBoolean(extractField(offerData, mapping.refundableField))
    : false;

  return {
    offerId,
    supplier,
    productType,
    cabinClass,
    totalPrice: { amount: totalPrice, currency },
    carbonFootprintKg,
    refundable,
  };
}
