/**
 * PNR Parser — Parses Sabre PNR change notification structure into a canonical format
 * suitable for our platform's booking ingestion webhook.
 */

import type { PNRChangeNotification, PNRChangeAction } from '../types/sabre-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pnr-parser');

export interface CanonicalBookingEvent {
  /** Event type mapped from Sabre action */
  eventType: 'booking_created' | 'booking_modified' | 'booking_cancelled';
  /** Source system identifier */
  source: 'sabre';
  /** PNR record locator */
  recordLocator: string;
  /** Timestamp of the event */
  timestamp: string;
  /** Agency PCC that made the change */
  agencyPcc: string;
  /** Agent who made the change */
  agentId?: string;
  /** Passenger details */
  passengers: CanonicalPassenger[];
  /** Flight segments */
  segments: CanonicalSegment[];
  /** Ticketing information */
  ticketing?: CanonicalTicketing;
}

export interface CanonicalPassenger {
  givenName: string;
  surname: string;
  passengerType: string;
}

export interface CanonicalSegment {
  origin: string;
  destination: string;
  departureDateTime: string;
  arrivalDateTime: string;
  marketingAirline: string;
  flightNumber: string;
  classOfService: string;
}

export interface CanonicalTicketing {
  ticketNumber?: string;
  totalFare?: {
    amount: number;
    currency: string;
  };
}

const ACTION_MAP: Record<PNRChangeAction, CanonicalBookingEvent['eventType']> = {
  CREATE: 'booking_created',
  MODIFY: 'booking_modified',
  CANCEL: 'booking_cancelled',
};

/**
 * Parses a Sabre PNR change notification into our canonical booking event format.
 */
export function parsePnrNotification(notification: PNRChangeNotification): CanonicalBookingEvent {
  logger.debug('Parsing PNR notification', {
    action: notification.Action,
    recordLocator: notification.RecordLocator,
  });

  const eventType = ACTION_MAP[notification.Action];
  if (!eventType) {
    throw new Error(`Unknown PNR change action: ${notification.Action}`);
  }

  const passengers = parsePassengers(notification);
  const segments = parseSegments(notification);
  const ticketing = parseTicketing(notification);

  const event: CanonicalBookingEvent = {
    eventType,
    source: 'sabre',
    recordLocator: notification.RecordLocator,
    timestamp: notification.Timestamp,
    agencyPcc: notification.Details.AgencyPCC,
    agentId: notification.Details.AgentId,
    passengers,
    segments,
  };

  if (ticketing) {
    event.ticketing = ticketing;
  }

  logger.info('Parsed PNR notification', {
    eventType,
    recordLocator: notification.RecordLocator,
    passengerCount: passengers.length,
    segmentCount: segments.length,
  });

  return event;
}

function parsePassengers(notification: PNRChangeNotification): CanonicalPassenger[] {
  const passengers = notification.Details.Passengers?.Passenger;
  if (!passengers || passengers.length === 0) {
    return [];
  }

  return passengers.map((pax) => ({
    givenName: pax.GivenName,
    surname: pax.Surname,
    passengerType: pax.PassengerType,
  }));
}

function parseSegments(notification: PNRChangeNotification): CanonicalSegment[] {
  const segments = notification.Details.Segments?.Segment;
  if (!segments || segments.length === 0) {
    return [];
  }

  return segments.map((seg) => ({
    origin: seg.DepartureAirport,
    destination: seg.ArrivalAirport,
    departureDateTime: seg.DepartureDateTime,
    arrivalDateTime: seg.ArrivalDateTime,
    marketingAirline: seg.MarketingAirline,
    flightNumber: `${seg.MarketingAirline}${seg.FlightNumber}`,
    classOfService: seg.ClassOfService,
  }));
}

function parseTicketing(notification: PNRChangeNotification): CanonicalTicketing | undefined {
  const ticketing = notification.Details.Ticketing;
  if (!ticketing) {
    return undefined;
  }

  return {
    ticketNumber: ticketing.TicketNumber,
    totalFare: ticketing.TotalFare
      ? {
          amount: parseFloat(ticketing.TotalFare.Amount),
          currency: ticketing.TotalFare.CurrencyCode,
        }
      : undefined,
  };
}
