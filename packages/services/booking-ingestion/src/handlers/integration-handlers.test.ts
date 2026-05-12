/**
 * Unit tests for integration configuration and health monitoring handlers.
 * Tests the core logic: validation, health status determination, and response formatting.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { determineHealthStatus } from './get-integration-health.js';
import { extractTenantId, successResponse, errorResponse, CORS_HEADERS } from './shared.js';
import type { APIGatewayProxyEvent } from 'aws-lambda';

describe('shared utilities', () => {
  describe('extractTenantId', () => {
    it('extracts tenant ID from x-tenant-id header', () => {
      const event = {
        headers: { 'x-tenant-id': 'tenant-123' },
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      expect(extractTenantId(event)).toBe('tenant-123');
    });

    it('extracts tenant ID from X-Tenant-Id header', () => {
      const event = {
        headers: { 'X-Tenant-Id': 'tenant-456' },
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      expect(extractTenantId(event)).toBe('tenant-456');
    });

    it('extracts tenant ID from authorizer context', () => {
      const event = {
        headers: {},
        requestContext: {
          authorizer: { tenantId: 'tenant-789' },
        },
      } as unknown as APIGatewayProxyEvent;

      expect(extractTenantId(event)).toBe('tenant-789');
    });

    it('returns null when no tenant ID is available', () => {
      const event = {
        headers: {},
        requestContext: {},
      } as unknown as APIGatewayProxyEvent;

      expect(extractTenantId(event)).toBeNull();
    });

    it('prefers header over authorizer context', () => {
      const event = {
        headers: { 'x-tenant-id': 'header-tenant' },
        requestContext: {
          authorizer: { tenantId: 'auth-tenant' },
        },
      } as unknown as APIGatewayProxyEvent;

      expect(extractTenantId(event)).toBe('header-tenant');
    });
  });

  describe('successResponse', () => {
    it('returns structured success response with CORS headers', () => {
      const result = successResponse(200, { id: '123' }, 'req-1');
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(200);
      expect(result.headers).toEqual(CORS_HEADERS);
      expect(body.data).toEqual({ id: '123' });
      expect(body.metadata.requestId).toBe('req-1');
      expect(body.metadata.version).toBe('v1');
      expect(body.metadata.timestamp).toBeDefined();
    });

    it('supports different status codes', () => {
      const result = successResponse(201, { created: true }, 'req-2');
      expect(result.statusCode).toBe(201);
    });
  });

  describe('errorResponse', () => {
    it('returns structured error response with CORS headers', () => {
      const result = errorResponse(400, 'VALIDATION_ERROR', 'Invalid input', 'req-3');
      const body = JSON.parse(result.body);

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual(CORS_HEADERS);
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('Invalid input');
      expect(body.requestId).toBe('req-3');
      expect(body.timestamp).toBeDefined();
    });
  });
});

describe('determineHealthStatus', () => {
  it('returns "unknown" when there is no throughput', () => {
    expect(determineHealthStatus(0, 0)).toBe('unknown');
  });

  it('returns "healthy" when error rate is 0', () => {
    expect(determineHealthStatus(0, 100)).toBe('healthy');
  });

  it('returns "healthy" when error rate is below 1%', () => {
    expect(determineHealthStatus(0.005, 200)).toBe('healthy');
  });

  it('returns "healthy" when error rate is exactly 1%', () => {
    expect(determineHealthStatus(0.01, 100)).toBe('healthy');
  });

  it('returns "degraded" when error rate is between 1% and 5%', () => {
    expect(determineHealthStatus(0.03, 100)).toBe('degraded');
  });

  it('returns "degraded" when error rate is exactly 5%', () => {
    expect(determineHealthStatus(0.05, 100)).toBe('degraded');
  });

  it('returns "unhealthy" when error rate exceeds 5%', () => {
    expect(determineHealthStatus(0.1, 100)).toBe('unhealthy');
  });

  it('returns "unhealthy" when error rate is 100%', () => {
    expect(determineHealthStatus(1.0, 50)).toBe('unhealthy');
  });
});
