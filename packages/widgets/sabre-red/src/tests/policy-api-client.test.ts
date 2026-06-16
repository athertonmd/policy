import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callPolicyApi, PolicyApiError } from '../lib/policy-api-client';
import { PolicyEvaluationRequest } from '../lib/fare-mapper';

const mockRequest: PolicyEvaluationRequest = {
  travellerId: 'trav-001',
  tripContext: {
    origin: 'LHR',
    destination: 'JFK',
    departureDate: '2024-09-15',
  },
  offers: [
    {
      fareId: 'fare-1',
      airline: 'BA',
      flightNumber: 'BA115',
      cabinClass: 'economy',
      price: 850,
      currency: 'GBP',
      route: { origin: 'LHR', destination: 'JFK' },
    },
  ],
};

const mockApiDecisions = [
  {
    fareId: 'fare-1',
    status: 'green' as const,
    reasons: [],
    violatedRules: [],
    obligations: [],
    alternatives: [],
  },
];

describe('callPolicyApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls configured endpoint and returns decisions on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ decisions: mockApiDecisions }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await callPolicyApi(mockRequest, {
      baseUrl: 'https://api.example.com',
      tenantId: 'tenant-001',
      timeoutMs: 5000,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/policies/evaluate',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-001',
        },
      }),
    );
    expect(result).toEqual(mockApiDecisions);
  });

  it('throws PolicyApiError on timeout (AbortError)', async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      Object.assign(new DOMException('The operation was aborted', 'AbortError')),
    );
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      callPolicyApi(mockRequest, {
        baseUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
        timeoutMs: 100,
      }),
    ).rejects.toThrow(PolicyApiError);

    try {
      await callPolicyApi(mockRequest, {
        baseUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
        timeoutMs: 100,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyApiError);
      expect((e as PolicyApiError).isTimeout).toBe(true);
      expect((e as PolicyApiError).message).toContain('timed out');
    }
  });

  it('throws PolicyApiError on 5xx response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      callPolicyApi(mockRequest, {
        baseUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    ).rejects.toThrow(PolicyApiError);

    try {
      await callPolicyApi(mockRequest, {
        baseUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      });
    } catch (e) {
      expect(e).toBeInstanceOf(PolicyApiError);
      expect((e as PolicyApiError).statusCode).toBe(503);
    }
  });

  it('throws PolicyApiError on malformed response (missing decisions array)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'wrong shape' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      callPolicyApi(mockRequest, {
        baseUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    ).rejects.toThrow('Malformed API response');
  });
});

describe('evaluateWithService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mock mode uses mock evaluator (no fetch called)', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'mock',
        policyApiUrl: '',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.source).toBe('mock');
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].status).toBe('green');
  });

  it('auto mode uses mock evaluator when VITE_POLICY_API_URL is empty', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'auto',
        policyApiUrl: '',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.source).toBe('mock');
  });

  it('api mode calls configured endpoint (mock fetch with success response)', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'api',
        policyApiUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ decisions: mockApiDecisions }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.source).toBe('api');
    expect(result.decisions).toEqual(mockApiDecisions);
    expect(result.error).toBeUndefined();
  });

  it('API timeout shows safe error and returns mock fallback', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'api',
        policyApiUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError'),
    );
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(result.source).toBe('mock');
    expect(result.error).toContain('timed out');
    expect(result.decisions).toHaveLength(1);
  });

  it('API 5xx shows safe error and returns mock fallback', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'api',
        policyApiUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(result.source).toBe('mock');
    expect(result.error).toContain('500');
    expect(result.decisions).toHaveLength(1);
  });

  it('malformed API response is rejected safely and returns mock fallback', async () => {
    vi.doMock('../lib/config', () => ({
      getConfig: () => ({
        policyApiMode: 'api',
        policyApiUrl: 'https://api.example.com',
        tenantId: 'tenant-001',
      }),
    }));

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ invalid: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { evaluateWithService: evalService } = await import('../lib/policy-evaluation-service');
    const result = await evalService(mockRequest);

    expect(result.source).toBe('mock');
    expect(result.error).toContain('Malformed');
    expect(result.decisions).toHaveLength(1);
  });
});
