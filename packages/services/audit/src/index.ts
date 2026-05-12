/**
 * Audit Service
 * Immutable, tamper-evident audit logging with cryptographic integrity.
 */

export { handler as recordEventHandler } from './handlers/record-event.js';
export { recordAuditEvent, calculateTTL } from './handlers/record-event.js';
export { handler as eventbridgeAuditConsumerHandler } from './handlers/eventbridge-audit-consumer.js';
export { handler as queryLogsHandler, queryLogs } from './handlers/query-logs.js';
export { handler as exportLogsHandler, exportLogs, entriesToCsv } from './handlers/export-logs.js';
export { handler as verifyIntegrityHandler, verifyIntegrity, verifyHashChain, serializeEventData } from './handlers/verify-integrity.js';
export { handler as dataRetentionHandler } from './handlers/data-retention.js';
export type {
  RetentionPolicy,
  TenantDataConfig,
  PurgeResult,
  RetentionRunSummary,
  DataCategory,
  DataRegion,
} from './handlers/data-retention.js';
export { calculateIntegrityHash, getLatestHash, GENESIS_HASH } from './lib/hash-chain.js';
export { writeAuditEntry, getLatestEntry, queryByTimeRange } from './lib/audit-repository.js';
