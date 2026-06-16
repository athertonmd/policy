import { SearchResultsPayload } from './message-bridge';

export interface PolicyEvaluationRequest {
  travellerId: string;
  tripContext: {
    origin: string;
    destination: string;
    departureDate: string;
  };
  offers: FareOffer[];
}

export interface FareOffer {
  fareId: string;
  airline: string;
  flightNumber: string;
  cabinClass: string;
  price: number;
  currency: string;
  route: { origin: string; destination: string };
}

export function mapToEvaluationRequest(payload: SearchResultsPayload): PolicyEvaluationRequest {
  const offers: FareOffer[] = [];

  for (const fare of payload.fares) {
    // Skip fares missing required fields
    if (!fare.id || fare.price == null || fare.price === undefined) {
      continue;
    }
    if (!fare.flightNumber || !fare.airline) {
      continue;
    }

    offers.push({
      fareId: fare.id,
      airline: fare.airline,
      flightNumber: fare.flightNumber,
      cabinClass: fare.cabinClass || '',
      price: fare.price,
      currency: fare.currency || '£',
      route: fare.route || { origin: payload.origin, destination: payload.destination },
    });
  }

  return {
    travellerId: payload.travellerId,
    tripContext: {
      origin: payload.origin,
      destination: payload.destination,
      departureDate: payload.departureDate,
    },
    offers,
  };
}
