/**
 * Unit tests for delegation, template configuration, and list pending approvals handlers.
 * Requirements: 8.6, 8.7
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

describe('configure-delegation handler', () => {
  let handler: typeof import('./configure-delegation.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./configure-delegation.js');
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
      body: JSON.stringify({ approverId: 'approver-1' }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_FIELDS');
  });

  it('returns 400 when endDate is before startDate', async () => {
    const event = createMockEvent({
      body: JSON.stringify({
        approverId: 'approver-1',
        delegateToId: 'delegate-1',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-02-01T00:00:00Z',
      }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_DATE_RANGE');
  });

  it('returns 400 when approver delegates to themselves', async () => {
    const event = createMockEvent({
      body: JSON.stringify({
        approverId: 'approver-1',
        delegateToId: 'approver-1',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-15T00:00:00Z',
      }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('SELF_DELEGATION');
  });

  it('creates a delegation successfully', async () => {
    const delegationRecord = {
      delegationId: 'del-123',
      tenantId: 'tenant-123',
      approverId: 'approver-1',
      delegateToId: 'delegate-1',
      startDate: '2025-03-01T00:00:00Z',
      endDate: '2025-03-15T00:00:00Z',
      reason: 'On vacation',
      isActive: true,
      createdAt: '2025-02-20T10:00:00Z',
      createdBy: 'user-1',
    };

    // Mock deactivation of overlapping delegations
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock creation
    mockDb.query.mockResolvedValueOnce({ rows: [delegationRecord], rowCount: 1 });

    const event = createMockEvent({
      body: JSON.stringify({
        approverId: 'approver-1',
        delegateToId: 'delegate-1',
        startDate: '2025-03-01T00:00:00Z',
        endDate: '2025-03-15T00:00:00Z',
        reason: 'On vacation',
      }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.data.approverId).toBe('approver-1');
    expect(body.data.delegateToId).toBe('delegate-1');
    expect(body.data.isActive).toBe(true);
  });

  it('returns 400 for invalid date strings', async () => {
    const event = createMockEvent({
      body: JSON.stringify({
        approverId: 'approver-1',
        delegateToId: 'delegate-1',
        startDate: 'not-a-date',
        endDate: '2025-03-15T00:00:00Z',
      }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_DATES');
  });
});

describe('configure-template handler', () => {
  let handler: typeof import('./configure-template.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./configure-template.js');
    handler = mod.handler;
  });

  const validTemplateBody = {
    name: 'Standard Approval',
    description: 'Default approval workflow',
    stages: [
      {
        stageNumber: 1,
        type: 'single',
        approverRules: [{ type: 'role', value: 'manager' }],
        requiredApprovals: 1,
        slaHours: 24,
      },
    ],
    escalationRules: [
      {
        triggerAfterHours: 24,
        escalateTo: { type: 'role', value: 'director' },
        notifyOriginalApprover: true,
      },
    ],
    slaConfig: {
      defaultSlaHours: 48,
      urgentSlaHours: 4,
      reminderIntervalHours: 8,
      maxEscalations: 3,
    },
  };

  it('returns 401 when tenant ID is missing', async () => {
    const event = createMockEvent({ headers: {} });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when body is missing', async () => {
    const event = createMockEvent({ body: null });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 when name is missing', async () => {
    const event = createMockEvent({
      body: JSON.stringify({ ...validTemplateBody, name: '' }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_TEMPLATE');
  });

  it('returns 400 when stages is empty', async () => {
    const event = createMockEvent({
      body: JSON.stringify({ ...validTemplateBody, stages: [] }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_TEMPLATE');
  });

  it('returns 400 when slaConfig is missing', async () => {
    const event = createMockEvent({
      body: JSON.stringify({ ...validTemplateBody, slaConfig: undefined }),
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('INVALID_TEMPLATE');
  });

  it('creates a template successfully via POST', async () => {
    const templateRecord = {
      templateId: 'tmpl-123',
      tenantId: 'tenant-123',
      name: 'Standard Approval',
      description: 'Default approval workflow',
      stagesJson: JSON.stringify(validTemplateBody.stages),
      escalationRulesJson: JSON.stringify(validTemplateBody.escalationRules),
      autoApprovalConditionsJson: null,
      slaConfigJson: JSON.stringify(validTemplateBody.slaConfig),
      isActive: true,
      createdBy: 'user-1',
      createdAt: '2025-02-20T10:00:00Z',
      updatedAt: '2025-02-20T10:00:00Z',
    };

    mockDb.query.mockResolvedValueOnce({ rows: [templateRecord], rowCount: 1 });

    const event = createMockEvent({
      httpMethod: 'POST',
      body: JSON.stringify(validTemplateBody),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(201);
    const body = JSON.parse(result.body);
    expect(body.data.name).toBe('Standard Approval');
    expect(body.data.stages).toEqual(validTemplateBody.stages);
    expect(body.data.isActive).toBe(true);
  });

  it('updates a template successfully via PUT', async () => {
    const templateRecord = {
      templateId: 'tmpl-123',
      tenantId: 'tenant-123',
      name: 'Updated Approval',
      description: 'Updated workflow',
      stagesJson: JSON.stringify(validTemplateBody.stages),
      escalationRulesJson: JSON.stringify(validTemplateBody.escalationRules),
      autoApprovalConditionsJson: null,
      slaConfigJson: JSON.stringify(validTemplateBody.slaConfig),
      isActive: true,
      createdBy: 'user-1',
      createdAt: '2025-02-20T10:00:00Z',
      updatedAt: '2025-02-21T10:00:00Z',
    };

    mockDb.query.mockResolvedValueOnce({ rows: [templateRecord], rowCount: 1 });

    const event = createMockEvent({
      httpMethod: 'PUT',
      pathParameters: { templateId: 'tmpl-123' },
      body: JSON.stringify({ ...validTemplateBody, name: 'Updated Approval' }),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.name).toBe('Updated Approval');
  });

  it('returns 404 when updating a non-existent template', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = createMockEvent({
      httpMethod: 'PUT',
      pathParameters: { templateId: 'non-existent' },
      body: JSON.stringify(validTemplateBody),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(404);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('TEMPLATE_NOT_FOUND');
  });

  it('returns 400 when PUT is missing templateId path parameter', async () => {
    const event = createMockEvent({
      httpMethod: 'PUT',
      pathParameters: null,
      body: JSON.stringify(validTemplateBody),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_TEMPLATE_ID');
  });

  it('returns 405 for unsupported HTTP methods', async () => {
    const event = createMockEvent({
      httpMethod: 'DELETE',
      body: JSON.stringify(validTemplateBody),
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(405);
  });
});

describe('list-pending-approvals handler', () => {
  let handler: typeof import('./list-pending-approvals.js').handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./list-pending-approvals.js');
    handler = mod.handler;
  });

  it('returns 401 when tenant ID is missing', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      headers: {},
      queryStringParameters: { approverId: 'approver-1' },
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(401);
  });

  it('returns 400 when approverId query param is missing', async () => {
    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: null,
    });
    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.code).toBe('MISSING_APPROVER_ID');
  });

  it('returns paginated pending approvals', async () => {
    // Mock delegations query (delegations TO this approver)
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock count query
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    // Mock data query
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          workflowId: 'wf-1',
          tripRequestId: 'trip-1',
          travellerId: 'traveller-1',
          priority: 'normal',
          status: 'pending',
          currentStage: 1,
          stagesJson: JSON.stringify([
            { stageNumber: 1, slaDeadline: '2025-03-01T00:00:00Z', status: 'pending' },
          ]),
          initiatedAt: '2025-02-20T10:00:00Z',
        },
      ],
      rowCount: 1,
    });
    // Mock active delegation check for the approver
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { approverId: 'approver-1', page: '1', pageSize: '20' },
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].workflowId).toBe('wf-1');
    expect(body.data.items[0].isDelegated).toBe(false);
    expect(body.data.pagination.page).toBe(1);
    expect(body.data.pagination.pageSize).toBe(20);
  });

  it('includes delegated items from approvers who delegated to this user', async () => {
    // Mock delegations TO this approver
    mockDb.query.mockResolvedValueOnce({
      rows: [{ approverId: 'original-approver' }],
      rowCount: 1,
    });
    // Mock count query for own workflows
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // Mock data query for own workflows
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock active delegation check
    mockDb.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // Mock count query for delegated workflows
    mockDb.query.mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });
    // Mock data query for delegated workflows
    mockDb.query.mockResolvedValueOnce({
      rows: [
        {
          workflowId: 'wf-delegated',
          tripRequestId: 'trip-2',
          travellerId: 'traveller-2',
          priority: 'urgent',
          status: 'pending',
          currentStage: 1,
          stagesJson: JSON.stringify([
            { stageNumber: 1, slaDeadline: '2025-03-02T00:00:00Z', status: 'pending' },
          ]),
          initiatedAt: '2025-02-21T10:00:00Z',
        },
      ],
      rowCount: 1,
    });

    const event = createMockEvent({
      httpMethod: 'GET',
      queryStringParameters: { approverId: 'delegate-1' },
    });

    const result = await handler(event, mockContext);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].workflowId).toBe('wf-delegated');
    expect(body.data.items[0].isDelegated).toBe(true);
    expect(body.data.items[0].originalApproverId).toBe('original-approver');
  });
});
