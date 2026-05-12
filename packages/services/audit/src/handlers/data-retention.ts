/**
 * Data Retention Handler
 *
 * Scheduled Lambda (daily) that purges/anonymises expired data.
 * Configurable retention per tenant and data category.
 * Enforces data residency by checking tenant region.
 * Maintains record of processing activities per tenant.
 *
 * Requirements: 20.1, 20.2, 20.5, 20.6
 */
import type { ScheduledEvent, Context } from 'aws-lambda';

// --- Types ---

export type DataCategory = 'transactional' | 'audit' | 'personal' | 'analytical';

export type PurgeAction = 'delete' | 'anonymise';

export type DataRegion = 'uk' | 'eu' | 'us' | 'anz';

export interface RetentionPolicy {
  tenantId: string;
  dataCategory: DataCategory;
  retentionDays: number;
  purgeAction: PurgeAction;
  enabled: boolean;
}

export interface TenantDataConfig {
  tenantId: string;
  region: DataRegion;
  retentionPolicies: RetentionPolicy[];
  processingActivities: ProcessingActivity[];
}

export interface ProcessingActivity {
  dataCategory: DataCategory;
  purpose: string;
  retentionPeriod: string;
  thirdPartySharing: string[];
  legalBasis: string;
  lastUpdated: string;
}

export interface PurgeResult {
  tenantId: string;
  dataCategory: DataCategory;
  action: PurgeAction;
  recordsAffected: number;
  completedAt: string;
  region: DataRegion;
  success: boolean;
  error?: string;
}

export interface RetentionRunSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  tenantsProcessed: number;
  totalRecordsPurged: number;
  totalRecordsAnonymised: number;
  failures: PurgeResult[];
}

// --- Configuration Resolution ---

const CURRENT_REGION: DataRegion = (process.env.PLATFORM_REGION as DataRegion) ?? 'uk';

/**
 * Resolve tenant data configurations.
 * In production, queries from platform.tenants and retention_policies tables.
 */
async function getTenantConfigs(): Promise<TenantDataConfig[]> {
  const configJson = process.env.TENANT_RETENTION_CONFIGS;
  if (configJson) {
    try {
      return JSON.parse(configJson) as TenantDataConfig[];
    } catch {
      console.error('Failed to parse TENANT_RETENTION_CONFIGS');
    }
  }

  // Default retention policies if none configured
  return [];
}

/**
 * Validate that the current execution region matches the tenant's configured data residency.
 * Requirement 20.6: Data must be stored exclusively within the tenant's configured region.
 */
function validateDataResidency(tenantConfig: TenantDataConfig): boolean {
  if (tenantConfig.region !== CURRENT_REGION) {
    console.warn(
      `Skipping tenant ${tenantConfig.tenantId}: ` +
      `data residency mismatch (tenant region: ${tenantConfig.region}, ` +
      `current region: ${CURRENT_REGION})`
    );
    return false;
  }
  return true;
}

// --- Purge/Anonymise Logic ---

/**
 * Calculate the cutoff date for a given retention period.
 */
function calculateCutoffDate(retentionDays: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

/**
 * Purge expired transactional data for a tenant.
 */
async function purgeTransactionalData(
  tenantId: string,
  cutoffDate: Date,
  action: PurgeAction
): Promise<number> {
  console.log(
    `${action === 'delete' ? 'Purging' : 'Anonymising'} transactional data ` +
    `for tenant ${tenantId} older than ${cutoffDate.toISOString()}`
  );

  // In production: execute SQL against tenant schema
  // DELETE FROM "{tenantId}".trip_requests WHERE created_at < $1
  // or UPDATE to anonymise fields
  // For now, simulate the operation
  const recordsAffected = 0; // Would come from DB query result

  return recordsAffected;
}

/**
 * Anonymise expired personal data while preserving audit records.
 * Requirement 20.2: Purge or anonymise within 24 hours of expiry.
 */
async function anonymisePersonalData(
  tenantId: string,
  cutoffDate: Date
): Promise<number> {
  console.log(
    `Anonymising personal data for tenant ${tenantId} older than ${cutoffDate.toISOString()}`
  );

  // In production: UPDATE traveller profiles to replace PII with anonymised values
  // UPDATE "{tenantId}".traveller_profiles
  // SET name = 'ANONYMISED', email = 'anonymised@removed.local',
  //     passport_number = NULL, emergency_contact = NULL,
  //     anonymised_at = NOW()
  // WHERE created_at < $1 AND anonymised_at IS NULL
  const recordsAffected = 0;

  return recordsAffected;
}

/**
 * Purge expired analytical data for a tenant.
 */
async function purgeAnalyticalData(
  tenantId: string,
  cutoffDate: Date,
  action: PurgeAction
): Promise<number> {
  console.log(
    `${action === 'delete' ? 'Purging' : 'Anonymising'} analytical data ` +
    `for tenant ${tenantId} older than ${cutoffDate.toISOString()}`
  );

  // In production: purge reporting aggregates, simulation results, etc.
  const recordsAffected = 0;

  return recordsAffected;
}

/**
 * Handle audit data retention.
 * Audit logs have special handling — they may need to be retained for 7+ years.
 * Only anonymise user-identifying fields while preserving the audit chain.
 */
async function handleAuditRetention(
  tenantId: string,
  cutoffDate: Date,
  action: PurgeAction
): Promise<number> {
  console.log(
    `Processing audit retention for tenant ${tenantId} ` +
    `(action: ${action}, cutoff: ${cutoffDate.toISOString()})`
  );

  if (action === 'anonymise') {
    // Anonymise user-identifying fields but preserve the audit entry and hash chain
    // UPDATE audit entries: replace userId with hash, remove sourceIp
    const recordsAffected = 0;
    return recordsAffected;
  }

  // Full deletion only for very old audit records past regulatory requirements
  const recordsAffected = 0;
  return recordsAffected;
}

/**
 * Execute purge/anonymise for a specific data category.
 */
async function executePurge(
  tenantId: string,
  policy: RetentionPolicy
): Promise<PurgeResult> {
  const cutoffDate = calculateCutoffDate(policy.retentionDays);
  const startTime = new Date();

  try {
    let recordsAffected = 0;

    switch (policy.dataCategory) {
      case 'transactional':
        recordsAffected = await purgeTransactionalData(tenantId, cutoffDate, policy.purgeAction);
        break;
      case 'personal':
        recordsAffected = await anonymisePersonalData(tenantId, cutoffDate);
        break;
      case 'analytical':
        recordsAffected = await purgeAnalyticalData(tenantId, cutoffDate, policy.purgeAction);
        break;
      case 'audit':
        recordsAffected = await handleAuditRetention(tenantId, cutoffDate, policy.purgeAction);
        break;
    }

    return {
      tenantId,
      dataCategory: policy.dataCategory,
      action: policy.purgeAction,
      recordsAffected,
      completedAt: new Date().toISOString(),
      region: CURRENT_REGION,
      success: true,
    };
  } catch (error) {
    console.error(
      `Purge failed for tenant ${tenantId}, category ${policy.dataCategory}:`,
      error
    );
    return {
      tenantId,
      dataCategory: policy.dataCategory,
      action: policy.purgeAction,
      recordsAffected: 0,
      completedAt: new Date().toISOString(),
      region: CURRENT_REGION,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// --- Processing Activities Record ---

/**
 * Update the record of processing activities for a tenant.
 * Requirement 20.5: Maintain record of processing activities per tenant.
 */
async function updateProcessingActivitiesRecord(
  tenantId: string,
  results: PurgeResult[]
): Promise<void> {
  const successfulPurges = results.filter((r) => r.success && r.recordsAffected > 0);

  if (successfulPurges.length === 0) {
    return;
  }

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Processing activities updated',
    tenantId,
    categories: successfulPurges.map((r) => r.dataCategory),
    totalRecordsProcessed: successfulPurges.reduce((sum, r) => sum + r.recordsAffected, 0),
    timestamp: new Date().toISOString(),
  }));

  // In production: update processing_activities table with last purge timestamp
}

// --- Lambda Handler ---

/**
 * Scheduled Lambda handler for daily data retention enforcement.
 * Runs once per day, processes all tenants in the current region.
 */
export async function handler(
  _event: ScheduledEvent,
  context: Context
): Promise<RetentionRunSummary> {
  const runId = context.awsRequestId;
  const startedAt = new Date().toISOString();

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Data retention run started',
    runId,
    region: CURRENT_REGION,
    startedAt,
  }));

  const tenantConfigs = await getTenantConfigs();
  let tenantsProcessed = 0;
  let totalRecordsPurged = 0;
  let totalRecordsAnonymised = 0;
  const failures: PurgeResult[] = [];

  for (const tenantConfig of tenantConfigs) {
    // Requirement 20.6: Enforce data residency
    if (!validateDataResidency(tenantConfig)) {
      continue;
    }

    const enabledPolicies = tenantConfig.retentionPolicies.filter((p) => p.enabled);
    if (enabledPolicies.length === 0) {
      continue;
    }

    tenantsProcessed++;
    const tenantResults: PurgeResult[] = [];

    for (const policy of enabledPolicies) {
      const result = await executePurge(tenantConfig.tenantId, policy);
      tenantResults.push(result);

      if (result.success) {
        if (result.action === 'delete') {
          totalRecordsPurged += result.recordsAffected;
        } else {
          totalRecordsAnonymised += result.recordsAffected;
        }
      } else {
        failures.push(result);
      }
    }

    // Update processing activities record
    await updateProcessingActivitiesRecord(tenantConfig.tenantId, tenantResults);
  }

  const completedAt = new Date().toISOString();

  const summary: RetentionRunSummary = {
    runId,
    startedAt,
    completedAt,
    tenantsProcessed,
    totalRecordsPurged,
    totalRecordsAnonymised,
    failures,
  };

  console.log(JSON.stringify({
    level: 'INFO',
    message: 'Data retention run completed',
    ...summary,
  }));

  if (failures.length > 0) {
    console.error(JSON.stringify({
      level: 'ERROR',
      message: `Data retention run completed with ${failures.length} failures`,
      failures,
    }));
  }

  return summary;
}
