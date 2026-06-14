/**
 * TypeScript interfaces for Sabre Dev Studio API responses.
 * Based on Sabre's published JSON schemas for BFM, GetReservation, and PNR notifications.
 */

// --- Bargain Finder Max (BFM) Response: OTA_AirLowFareSearchRS ---

export interface OTA_AirLowFareSearchRS {
  OTA_AirLowFareSearchRS: {
    PricedItineraries: {
      PricedItinerary: PricedItinerary[];
    };
    Statistics?: {
      Itinerary: { Count: number };
    };
    TPA_Extensions?: Record<string, unknown>;
  };
}

export interface PricedItinerary {
  SequenceNumber: number;
  AirItinerary: AirItinerary;
  AirItineraryPricingInfo: AirItineraryPricingInfo[];
  TicketingInfo: TicketingInfo;
  TPA_Extensions?: {
    ValidatingCarrier?: { Code: string };
    DiversitySwapper?: { WeighedPrice: number };
  };
}

export interface AirItinerary {
  DirectionInd: 'OneWay' | 'Return' | 'Circle';
  OriginDestinationOptions: {
    OriginDestinationOption: OriginDestinationOption[];
  };
}

export interface OriginDestinationOption {
  FlightSegment: FlightSegment[];
  ElapsedTime: number;
}

export interface FlightSegment {
  DepartureAirport: { LocationCode: string };
  ArrivalAirport: { LocationCode: string };
  DepartureDateTime: string;
  ArrivalDateTime: string;
  FlightNumber: string;
  OperatingAirline?: { Code: string; FlightNumber: string };
  MarketingAirline: { Code: string };
  Equipment?: { AirEquipType: string };
  ResBookDesigCode: string;
  ElapsedTime: number;
  StopQuantity: number;
  MarriageGrp?: string;
  TPA_Extensions?: {
    eTicket?: { Ind: boolean };
  };
}

export interface AirItineraryPricingInfo {
  PricingSource: string;
  PricingSubSource: string;
  FareReturned: boolean;
  ItinTotalFare: ItinTotalFare;
  PTC_FareBreakdowns: {
    PTC_FareBreakdown: PTC_FareBreakdown[];
  };
  TPA_Extensions?: {
    DivideInParty?: { Indicator: boolean };
  };
}

export interface ItinTotalFare {
  BaseFare: { Amount: string; CurrencyCode: string; DecimalPlaces: number };
  Taxes: { Tax: TaxInfo[]; TotalAmount: string };
  TotalFare: { Amount: string; CurrencyCode: string; DecimalPlaces: number };
  Fees?: { Fee: FeeInfo[] };
}

export interface TaxInfo {
  TaxCode: string;
  Amount: string;
  CurrencyCode: string;
}

export interface FeeInfo {
  FeeCode: string;
  Amount: string;
  CurrencyCode: string;
}

export interface PTC_FareBreakdown {
  PassengerTypeQuantity: { Code: string; Quantity: number };
  FareBasisCodes: { FareBasisCode: FareBasisCode[] };
  PassengerFare: {
    BaseFare: { Amount: string; CurrencyCode: string };
    Taxes: { Tax: TaxInfo[]; TotalAmount: string };
    TotalFare: { Amount: string; CurrencyCode: string };
  };
  Endorsements?: { NonRefundableIndicator: boolean };
  TPA_Extensions?: {
    FareCalcLine?: { Info: string };
    Cabin?: { Cabin: CabinInfo[] };
  };
}

export interface FareBasisCode {
  BookingCode: string;
  DepartureAirportCode: string;
  ArrivalAirportCode: string;
  FareComponentBeginAirport: string;
  FareComponentEndAirport: string;
  content: string;
}

export interface CabinInfo {
  Cabin: CabinCode;
}

export type CabinCode = 'Y' | 'S' | 'C' | 'J' | 'F' | 'P';

export interface TicketingInfo {
  TicketType: string;
  ValidInterline?: string;
}

// --- GetReservation Response ---

export interface GetReservationRS {
  Reservation: {
    BookingDetails: BookingDetails;
    PassengerReservation: PassengerReservation;
    PriceQuote?: PriceQuote[];
  };
}

export interface BookingDetails {
  RecordLocator: string;
  CreationTimestamp: string;
  SystemCreationTimestamp: string;
  LastModifiedTimestamp: string;
  PurchaseTimestamp?: string;
}

export interface PassengerReservation {
  Passengers: {
    Passenger: PassengerInfo[];
  };
  Segments: {
    Segment: ReservationSegment[];
  };
  TicketingInfo?: {
    TicketDetails: TicketDetail[];
  };
}

export interface PassengerInfo {
  NameNumber: string;
  NameId: string;
  PassengerType: string;
  GivenName: string;
  Surname: string;
  FrequentFlyer?: {
    AirlineCode: string;
    FrequentFlyerNumber: string;
  };
  Loyalty?: {
    ProgramID: string;
    MembershipID: string;
  };
}

export interface ReservationSegment {
  Air?: AirSegment;
}

export interface AirSegment {
  DepartureAirport: string;
  ArrivalAirport: string;
  DepartureDateTime: string;
  ArrivalDateTime: string;
  MarketingAirlineCode: string;
  OperatingAirlineCode?: string;
  FlightNumber: string;
  ClassOfService: string;
  CabinCode: CabinCode;
  ActionCode: string;
  NumberInParty: number;
  SegmentNumber: number;
}

export interface TicketDetail {
  TicketNumber: string;
  TransactionIndicator: string;
  AgencyLocation: string;
}

export interface PriceQuote {
  PricedItinerary: {
    AirItineraryPricingInfo: {
      ItinTotalFare: ItinTotalFare;
    };
  };
}

// --- PNR Change Notification (Webhook Payload) ---

export interface PNRChangeNotification {
  Action: PNRChangeAction;
  RecordLocator: string;
  Timestamp: string;
  Source: string;
  Details: PNRChangeDetails;
  Signature?: string;
}

export type PNRChangeAction = 'CREATE' | 'MODIFY' | 'CANCEL';

export interface PNRChangeDetails {
  AgencyPCC: string;
  AgentId?: string;
  Passengers?: {
    Passenger: Array<{
      GivenName: string;
      Surname: string;
      PassengerType: string;
    }>;
  };
  Segments?: {
    Segment: Array<{
      DepartureAirport: string;
      ArrivalAirport: string;
      DepartureDateTime: string;
      ArrivalDateTime: string;
      MarketingAirline: string;
      FlightNumber: string;
      ClassOfService: string;
    }>;
  };
  Ticketing?: {
    TicketNumber?: string;
    TotalFare?: { Amount: string; CurrencyCode: string };
  };
}

// --- Sabre Auth Response ---

export interface SabreTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// --- Cabin Code Mapping ---

export const CABIN_CODE_MAP: Record<CabinCode, string> = {
  Y: 'economy',
  S: 'premium_economy',
  C: 'business',
  J: 'business',
  F: 'first',
  P: 'first',
};
