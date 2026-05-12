/**
 * Unit tests for Budget Utilisation Updater handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient, mockEventBridgeSend } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    end: vi.fn(),
  };
  const mockEventBridgeSend = vi.fn().mockResolvedValue({});
  return { mockClient, mockEventBridgeSend };
});

// Mock the database module
vi.mock('../lib/database', () => ({
  withDatabase: vi.fn((fn: (client: typeof mockClient) => Promise<unknown>) => fn(mockClient)),
}));

// Mock EventBridge client
vi.mock('@aws-sdk/client-eventbridge', () => ({
  EventBridgeClient: vi.fn().mockImplementation(() => ({
    send: mockEventBridgeSend,
  })),
  PutEventsCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { handler } from './budget-utilisation-updater';

function makeApprovalEvent(overrides: Record<string, unknown> = {}) {
  return {
    version: '0',
    id: 'event-123',
    source: 'travel-policy-platform',
    'detail-type': 'ApprovalWorkflowCompleted',
    time: '2024-01-15T10:00:00Z',
    region: 'eu-west-1',
    detail: {
      tenantId: 'abc12345-1234-1234-1234-123456789012',
      correlationId: 'corr-123',
      aggregateId: 'workflow-123',
      aggregateType: 'ApprovalWorkflow',
      payload: {
        tenantId: 'abc12345-1234-1234-1234-123456789012',
        workflowId: 'workflow-123',
        tripRequestId: 'trip-456',
        travellerId: 'traveller-789',
        outcome: 'approved',
        totalCost: { amount: 1500, currency: 'GBP' },
        department: 'engineering',
        costCentre: 'CC-001',
        approvedAt: '2024-01-15T10:00:00Z',
        correlationId: 'corr-123',
        ...overrides,
      },
    },
  } as const;
}

describe('Budget Utilisation Updater', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TENANT_SCHEMA_OVERRIDE = 'tenant_abc12345';
  });

  it('should skip non-approved workflows', async () => {
    const event = makeApprovalEvent({ outcome: 'rejected' });
    await handler(event as any);

    expect(mockClient.query).not.toHaveBeenCalled();
  });

  it('should update utilisation for applicable budgets', async () => {
    // Mock findApplicableBudgets query
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          name: 'Engineering Budget',
          scope_type: 'department',
          scope_value: 'engineering',
          amount: 50000,
          current_utilisation: 20000,
          warning_threshold: 80,
          is_active: true,
        },
      ],
      rowCount: 1,
    });

    // Mock incrementUtilisation query
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          previous_utilisation: 20000,
          new_utilisation: 21500,
          amount: 50000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    const event = makeApprovalEvent();
    await handler(event as any);

    // Should have queried for applicable budgets and updated utilisation
    expect(mockClient.query).toHaveBeenCalledTimes(2);
  });

  it('should publish BudgetThresholdBreached event when warning threshold is crossed', async () => {
    // Budget at 79% before update, will be 82% after (crosses 80% threshold)
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          name: 'Engineering Budget',
          scope_type: 'department',
          scope_value: 'engineering',
          amount: 10000,
          current_utilisation: 7900,
          warning_threshold: 80,
          is_active: true,
        },
      ],
      rowCount: 1,
    });

    // After increment: previous=7900, new=9400 (94%)
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          previous_utilisation: 7900,
          new_utilisation: 9400,
          amount: 10000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    const event = makeApprovalEvent({ totalCost: { amount: 1500, currency: 'GBP' } });
    await handler(event as any);

    // Should publish threshold breach event
    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
  });

  it('should publish finance approval event when budget exceeds 100%', async () => {
    // Budget at 95% before update, will exceed 100% after
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          name: 'Engineering Budget',
          scope_type: 'department',
          scope_value: 'engineering',
          amount: 10000,
          current_utilisation: 9500,
          warning_threshold: 80,
          is_active: true,
        },
      ],
      rowCount: 1,
    });

    // After increment: previous=9500, new=11000 (110%)
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          previous_utilisation: 9500,
          new_utilisation: 11000,
          amount: 10000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    const event = makeApprovalEvent({ totalCost: { amount: 1500, currency: 'GBP' } });
    await handler(event as any);

    // Should publish event with requiresFinanceApproval flag
    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const sentCommand = mockEventBridgeSend.mock.calls[0][0];
    const entries = sentCommand.input.Entries;
    const detail = JSON.parse(entries[0].Detail);
    expect(detail.payload.requiresFinanceApproval).toBe(true);
    expect(detail.payload.thresholdType).toBe('exceeded');
  });

  it('should not publish events when threshold was already breached', async () => {
    // Budget already at 85% (above 80% threshold) — no new breach
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          name: 'Engineering Budget',
          scope_type: 'department',
          scope_value: 'engineering',
          amount: 10000,
          current_utilisation: 8500,
          warning_threshold: 80,
          is_active: true,
        },
      ],
      rowCount: 1,
    });

    // After increment: previous=8500, new=9000 (90%) — still above threshold but was already
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept-1',
          previous_utilisation: 8500,
          new_utilisation: 9000,
          amount: 10000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    const event = makeApprovalEvent({ totalCost: { amount: 500, currency: 'GBP' } });
    await handler(event as any);

    // Should NOT publish any events since threshold was already breached
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
  });

  it('should handle no applicable budgets gracefully', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    });

    const event = makeApprovalEvent();
    await handler(event as any);

    // Only the findApplicableBudgets query should have been called
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockEventBridgeSend).not.toHaveBeenCalled();
  });

  it('should update multiple budgets when trip affects multiple scopes', async () => {
    // Two applicable budgets: tenant-level and department-level
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-tenant',
          scope_type: 'tenant',
          amount: 500000,
          current_utilisation: 100000,
          warning_threshold: 80,
          is_active: true,
        },
        {
          budget_id: 'budget-dept',
          scope_type: 'department',
          amount: 50000,
          current_utilisation: 20000,
          warning_threshold: 80,
          is_active: true,
        },
      ],
      rowCount: 2,
    });

    // First budget update (tenant-level)
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-tenant',
          previous_utilisation: 100000,
          new_utilisation: 101500,
          amount: 500000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    // Second budget update (department-level)
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          budget_id: 'budget-dept',
          previous_utilisation: 20000,
          new_utilisation: 21500,
          amount: 50000,
          warning_threshold: 80,
        },
      ],
      rowCount: 1,
    });

    const event = makeApprovalEvent();
    await handler(event as any);

    // Should have called query 3 times: 1 find + 2 updates
    expect(mockClient.query).toHaveBeenCalledTimes(3);
  });
});
