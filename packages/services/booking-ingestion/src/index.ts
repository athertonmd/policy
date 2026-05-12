/**
 * Booking Ingestion Service
 * Receives, validates, deduplicates, and processes webhook events from external booking systems.
 */
export { handler as receiveWebhookHandler } from './handlers/receive-webhook.js';
export { handler as processWebhookHandler } from './handlers/process-webhook.js';
export { handler as configureIntegrationHandler } from './handlers/configure-integration.js';
export { handler as testIntegrationHandler } from './handlers/test-integration.js';
export { handler as getIntegrationHealthHandler } from './handlers/get-integration-health.js';
export { validateSignature } from './lib/signature-validator.js';
export { checkIdempotency, recordIdempotency } from './lib/idempotency.js';
export { mapPayload, extractField, PayloadMappingError } from './lib/payload-mapper.js';
export type { PayloadMappingConfig } from './lib/payload-mapper.js';
export {
  BaseConnector,
  OBTConnector,
  GDSConnector,
  ConnectorRegistry,
  createConnectorRegistry,
  DEFAULT_RETRY_CONFIG,
} from './lib/integration-framework.js';
export type {
  IntegrationAdapter,
  IntegrationConfig,
  IntegrationResult,
  ConnectorHealth,
  RetryConfig,
  AuthConfig,
  ProtocolConfig,
  PayloadMapping,
} from './lib/integration-framework.js';
export {
  createDatabaseClient,
  getDatabaseCredentials,
  withDatabase,
} from './lib/database.js';
export type { DatabaseClient, DatabaseCredentials, QueryResult } from './lib/database.js';
