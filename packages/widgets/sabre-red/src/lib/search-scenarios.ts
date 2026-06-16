export interface SearchScenario {
  label: string;
  origin: string;
  destination: string;
  departureDate: string;
  fares: Array<{
    id: string;
    flightNumber: string;
    airline: string;
    cabinClass: string;
    price: number;
    currency: string;
    route: { origin: string; destination: string };
  }>;
}

export const searchScenarios: SearchScenario[] = [
  {
    label: 'LHR → JFK',
    origin: 'LHR',
    destination: 'JFK',
    departureDate: '2025-04-10',
    fares: [
      {
        id: 'lhr-jfk-1',
        flightNumber: 'BA 117',
        airline: 'British Airways',
        cabinClass: 'Economy',
        price: 892,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        id: 'lhr-jfk-2',
        flightNumber: 'BA 117',
        airline: 'British Airways',
        cabinClass: 'Premium Economy',
        price: 1450,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        id: 'lhr-jfk-3',
        flightNumber: 'AA 100',
        airline: 'American Airlines',
        cabinClass: 'Business',
        price: 2890,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        id: 'lhr-jfk-4',
        flightNumber: 'VS 003',
        airline: 'Virgin Atlantic',
        cabinClass: 'Business',
        price: 3200,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
      {
        id: 'lhr-jfk-5',
        flightNumber: 'BA 117',
        airline: 'British Airways',
        cabinClass: 'First',
        price: 6800,
        currency: '£',
        route: { origin: 'LHR', destination: 'JFK' },
      },
    ],
  },
  {
    label: 'MAN → DXB',
    origin: 'MAN',
    destination: 'DXB',
    departureDate: '2025-04-15',
    fares: [
      {
        id: 'man-dxb-1',
        flightNumber: 'EK 018',
        airline: 'Emirates',
        cabinClass: 'Economy',
        price: 680,
        currency: '£',
        route: { origin: 'MAN', destination: 'DXB' },
      },
      {
        id: 'man-dxb-2',
        flightNumber: 'EK 018',
        airline: 'Emirates',
        cabinClass: 'Business',
        price: 2400,
        currency: '£',
        route: { origin: 'MAN', destination: 'DXB' },
      },
      {
        id: 'man-dxb-3',
        flightNumber: 'QR 028',
        airline: 'Qatar Airways',
        cabinClass: 'Business',
        price: 3800,
        currency: '£',
        route: { origin: 'MAN', destination: 'DXB' },
      },
      {
        id: 'man-dxb-4',
        flightNumber: 'EK 018',
        airline: 'Emirates',
        cabinClass: 'First',
        price: 5200,
        currency: '£',
        route: { origin: 'MAN', destination: 'DXB' },
      },
    ],
  },
  {
    label: 'LHR → SIN',
    origin: 'LHR',
    destination: 'SIN',
    departureDate: '2025-05-01',
    fares: [
      {
        id: 'lhr-sin-1',
        flightNumber: 'SQ 321',
        airline: 'Singapore Airlines',
        cabinClass: 'Economy',
        price: 750,
        currency: '£',
        route: { origin: 'LHR', destination: 'SIN' },
      },
      {
        id: 'lhr-sin-2',
        flightNumber: 'SQ 321',
        airline: 'Singapore Airlines',
        cabinClass: 'Premium Economy',
        price: 1680,
        currency: '£',
        route: { origin: 'LHR', destination: 'SIN' },
      },
      {
        id: 'lhr-sin-3',
        flightNumber: 'BA 011',
        airline: 'British Airways',
        cabinClass: 'Business',
        price: 3100,
        currency: '£',
        route: { origin: 'LHR', destination: 'SIN' },
      },
      {
        id: 'lhr-sin-4',
        flightNumber: 'SQ 321',
        airline: 'Singapore Airlines',
        cabinClass: 'Business',
        price: 4500,
        currency: '£',
        route: { origin: 'LHR', destination: 'SIN' },
      },
      {
        id: 'lhr-sin-5',
        flightNumber: 'SQ 321',
        airline: 'Singapore Airlines',
        cabinClass: 'First',
        price: 8200,
        currency: '£',
        route: { origin: 'LHR', destination: 'SIN' },
      },
    ],
  },
];

export function createSearchMessage(scenario: SearchScenario) {
  return {
    type: 'SEARCH_RESULTS' as const,
    payload: {
      travellerId: 'trav-001',
      origin: scenario.origin,
      destination: scenario.destination,
      departureDate: scenario.departureDate,
      fares: scenario.fares,
    },
    correlationId: `mock-search-${scenario.origin.toLowerCase()}-${scenario.destination.toLowerCase()}`,
    timestamp: Date.now(),
  };
}
