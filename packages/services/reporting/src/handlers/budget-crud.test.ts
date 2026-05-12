/**
 * Unit tests for Budget CRUD handlers
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent } from 'aws-lambda';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    end: vi.fn(),
  };
  return { mockClient };
});

// Mock the database module
vi.mock('../lib/database', () => ({
  withDatabase: vi.fn((fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient)),
}));

import {
  createBudgetHandler,
  listBudgetsHandler,
  getBudgetHandler,
  updateBudgetHandler,
  deleteBudgetHandler,
} from './budget-crud';

function makeEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'GET',
    path: '/v1/budgets',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    body: null,
    isBase64Encoded: false,
    resource: '',
    requestContext: {
      authorizer: {
        tenantSchema: 'tenant_abc12345',
        tenantId: 'abc12345-1234-1234-1234-123456789012',
      },
      accountId: '123456789012',
      apiId: 'test-api',
      httpMethod: 'GET',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '127.0.0.1',
        user: null,
        userAgent: null,
        userArn: null,
      },
      path: '/v1/budgets',
      protocol: 'HTTP/1.1',
      requestId: 'test-request-id',
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource',
      resourcePath: '/v1/budgets',
      stage: 'test',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

describe('Budget CRUD Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBudgetHandler', () => {
    it('should create a budget with valid input', async () => {
      const budgetRecord = {
        budget_id: 'budget-123',
        name: 'Engineering Q1',
        scope_type: 'department',
        scope_value: 'engineering',
        period_type: 'quarterly',
        amount: 50000,
        currency: 'GBP',
        warning_threshold: 80,
        current_utilisation: 0,
        period_start: '2024-01-01',
        period_end: '2024-03-31',
        owner_id: null,
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.query.mockResolvedValueOnce({ rows: [budgetRecord], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Engineering Q1',
          scope_type: 'department',
          scope_value: 'engineering',
          period_type: 'quarterly',
          amount: 50000,
          currency: 'GBP',
          period_start: '2024-01-01',
          period_end: '2024-03-31',
        }),
      });

      const result = await createBudgetHandler(event);
      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body);
      expect(body.data.name).toBe('Engineering Q1');
      expect(body.data.scope_type).toBe('department');
    });

    it('should reject invalid scope_type', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Test Budget',
          scope_type: 'invalid',
          scope_value: 'test',
          period_type: 'monthly',
          amount: 1000,
          currency: 'GBP',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
        }),
      });

      const result = await createBudgetHandler(event);
      expect(result.statusCode).toBe(400);

      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject negative amount', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Test Budget',
          scope_type: 'department',
          scope_value: 'test',
          period_type: 'monthly',
          amount: -100,
          currency: 'GBP',
          period_start: '2024-01-01',
          period_end: '2024-01-31',
        }),
      });

      const result = await createBudgetHandler(event);
      expect(result.statusCode).toBe(400);
    });

    it('should return 401 when tenant context is missing', async () => {
      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ name: 'Test' }),
        requestContext: {
          authorizer: {},
        } as APIGatewayProxyEvent['requestContext'],
      });

      // Clear the env var to ensure no fallback
      const original = process.env.DEFAULT_TENANT_SCHEMA;
      delete process.env.DEFAULT_TENANT_SCHEMA;

      const result = await createBudgetHandler(event);
      expect(result.statusCode).toBe(401);

      process.env.DEFAULT_TENANT_SCHEMA = original;
    });

    it('should accept custom warning_threshold', async () => {
      const budgetRecord = {
        budget_id: 'budget-456',
        name: 'Custom Threshold',
        scope_type: 'cost_centre',
        scope_value: 'CC-001',
        period_type: 'annual',
        amount: 100000,
        currency: 'USD',
        warning_threshold: 70,
        current_utilisation: 0,
        period_start: '2024-01-01',
        period_end: '2024-12-31',
        owner_id: 'owner-123',
        is_active: true,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockClient.query.mockResolvedValueOnce({ rows: [budgetRecord], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Custom Threshold',
          scope_type: 'cost_centre',
          scope_value: 'CC-001',
          period_type: 'annual',
          amount: 100000,
          currency: 'USD',
          warning_threshold: 70,
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          owner_id: 'owner-123',
        }),
      });

      const result = await createBudgetHandler(event);
      expect(result.statusCode).toBe(201);

      const body = JSON.parse(result.body);
      expect(body.data.warning_threshold).toBe(70);
    });
  });

  describe('listBudgetsHandler', () => {
    it('should list budgets with pagination', async () => {
      const budgets = [
        { budget_id: 'b1', name: 'Budget 1', amount: 10000 },
        { budget_id: 'b2', name: 'Budget 2', amount: 20000 },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: budgets, rowCount: 2 });

      const event = makeEvent({
        queryStringParameters: { scope_type: 'department', limit: '10', offset: '0' },
      });

      const result = await listBudgetsHandler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.totalCount).toBe(2);
      expect(body.pagination.hasMore).toBe(false);
    });

    it('should handle empty results', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent({
        queryStringParameters: null,
      });

      const result = await listBudgetsHandler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data).toHaveLength(0);
      expect(body.pagination.totalCount).toBe(0);
    });
  });

  describe('getBudgetHandler', () => {
    it('should return budget with utilisation percentage', async () => {
      const budget = {
        budget_id: 'budget-123',
        name: 'Engineering Q1',
        amount: 50000,
        current_utilisation: 42000,
        warning_threshold: 80,
        is_active: true,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [budget], rowCount: 1 });

      const event = makeEvent({
        pathParameters: { budgetId: 'budget-123' },
      });

      const result = await getBudgetHandler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data.percent_used).toBe(84);
      expect(body.data.threshold_breached).toBe(true);
      expect(body.data.over_budget).toBe(false);
    });

    it('should return 404 for non-existent budget', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent({
        pathParameters: { budgetId: 'non-existent' },
      });

      const result = await getBudgetHandler(event);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('updateBudgetHandler', () => {
    it('should update budget fields', async () => {
      const updatedBudget = {
        budget_id: 'budget-123',
        name: 'Updated Name',
        amount: 75000,
        warning_threshold: 85,
      };

      mockClient.query.mockResolvedValueOnce({ rows: [updatedBudget], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { budgetId: 'budget-123' },
        body: JSON.stringify({
          name: 'Updated Name',
          amount: 75000,
          warning_threshold: 85,
        }),
      });

      const result = await updateBudgetHandler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data.name).toBe('Updated Name');
    });

    it('should return 404 for inactive budget', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent({
        httpMethod: 'PUT',
        pathParameters: { budgetId: 'inactive-budget' },
        body: JSON.stringify({ name: 'New Name' }),
      });

      const result = await updateBudgetHandler(event);
      expect(result.statusCode).toBe(404);
    });
  });

  describe('deleteBudgetHandler', () => {
    it('should deactivate a budget', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { budgetId: 'budget-123' },
      });

      const result = await deleteBudgetHandler(event);
      expect(result.statusCode).toBe(200);

      const body = JSON.parse(result.body);
      expect(body.data.status).toBe('deactivated');
    });

    it('should return 404 for already deactivated budget', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const event = makeEvent({
        httpMethod: 'DELETE',
        pathParameters: { budgetId: 'already-inactive' },
      });

      const result = await deleteBudgetHandler(event);
      expect(result.statusCode).toBe(404);
    });
  });
});
