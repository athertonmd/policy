/**
 * Unit tests for escalation and completion notification handlers.
 * Tests event validation and template rendering logic.
 * Requirements: 9.3, 9.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handler as sendEscalationNotificationHandler } from './send-escalation-notification.js';
import { handler as sendCompletionNotificationHandler } from './send-completion-notification.js';
import type { EventBridgeEvent, Context } from 'aws-lambda';

// Mock the external dependencies
vi.mock('../lib/email-sender.js', () => ({
  sendTrackedEmail: vi.fn().mockResolvedValue({
    messageId: 'mock-message-id',
    success: true,
    timestamp: '2024-01-01T00:00:00.000Z',
  }),
}));

vi.mock('../lib/action-link-generator.js', () => ({
  generateActionLinks: vi.fn().mockResolvedValue([
    { action: 'approve', url: 'https://example.com/approve?token=abc', token: 'abc', expiresAt: '2024-01-02T00:00:00.000Z' },
    { action: 'reject', url: 'https://example.com/reject?token=def', token: 'def', expiresAt: '2024-01-02T00:00:00.000Z' },
    { action: 'request_info', url: 'https://example.com/info?token=ghi', token: 'ghi', expiresAt: '2024-01-02T00:00:00.000Z' },
  ]),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(() => ({
    send: vi.fn().mockResolvedValue({ SecretString: 'test-secret' }),
  })),
  GetSecretValueCommand: vi.fn(),
}));

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-2:123456789:function:test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

function createEscalationEvent(
  detail: Record<string, unknown>
): EventBridgeEvent<'ApprovalEscalated', any> {
  return {
    version: '0',
    id: 'test-event-id',
    source: 'travel-policy.approval',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'eu-west-2',
    resources: [],
    'detail-type': 'ApprovalEscalated',
    detail,
  };
}

function createCompletionEvent(
  detail: Record<string, unknown>
): EventBridgeEvent<'ApprovalWorkflowCompleted', any> {
  return {
    version: '0',
    id: 'test-event-id',
    source: 'travel-policy.approval',
    account: '123456789',
    time: '2024-01-01T00:00:00Z',
    region: 'eu-west-2',
    resources: [],
    'detail-type': 'ApprovalWorkflowCompleted',
    detail,
  };
}

describe('sendEscalationNotificationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when original approver email is missing', async () => {
    const event = createEscalationEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      stageNumber: 1,
      escalationReason: 'SLA breached',
      timestamp: '2024-01-01T00:00:00Z',
      originalApprover: { approverId: 'a1', approverName: 'Alice' },
      escalationTarget: { approverId: 'b1', approverName: 'Bob', approverEmail: 'bob@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      travellerName: 'Charlie',
    });

    await expect(sendEscalationNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing original approver email'
    );
  });

  it('should throw when escalation target email is missing', async () => {
    const event = createEscalationEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      stageNumber: 1,
      escalationReason: 'SLA breached',
      timestamp: '2024-01-01T00:00:00Z',
      originalApprover: { approverId: 'a1', approverName: 'Alice', approverEmail: 'alice@example.com' },
      escalationTarget: { approverId: 'b1', approverName: 'Bob' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      travellerName: 'Charlie',
    });

    await expect(sendEscalationNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing escalation target email'
    );
  });

  it('should throw when trip summary is missing', async () => {
    const event = createEscalationEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      stageNumber: 1,
      escalationReason: 'SLA breached',
      timestamp: '2024-01-01T00:00:00Z',
      originalApprover: { approverId: 'a1', approverName: 'Alice', approverEmail: 'alice@example.com' },
      escalationTarget: { approverId: 'b1', approverName: 'Bob', approverEmail: 'bob@example.com' },
      travellerName: 'Charlie',
    });

    await expect(sendEscalationNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing trip summary'
    );
  });

  it('should send notifications to both original approver and escalation target', async () => {
    const { sendTrackedEmail } = await import('../lib/email-sender.js');

    const event = createEscalationEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      stageNumber: 1,
      escalationReason: 'SLA breached',
      timestamp: '2024-01-01T00:00:00Z',
      originalApprover: { approverId: 'a1', approverName: 'Alice', approverEmail: 'alice@example.com' },
      escalationTarget: { approverId: 'b1', approverName: 'Bob', approverEmail: 'bob@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      travellerName: 'Charlie',
    });

    await sendEscalationNotificationHandler(event, mockContext);

    // Should have been called twice: once for escalation target, once for original approver
    expect(sendTrackedEmail).toHaveBeenCalledTimes(2);

    // First call: escalation target
    const firstCall = (sendTrackedEmail as any).mock.calls[0];
    expect(firstCall[0].to).toBe('bob@example.com');
    expect(firstCall[1].notificationType).toBe('escalation-target');

    // Second call: original approver
    const secondCall = (sendTrackedEmail as any).mock.calls[1];
    expect(secondCall[0].to).toBe('alice@example.com');
    expect(secondCall[1].notificationType).toBe('escalation-notice');
  });

  it('should generate action links for the escalation target', async () => {
    const { generateActionLinks } = await import('../lib/action-link-generator.js');

    const event = createEscalationEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      stageNumber: 2,
      escalationReason: 'SLA breached',
      timestamp: '2024-01-01T00:00:00Z',
      originalApprover: { approverId: 'a1', approverName: 'Alice', approverEmail: 'alice@example.com' },
      escalationTarget: { approverId: 'b1', approverName: 'Bob', approverEmail: 'bob@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      travellerName: 'Charlie',
    });

    await sendEscalationNotificationHandler(event, mockContext);

    expect(generateActionLinks).toHaveBeenCalledWith(
      expect.objectContaining({
        workflowId: 'wf-1',
        stageNumber: 2,
        approverId: 'b1',
        tenantId: 'tenant-1',
      }),
      expect.objectContaining({
        expiryHours: 24,
      })
    );
  });
});

describe('sendCompletionNotificationHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when traveller email is missing', async () => {
    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      outcome: 'approved',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
    });

    await expect(sendCompletionNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing traveller email'
    );
  });

  it('should throw when trip summary is missing', async () => {
    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      outcome: 'approved',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie', travellerEmail: 'charlie@example.com' },
    });

    await expect(sendCompletionNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing trip summary'
    );
  });

  it('should throw when outcome is missing', async () => {
    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie', travellerEmail: 'charlie@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
    });

    await expect(sendCompletionNotificationHandler(event, mockContext)).rejects.toThrow(
      'Missing outcome'
    );
  });

  it('should send approval notification to traveller', async () => {
    const { sendTrackedEmail } = await import('../lib/email-sender.js');

    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      outcome: 'approved',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie', travellerEmail: 'charlie@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
    });

    await sendCompletionNotificationHandler(event, mockContext);

    expect(sendTrackedEmail).toHaveBeenCalledTimes(1);
    const call = (sendTrackedEmail as any).mock.calls[0];
    expect(call[0].to).toBe('charlie@example.com');
    expect(call[0].subject).toContain('Approved');
    expect(call[1].notificationType).toBe('workflow-completed');
    expect(call[1].workflowId).toBe('wf-1');
    expect(call[1].tenantId).toBe('tenant-1');
  });

  it('should send rejection notification to traveller', async () => {
    const { sendTrackedEmail } = await import('../lib/email-sender.js');

    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      outcome: 'rejected',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie', travellerEmail: 'charlie@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      rejectionReason: 'Budget exceeded',
    });

    await sendCompletionNotificationHandler(event, mockContext);

    expect(sendTrackedEmail).toHaveBeenCalledTimes(1);
    const call = (sendTrackedEmail as any).mock.calls[0];
    expect(call[0].subject).toContain('Rejected');
  });

  it('should include obligations and conditions in the notification', async () => {
    const { sendTrackedEmail } = await import('../lib/email-sender.js');

    const event = createCompletionEvent({
      workflowId: 'wf-1',
      tenantId: 'tenant-1',
      tripRequestId: 'trip-1',
      travellerId: 'trav-1',
      outcome: 'approved',
      timestamp: '2024-01-01T00:00:00Z',
      traveller: { travellerId: 'trav-1', travellerName: 'Charlie', travellerEmail: 'charlie@example.com' },
      tripSummary: { tripId: 't1', origin: 'LHR', destination: 'JFK', departureDate: '2024-02-01', totalCost: '1500', currency: 'GBP', tripType: 'international' },
      obligations: ['Submit expense report within 5 days'],
      conditions: ['Economy class only'],
    });

    await sendCompletionNotificationHandler(event, mockContext);

    expect(sendTrackedEmail).toHaveBeenCalledTimes(1);
    const call = (sendTrackedEmail as any).mock.calls[0];
    // The HTML body should contain the conditions
    expect(call[0].html).toContain('Submit expense report within 5 days');
    expect(call[0].html).toContain('Economy class only');
  });
});
