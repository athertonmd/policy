export type ComplianceStatus = 'green' | 'amber' | 'red';

export interface FareCompliance {
  status: ComplianceStatus;
  reasons: string[];
  violatedRules: string[];
  obligations: string[];
  alternatives: string[];
}

export interface Fare {
  id: string;
  flightNumber: string;
  airline: string;
  route: { origin: string; destination: string };
  cabinClass: string;
  price: number;
  currency: string;
  compliance: FareCompliance;
}

export interface Traveller {
  name: string;
  grade: string;
  policyTier: string;
  budget: {
    remaining: number;
    total: number;
    currency: string;
  };
}
