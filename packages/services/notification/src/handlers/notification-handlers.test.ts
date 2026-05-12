/**
 * Unit tests for notification preference, escalation, and completion handlers.
 * Requirements: 9.3, 9.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { handler as configurePreferencesHandler } from './configure-preferences.js';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

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

function createApiGatewayEvent(body: unknown): APIGatewayProxyEvent {
  return {
    body: body ? JSON.stringify(body) : null,
    headers: { 'Content-Type': 'application/json' },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/v1/notifications/preferences',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: {} as APIGatewayProxyEvent['requestContext'],
    resource: '',
  };
}

describe('configurePreferencesHandler', () => {
  it('should return 400 when body is missing', async () => {
    const event = createApiGatewayEvent(null);
    event.body = null;

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Request body is required');
  });

  it('should return 400 when body is invalid JSON', async () => {
    const event = createApiGatewayEvent(null);
    event.body = 'not-json';

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('Invalid JSON in request body');
  });

  it('should return 400 when userId is missing', async () => {
    const event = createApiGatewayEvent({
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'email', enabled: true }],
        frequency: 'immediate',
        quietHours: { enabled: false },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('userId is required');
  });

  it('should return 400 when tenantId is missing', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      preferences: {
        channels: [{ type: 'email', enabled: true }],
        frequency: 'immediate',
        quietHours: { enabled: false },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('tenantId is required');
  });

  it('should return 400 when preferences is missing', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toBe('preferences is required');
  });

  it('should return 400 for invalid frequency', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'email', enabled: true }],
        frequency: 'invalid',
        quietHours: { enabled: false },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('preferences.frequency must be one of');
  });

  it('should return 400 for invalid channel type', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'sms', enabled: true }],
        frequency: 'immediate',
        quietHours: { enabled: false },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Invalid channel type');
  });

  it('should return 400 when quiet hours enabled without times', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'email', enabled: true }],
        frequency: 'immediate',
        quietHours: { enabled: true },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('startTime and quietHours.endTime are required');
  });

  it('should return 400 for invalid quiet hours time format', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'email', enabled: true }],
        frequency: 'immediate',
        quietHours: { enabled: true, startTime: '25:00', endTime: '08:00' },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('HH:mm format');
  });

  it('should return 200 with saved preferences for valid request', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [
          { type: 'email', enabled: true, address: 'user@example.com' },
          { type: 'slack', enabled: true, address: '#approvals' },
        ],
        frequency: 'immediate',
        quietHours: { enabled: true, startTime: '22:00', endTime: '08:00', timezone: 'Europe/London' },
        escalationOverride: true,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.userId).toBe('user-1');
    expect(body.tenantId).toBe('tenant-1');
    expect(body.preferences.channels).toHaveLength(2);
    expect(body.preferences.frequency).toBe('immediate');
    expect(body.preferences.quietHours.enabled).toBe(true);
    expect(body.updatedAt).toBeTruthy();
  });

  it('should accept daily_digest frequency', async () => {
    const event = createApiGatewayEvent({
      userId: 'user-1',
      tenantId: 'tenant-1',
      preferences: {
        channels: [{ type: 'teams', enabled: true }],
        frequency: 'daily_digest',
        quietHours: { enabled: false },
        escalationOverride: false,
      },
    });

    const result = await configurePreferencesHandler(event, mockContext);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.preferences.frequency).toBe('daily_digest');
  });
});
