import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from './policy-evaluator.js';
import type {
  PolicyGraph,
  PolicyDecisionRequest,
  PolicyNode,
  PolicyEdge,
} from '@travel-policy/shared';

function createRequest(overrides?: Partial<PolicyDecisionRequest>): PolicyDecisionRequest {
  return {
    tenantId: 'tenant-001',
    decisionPoint: 'pre-booking',
    traveller: {
      travellerId: 'trav-001',
      employeeId: 'EMP-123',
      department: 'Engineering',
      costCentre: 'CC-100',
      seniorityLevel: 'senior',
      region: 'UK',
    },
    trip: {
      tripId: 'trip-001',
      tripType: 'domestic',
      origin: { code: 'LHR', city: 'London', country: 'UK' },
      destination: { code: 'MAN', city: 'Manchester', country: 'UK' },
      departureDate: '2024-06-15',
      returnDate: '2024-06-16',
      leadTimeDays: 14,
    },
    offers: [
      {
        offerId: 'offer-001',
        supplier: 'British Airways',
        productType: 'air',
        cabinClass: 'economy',
        totalPrice: { amount: 150, currency: 'GBP' },
        carbonFootprintKg: 80,
        refundable: true,
      },
    ],
    ...overrides,
  };
}

function createSimpleApproveGraph(): PolicyGraph {
  const nodes: PolicyNode[] = [
    {
      nodeId: 'root',
      type: 'terminal',
      terminal: {
        result: 'approve',
        reasons: ['Within policy'],
        obligations: [],
      },
    },
  ];

  return {
    graphId: 'graph-001',
    version: 1,
    rootNodeId: 'root',
    nodes,
    edges: [],
    metadata: {
      createdAt: '2024-01-01T00:00:00Z',
      compiledFrom: 'test',
      checksum: 'abc123',
      rules: [{ name: 'Default Approve', priority: 100, entryNodeId: 'root' }],
    },
  };
}

function createConditionGraph(): PolicyGraph {
  const nodes: PolicyNode[] = [
    {
      nodeId: 'check-cabin',
      type: 'condition',
      condition: {
        field: 'offer.cabinClass',
        operator: 'in',
        value: ['business', 'first'],
        valueType: 'literal',
      },
    },
    {
      nodeId: 'reject-cabin',
      type: 'terminal',
      terminal: {
        result: 'reject',
        reasons: ['Business/First class not allowed for this seniority level'],
        obligations: [],
      },
    },
    {
      nodeId: 'approve-cabin',
      type: 'terminal',
      terminal: {
        result: 'approve',
        reasons: ['Economy class within policy'],
        obligations: [],
      },
    },
  ];

  const edges: PolicyEdge[] = [
    { fromNodeId: 'check-cabin', toNodeId: 'reject-cabin', condition: 'true' },
    { fromNodeId: 'check-cabin', toNodeId: 'approve-cabin', condition: 'false' },
  ];

  return {
    graphId: 'graph-002',
    version: 1,
    rootNodeId: 'check-cabin',
    nodes,
    edges,
    metadata: {
      createdAt: '2024-01-01T00:00:00Z',
      compiledFrom: 'test',
      checksum: 'def456',
      rules: [
        { name: 'Cabin Class Policy', priority: 50, entryNodeId: 'check-cabin' },
      ],
    },
  };
}

function createMultiConditionGraph(): PolicyGraph {
  const nodes: PolicyNode[] = [
    {
      nodeId: 'check-price',
      type: 'condition',
      condition: {
        field: 'offer.totalPrice.amount',
        operator: 'gt',
        value: 1000,
        valueType: 'literal',
      },
    },
    {
      nodeId: 'check-seniority',
      type: 'condition',
      condition: {
        field: 'traveller.seniorityLevel',
        operator: 'in',
        value: ['director', 'vp', 'c-level'],
        valueType: 'literal',
      },
    },
    {
      nodeId: 'review-expensive',
      type: 'terminal',
      terminal: {
        result: 'review',
        reasons: ['Booking exceeds £1000 and requires manager approval'],
        obligations: [
          {
            type: 'manager_approval',
            description: 'Manager approval required for bookings over £1000',
          },
        ],
      },
    },
    {
      nodeId: 'approve-senior',
      type: 'terminal',
      terminal: {
        result: 'approve',
        reasons: ['Senior staff approved for high-value bookings'],
        obligations: [],
      },
    },
    {
      nodeId: 'approve-budget',
      type: 'terminal',
      terminal: {
        result: 'approve',
        reasons: ['Within budget threshold'],
        obligations: [],
      },
    },
  ];

  const edges: PolicyEdge[] = [
    { fromNodeId: 'check-price', toNodeId: 'check-seniority', condition: 'true' },
    { fromNodeId: 'check-price', toNodeId: 'approve-budget', condition: 'false' },
    { fromNodeId: 'check-seniority', toNodeId: 'approve-senior', condition: 'true' },
    { fromNodeId: 'check-seniority', toNodeId: 'review-expensive', condition: 'false' },
  ];

  return {
    graphId: 'graph-003',
    version: 1,
    rootNodeId: 'check-price',
    nodes,
    edges,
    metadata: {
      createdAt: '2024-01-01T00:00:00Z',
      compiledFrom: 'test',
      checksum: 'ghi789',
      rules: [
        { name: 'Budget Policy', priority: 30, entryNodeId: 'check-price' },
      ],
    },
  };
}

function createGateGraph(): PolicyGraph {
  const nodes: PolicyNode[] = [
    {
      nodeId: 'gate-and',
      type: 'gate',
      operator: 'and',
    },
    {
      nodeId: 'check-domestic',
      type: 'condition',
      condition: {
        field: 'trip.tripType',
        operator: 'eq',
        value: 'domestic',
        valueType: 'literal',
      },
    },
    {
      nodeId: 'check-economy',
      type: 'condition',
      condition: {
        field: 'offer.cabinClass',
        operator: 'eq',
        value: 'economy',
        valueType: 'literal',
      },
    },
    {
      nodeId: 'approve-domestic-economy',
      type: 'terminal',
      terminal: {
        result: 'approve',
        reasons: ['Domestic economy approved'],
        obligations: [],
      },
    },
    {
      nodeId: 'reject-not-economy',
      type: 'terminal',
      terminal: {
        result: 'reject',
        reasons: ['Only economy allowed for domestic'],
        obligations: [],
      },
    },
    {
      nodeId: 'reject-not-domestic',
      type: 'terminal',
      terminal: {
        result: 'reject',
        reasons: ['International travel requires approval'],
        obligations: [],
      },
    },
  ];

  const edges: PolicyEdge[] = [
    { fromNodeId: 'gate-and', toNodeId: 'check-domestic', priority: 1 },
    { fromNodeId: 'gate-and', toNodeId: 'check-economy', priority: 2 },
    { fromNodeId: 'check-domestic', toNodeId: 'approve-domestic-economy', condition: 'true' },
    { fromNodeId: 'check-domestic', toNodeId: 'reject-not-domestic', condition: 'false' },
    { fromNodeId: 'check-economy', toNodeId: 'approve-domestic-economy', condition: 'true' },
    { fromNodeId: 'check-economy', toNodeId: 'reject-not-economy', condition: 'false' },
  ];

  return {
    graphId: 'graph-004',
    version: 1,
    rootNodeId: 'gate-and',
    nodes,
    edges,
    metadata: {
      createdAt: '2024-01-01T00:00:00Z',
      compiledFrom: 'test',
      checksum: 'jkl012',
    },
  };
}

describe('evaluatePolicy', () => {
  it('returns approve for a simple approve graph', () => {
    const request = createRequest();
    const graph = createSimpleApproveGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('approve');
    expect(decision.tenantId).toBe('tenant-001');
    expect(decision.reasons).toContain('Within policy');
    expect(decision.decisionId).toBeTruthy();
    expect(decision.evaluatedAt).toBeTruthy();
    expect(decision.expiresAt).toBeTruthy();
    expect(decision.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('rejects when cabin class condition matches', () => {
    const request = createRequest({
      offers: [
        {
          offerId: 'offer-001',
          supplier: 'BA',
          productType: 'air',
          cabinClass: 'business',
          totalPrice: { amount: 3000, currency: 'GBP' },
          carbonFootprintKg: 450,
          refundable: true,
        },
      ],
    });
    const graph = createConditionGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('reject');
    expect(decision.reasons).toContain(
      'Business/First class not allowed for this seniority level'
    );
  });

  it('approves when cabin class condition does not match', () => {
    const request = createRequest(); // economy class
    const graph = createConditionGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('approve');
    expect(decision.reasons).toContain('Economy class within policy');
  });

  it('routes through multi-condition graph correctly — low price approves', () => {
    const request = createRequest(); // £150 offer
    const graph = createMultiConditionGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('approve');
    expect(decision.reasons).toContain('Within budget threshold');
  });

  it('routes through multi-condition graph — high price, non-senior triggers review', () => {
    const request = createRequest({
      offers: [
        {
          offerId: 'offer-001',
          supplier: 'BA',
          productType: 'air',
          cabinClass: 'economy',
          totalPrice: { amount: 2500, currency: 'GBP' },
          carbonFootprintKg: 200,
          refundable: true,
        },
      ],
    });
    const graph = createMultiConditionGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('review');
    expect(decision.reasons).toContain(
      'Booking exceeds £1000 and requires manager approval'
    );
    expect(decision.obligations).toHaveLength(1);
    expect(decision.obligations[0].type).toBe('manager_approval');
  });

  it('routes through multi-condition graph — high price, senior approves', () => {
    const request = createRequest({
      traveller: {
        travellerId: 'trav-001',
        employeeId: 'EMP-123',
        department: 'Engineering',
        costCentre: 'CC-100',
        seniorityLevel: 'director',
        region: 'UK',
      },
      offers: [
        {
          offerId: 'offer-001',
          supplier: 'BA',
          productType: 'air',
          cabinClass: 'economy',
          totalPrice: { amount: 2500, currency: 'GBP' },
          carbonFootprintKg: 200,
          refundable: true,
        },
      ],
    });
    const graph = createMultiConditionGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('approve');
    expect(decision.reasons).toContain('Senior staff approved for high-value bookings');
  });

  it('evaluates AND gate — both conditions pass', () => {
    const request = createRequest(); // domestic + economy
    const graph = createGateGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('approve');
  });

  it('evaluates AND gate — one condition fails triggers reject', () => {
    const request = createRequest({
      trip: {
        tripId: 'trip-001',
        tripType: 'international',
        origin: { code: 'LHR', city: 'London', country: 'UK' },
        destination: { code: 'JFK', city: 'New York', country: 'US' },
        departureDate: '2024-06-15',
        leadTimeDays: 14,
      },
    });
    const graph = createGateGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision.result).toBe('reject');
    expect(decision.reasons).toContain('International travel requires approval');
  });

  it('handles multiple offers and finds alternatives', () => {
    const request = createRequest({
      offers: [
        {
          offerId: 'offer-cheap',
          supplier: 'EasyJet',
          productType: 'air',
          cabinClass: 'economy',
          totalPrice: { amount: 100, currency: 'GBP' },
          carbonFootprintKg: 80,
          refundable: false,
        },
        {
          offerId: 'offer-expensive',
          supplier: 'BA',
          productType: 'air',
          cabinClass: 'business',
          totalPrice: { amount: 3000, currency: 'GBP' },
          carbonFootprintKg: 450,
          refundable: true,
        },
      ],
    });
    const graph = createConditionGraph();

    const decision = evaluatePolicy(request, graph);

    // Most restrictive result wins (reject from business class offer)
    expect(decision.result).toBe('reject');
  });

  it('returns valid decision structure', () => {
    const request = createRequest();
    const graph = createSimpleApproveGraph();

    const decision = evaluatePolicy(request, graph);

    expect(decision).toHaveProperty('decisionId');
    expect(decision).toHaveProperty('tenantId');
    expect(decision).toHaveProperty('result');
    expect(decision).toHaveProperty('winningRules');
    expect(decision).toHaveProperty('reasons');
    expect(decision).toHaveProperty('obligations');
    expect(decision).toHaveProperty('alternatives');
    expect(decision).toHaveProperty('evaluatedAt');
    expect(decision).toHaveProperty('expiresAt');
    expect(decision).toHaveProperty('durationMs');
    expect(Array.isArray(decision.winningRules)).toBe(true);
    expect(Array.isArray(decision.reasons)).toBe(true);
    expect(Array.isArray(decision.obligations)).toBe(true);
    expect(Array.isArray(decision.alternatives)).toBe(true);
  });

  it('handles empty graph gracefully', () => {
    const request = createRequest();
    const graph: PolicyGraph = {
      graphId: 'empty',
      version: 1,
      rootNodeId: 'nonexistent',
      nodes: [],
      edges: [],
      metadata: {
        createdAt: '2024-01-01T00:00:00Z',
        compiledFrom: 'test',
        checksum: 'empty',
      },
    };

    const decision = evaluatePolicy(request, graph);

    // Default result when graph can't be traversed
    expect(decision.result).toBe('approve');
  });
});
