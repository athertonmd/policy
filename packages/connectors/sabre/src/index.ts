/**
 * @travel-policy/connector-sabre
 *
 * Sabre GDS connector for the Travel Policy Platform.
 * Integrates Sabre Dev Studio REST APIs with the Policy Decision API.
 *
 * Use cases:
 * 1. Search-time policy filtering — annotate BFM search results with compliance status
 * 2. Pre-ticketing compliance check — validate before issuing ticket
 * 3. Post-booking webhook — receive PNR data after booking confirmation
 */

// Configuration
export { loadConfigFromEnv, getSabreBaseUrl, getSabreTokenUrl } from './config.js';
export type { SabreConfig } from './config.js';

// Authentication
export { createSabreAuth } from './auth/sabre-auth.js';
export type { SabreAuth } from './auth/sabre-auth.js';

// HTTP Client
export { createSabreClient, SabreApiError } from './utils/sabre-client.js';
export type { SabreClient, SabreRequestOptions, SabreResponse } from './utils/sabre-client.js';

// Search Interception
export { interceptSearchResults, createPolicyApiClient } from './search/search-interceptor.js';
export type { PolicyApiClient } from './search/search-interceptor.js';
export { mapBfmResponseToPolicyRequest, mapItineraryToOffer, extractTripContext, extractCabinClass } from './search/fare-mapper.js';
export type { FareMapperContext } from './search/fare-mapper.js';
export { annotateFares, mapDecisionToAnnotation, computeSummary, annotateFaresFromBatch } from './search/compliance-annotator.js';

// Pre-Ticket Validation
export { validatePreTicket } from './booking/pre-ticket-validator.js';
export type { PreTicketValidatorOptions } from './booking/pre-ticket-validator.js';
export { mapReservationToPolicyRequest } from './booking/booking-mapper.js';
export type { BookingMapperContext } from './booking/booking-mapper.js';

// Webhook Handler
export { createPnrWebhookRouter, handlePnrWebhook } from './webhook/pnr-webhook-handler.js';
export { parsePnrNotification } from './webhook/pnr-parser.js';
export type { CanonicalBookingEvent, CanonicalPassenger, CanonicalSegment, CanonicalTicketing } from './webhook/pnr-parser.js';

// Types
export type {
  OTA_AirLowFareSearchRS,
  PricedItinerary,
  AirItinerary,
  OriginDestinationOption,
  FlightSegment,
  AirItineraryPricingInfo,
  ItinTotalFare,
  PTC_FareBreakdown,
  GetReservationRS,
  PassengerInfo,
  ReservationSegment,
  AirSegment,
  PNRChangeNotification,
  PNRChangeAction,
  SabreTokenResponse,
  CabinCode,
} from './types/sabre-types.js';

export type {
  ComplianceStatus,
  ComplianceColor,
  ComplianceAnnotation,
  AnnotatedFare,
  AnnotatedSearchResult,
  ComplianceSummary,
  PreTicketValidationResult,
  WebhookProcessingResult,
} from './types/compliance-types.js';

// Logger
export { createLogger, setLogLevel } from './utils/logger.js';
export type { LogLevel } from './utils/logger.js';
