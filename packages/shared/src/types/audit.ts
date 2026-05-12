/**
 * Audit Service types
 */

export interface AuditEvent {
  tenantId: string;
  userId: string;
  actionType: AuditActionType;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'failure' | 'denied';
  sourceIp: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
}

export type AuditActionType =
  | 'policy_decision'
  | 'approval_action'
  | 'config_change'
  | 'authentication'
  | 'data_access'
  | 'user_provisioning'
  | 'policy_override'
  | 'data_export';

export interface AuditEntry {
  eventId: string;
  tenantId: string;
  timestamp: string;
  userId: string;
  actionType: AuditActionType;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'failure' | 'denied';
  sourceIp: string;
  correlationId: string;
  metadata?: Record<string, unknown>;
  integrityHash: string;
  previousHash: string;
}

export interface AuditQuery {
  tenantId: string;
  fromDate: string;
  toDate: string;
  actionType?: AuditActionType;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
  nextToken?: string;
}

export interface AuditExportRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  format: 'json' | 'csv';
  filters?: Partial<AuditQuery>;
}

export interface ExportJob {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  downloadUrl?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface IntegrityReport {
  tenantId: string;
  fromDate: string;
  toDate: string;
  totalEntries: number;
  validEntries: number;
  invalidEntries: number;
  brokenChainAt?: string;
  verifiedAt: string;
}
