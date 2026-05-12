/**
 * Unit tests for policy override handlers: request-override, approve-override, list-overrides.
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Mock the database module
vi.mock('../lib/database.js', () => ({
  withDatabase: vi.fn((fn) => fn(mockDb)),
  createDatabaseClient: vi.fn(),
}));

// Mock EventBridge
vi.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({}),
  })),
  PutEventsCommand: vi.fn(),
}));

const mockDb = {
  query: vi.fn(),
  end: vi.fn(),
};

function createMockEvent(overrides: Partial<APIGatewayProxyEvent> = {}): APIGatewayProxyEvent {
  return {
    httpMethod: 'POST',
    headers: { 'x-tenant-id': 'tenant-123' },
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    path: '',
    resource: '',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      authorizer: { userId: 'user-1' },
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      identity: {} as any,
      path: '',
      stage: 'test',
      requestId: 'req-123',
      requestTimeEpoch: Date.now(),
      resourceId: '',
      resourcePath: '',
    },
    ...overrides,
  } as APIGatewayProxyEvent;
}

const mockContext: Context = {
  awsRequestId: 'test-request-id',
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-1:123456789012:function:test',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'stream',
  memoryLimitInMB: '128',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('request-override handler', () => {
  let handler: typeof import('./request-override.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./request-override.js');
    handler = mod.handler;
  });

  it('returns 401 when tenant ID is missing', async () => {
    const event = createMockEvent({ headers: {} });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_TENANT');
  });

  it('returns 400 when body is missing', async () => {
    const event = createMockEvent({ body: null });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_BODY');
  });

  it('returns 400 when required fields are missing', async () => {
    const event = createMockEvent({
      body: JSON.stringify({ decisionId: 'dec-1' }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_FIELDS');
  });

  it('returns 400 for invalid reason category', async () => {
    const event = createMockEvent({
      body: JSON.stringify({
        decisionId: 'dec-1',
        reasonCategory: 'invalid_category',
        justification: 'This is a valid justification text',
        requestedBy: 'user-1',
      }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_REASON_CATEGORY');
  });

  it('returns 400 when justification is too short', async () => {
    const event = createMockEvent({
      body: JSON.stringify({
        decisionId: 'dec-1',
        reasonCategory: 'emergency',
        justification: 'short',
        requestedBy: 'user-1',
      }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('JUSTIFICATION_TOO_SHORT');
  });

  it('returns 429 when override frequency limit is exceeded', async () => {
    // Mock tenant config query (no config found, use defaults)
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock frequency check - 3 overrides already used (at limit)
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });

    const event = createMockEvent({
      body: JSON.stringify({
        decisionId: 'dec-1',
        reasonCategory: 'emergency',
        justification: 'Urgent client meeting requires immediate travel',
        requestedBy: 'user-1',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(429);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('FREQUENCY_LIMIT_EXCEEDED');
  });

  it('creates an override request successfully', async () => {
    const overrideRecord = {
      overrideId: 'ovr-123',
      tenantId: 'tenant-123',
      decisionId: 'dec-1',
      requestedBy: 'user-1',
      reasonCategory: 'emergency',
      justification: 'Urgent client meeting requires immediate travel',
      status: 'pending',
      approvedBy: null,
      approverComment: null,
      workflowId: null,
      createdAt: '2025-02-20T10:00:00Z',
      updatedAt: '2025-02-20T10:00:00Z',
    };

    // Mock tenant config query (no config found, use defaults)
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock frequency check - 1 override used (under limit)
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    // Mock override creation
    mockDb.query.mockResolvedValueOnce({ rows: [overrideRecord], rowCount: 1 });

    const event = createMockEvent({
      body: JSON.stringify({
        decisionId: 'dec-1',
        reasonCategory: 'emergency',
        justification: 'Urgent client meeting requires immediate travel',
        requestedBy: 'user-1',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('pending');
    expect(body.data.reasonCategory).toBe('emergency');
    expect(body.data.requestedBy).toBe('user-1');
  });

  it('accepts all valid reason categories', async () => {
    const validCategories = ['emergency', 'executive', 'event', 'client_requirement', 'other'];

    for (const category of validCategories) {
      vi.clearAllMocks();

      const overrideRecord = {
        overrideId: `ovr-${category}`,
        tenantId: 'tenant-123',
        decisionId: 'dec-1',
        requestedBy: 'user-1',
        reasonCategory: category,
        justification: 'Valid justification text for testing',
        status: 'pending',
        approvedBy: null,
        approverComment: null,
        workflowId: null,
        createdAt: '2025-02-20T10:00:00Z',
        updatedAt: '2025-02-20T10:00:00Z',
      };

      mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockDb.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
      mockDb.query.mockResolvedValueOnce({ rows: [overrideRecord], rowCount: 1 });

      const event = createMockEvent({
        body: JSON.stringify({
          decisionId: 'dec-1',
          reasonCategory: category,
          justification: 'Valid justification text for testing',
          requestedBy: 'user-1',
        }),
      });

      const result = await handler(event, mockContext);
      expect(result.statusCode).toBe(201);
    }
  });
});

describe('approve-override handler', () => {
  let handler: typeof import('./approve-override.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./approve-override.js');
    handler = mod.handler;
  });

  it('returns 401 when tenant ID is missing', async () => {
    const event = createMockEvent({ headers: {} });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_TENANT');
  });

  it('returns 400 when overrideId path parameter is missing', async () => {
    const event = createMockEvent({
      pathParameters: null,
      body: JSON.stringify({ approverId: 'approver-1' }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_OVERRIDE_ID');
  });

  it('returns 400 when body is missing', async () => {
    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: null,
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_BODY');
  });

  it('returns 400 when approverId is missing', async () => {
    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: JSON.stringify({}),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_FIELDS');
  });

  it('returns 404 when override is not found', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = createMockEvent({
      pathParameters: { overrideId: 'non-existent' },
      body: JSON.stringify({ approverId: 'approver-1' }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('OVERRIDE_NOT_FOUND');
  });

  it('returns 409 when override is not in pending state', async () => {
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        overrideId: 'ovr-123',
        tenantId: 'tenant-123',
        decisionId: 'dec-1',
        requestedBy: 'user-1',
        reasonCategory: 'emergency',
        justification: 'Already approved override',
        status: 'approved',
        approvedBy: 'approver-2',
        approverComment: null,
        workflowId: null,
        createdAt: '2025-02-20T10:00:00Z',
        updatedAt: '2025-02-20T11:00:00Z',
      }],
      rowCount: 1,
    });

    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: JSON.stringify({ approverId: 'approver-1' }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(409);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('OVERRIDE_NOT_PENDING');
  });

  it('approves an override successfully', async () => {
    const pendingOverride = {
      overrideId: 'ovr-123',
      tenantId: 'tenant-123',
      decisionId: 'dec-1',
      requestedBy: 'user-1',
      reasonCategory: 'emergency',
      justification: 'Urgent client meeting requires immediate travel',
      status: 'pending',
      approvedBy: null,
      approverComment: null,
      workflowId: null,
      createdAt: '2025-02-20T10:00:00Z',
      updatedAt: '2025-02-20T10:00:00Z',
    };

    const approvedOverride = {
      ...pendingOverride,
      status: 'approved',
      approvedBy: 'approver-1',
      approverComment: 'Approved for client meeting',
      updatedAt: '2025-02-20T11:00:00Z',
    };

    // Mock get override
    mockDb.query.mockResolvedValueOnce({ rows: [pendingOverride], rowCount: 1 });
    // Mock update override
    mockDb.query.mockResolvedValueOnce({ rows: [approvedOverride], rowCount: 1 });
    // Mock audit trail insert
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: JSON.stringify({
        approverId: 'approver-1',
        action: 'approve',
        comment: 'Approved for client meeting',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('approved');
    expect(body.data.approvedBy).toBe('approver-1');
    expect(body.data.approverComment).toBe('Approved for client meeting');
  });

  it('rejects an override successfully', async () => {
    const pendingOverride = {
      overrideId: 'ovr-123',
      tenantId: 'tenant-123',
      decisionId: 'dec-1',
      requestedBy: 'user-1',
      reasonCategory: 'other',
      justification: 'Would like to upgrade to business class',
      status: 'pending',
      approvedBy: null,
      approverComment: null,
      workflowId: null,
      createdAt: '2025-02-20T10:00:00Z',
      updatedAt: '2025-02-20T10:00:00Z',
    };

    const rejectedOverride = {
      ...pendingOverride,
      status: 'rejected',
      approvedBy: 'approver-1',
      approverComment: 'Not justified',
      updatedAt: '2025-02-20T11:00:00Z',
    };

    mockDb.query.mockResolvedValueOnce({ rows: [pendingOverride], rowCount: 1 });
    mockDb.query.mockResolvedValueOnce({ rows: [rejectedOverride], rowCount: 1 });
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: JSON.stringify({
        approverId: 'approver-1',
        action: 'reject',
        comment: 'Not justified',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.status).toBe('rejected');
  });

  it('returns 400 for invalid action', async () => {
    const event = createMockEvent({
      pathParameters: { overrideId: 'ovr-123' },
      body: JSON.stringify({
        approverId: 'approver-1',
        action: 'invalid',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_ACTION');
  });
});

describe('list-overrides handler', () => {
  let handler: typeof import('./list-overrides.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./list-overrides.js');
    handler = mod.handler;
  });

  it('returns 401 when tenant ID is missing', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: null,
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(401);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_TENANT');
  });

  it('returns 400 for invalid status filter', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { status: 'invalid' },
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_STATUS');
  });

  it('returns 400 for invalid reason category filter', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { reasonCategory: 'invalid' },
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_REASON_CATEGORY');
  });

  it('returns 400 for invalid from date', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { from: 'not-a-date' },
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_DATE');
  });

  it('returns paginated overrides without filters', async () => {
    const overrides = [
      {
        overrideId: 'ovr-1',
        tenantId: 'tenant-123',
        decisionId: 'dec-1',
        requestedBy: 'user-1',
        reasonCategory: 'emergency',
        justification: 'Urgent travel needed',
        status: 'approved',
        approvedBy: 'approver-1',
        approverComment: 'Approved',
        workflowId: null,
        createdAt: '2025-02-20T10:00:00Z',
        updatedAt: '2025-02-20T11:00:00Z',
      },
      {
        overrideId: 'ovr-2',
        tenantId: 'tenant-123',
        decisionId: 'dec-2',
        requestedBy: 'user-2',
        reasonCategory: 'client_requirement',
        justification: 'Client requires in-person meeting',
        status: 'pending',
        approvedBy: null,
        approverComment: null,
        workflowId: null,
        createdAt: '2025-02-21T10:00:00Z',
        updatedAt: '2025-02-21T10:00:00Z',
      },
    ];

    // Mock count query
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 });
    // Mock data query
    mockDb.query.mockResolvedValueOnce({ rows: overrides, rowCount: 2 });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: null,
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(2);
    expect(body.data.pagination.totalCount).toBe(2);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.pageSize).toBe(20);
  });

  it('applies status filter correctly', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        overrideId: 'ovr-1',
        tenantId: 'tenant-123',
        decisionId: 'dec-1',
        requestedBy: 'user-1',
        reasonCategory: 'emergency',
        justification: 'Urgent travel needed',
        status: 'pending',
        approvedBy: null,
        approverComment: null,
        workflowId: null,
        createdAt: '2025-02-20T10:00:00Z',
        updatedAt: '2025-02-20T10:00:00Z',
      }],
      rowCount: 1,
    });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { status: 'pending' },
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].status).toBe('pending');
  });

  it('applies pagination correctly', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '50' }], rowCount: 1 });
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { page: '3', pageSize: '10' },
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.pagination.page).toBe(3);
    expect(body.data.pagination.pageSize).toBe(10);
    expect(body.data.pagination.totalCount).toBe(50);
    expect(body.data.pagination.totalPages).toBe(5);
  });

  it('supports filtering by approvedBy', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    mockDb.query.mockResolvedValueOnce({
      rows: [{
        overrideId: 'ovr-1',
        tenantId: 'tenant-123',
        decisionId: 'dec-1',
        requestedBy: 'user-1',
        reasonCategory: 'executive',
        justification: 'Executive travel requirement',
        status: 'approved',
        approvedBy: 'approver-1',
        approverComment: 'Approved',
        workflowId: null,
        createdAt: '2025-02-20T10:00:00Z',
        updatedAt: '2025-02-20T11:00:00Z',
      }],
      rowCount: 1,
    });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { approvedBy: 'approver-1' },
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].approvedBy).toBe('approver-1');
  });
});
