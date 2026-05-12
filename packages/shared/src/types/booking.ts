/**
 * Booking Ingestion types
 */

export interface WebhookRequest {
  integrationId: string;
  signature: string;
  timestamp: string;
  idempotencyKey: string;
  payload: unknown;
}

export interface WebhookAcknowledgement {
  acknowledged: boolean;
  eventId: string;
  receivedAt: string;
}

export interface IntegrationConfig {
  tenantId: string;
  sourceType: IntegrationSourceType;
  sourceName: string;
  authConfig: WebhookAuthConfig;
  payloadMapping: PayloadMappingConfig;
  retryPolicy: RetryPolicy;
}

export type IntegrationSourceType = 'obt' | 'gds' | 'tmc';

export interface WebhookAuthConfig {
  type: 'hmac' | 'api_key' | 'oauth2';
  secret?: string;
  headerName?: string;
  algorithm?: string;
}

export interface PayloadMappingConfig {
  format: 'json' | 'xml';
  mappingRules: MappingRule[];
}

export interface MappingRule {
  sourceField: string;
  targetField: string;
  transform?: string;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
}

export interface Integration {
  integrationId: string;
  tenantId: string;
  sourceType: IntegrationSourceType;
  sourceName: string;
  status: IntegrationStatus;
  lastHealthCheck?: string;
  healthStatus: IntegrationHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export type IntegrationStatus = 'active' | 'inactive' | 'error';

export type IntegrationHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface IntegrationTestResult {
  success: boolean;
  responseTimeMs: number;
  message?: string;
  testedAt: string;
}

export interface IntegrationHealth {
  integrationId: string;
  status: IntegrationHealthStatus;
  lastSuccessfulEvent?: string;
  lastFailedEvent?: string;
  eventsProcessed24h: number;
  errorRate24h: number;
}
