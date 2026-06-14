/**
 * Lambda handler: Run database migration.
 * Creates the schema and tables needed for the policy configuration service.
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import pg from 'pg';

const { Client } = pg;

const secretsClient = new SecretsManagerClient({});

async function getDbCredentials() {
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) throw new Error('DB_SECRET_ARN not set');

  const response = await secretsClient.send(new GetSecretValueCommand({ SecretId: secretArn }));
  return JSON.parse(response.SecretString || '{}');
}

const MIGRATION_SQL = `
-- Create tenant schema (default tenant for testing)
CREATE SCHEMA IF NOT EXISTS tenant_tenant_001;

-- Policy rules table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.policy_rules (
  rule_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-001',
  name TEXT NOT NULL,
  description TEXT,
  dsl_source TEXT NOT NULL,
  policy_graph TEXT,
  compiled_rego TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'draft',
  conditions TEXT NOT NULL DEFAULT '{}',
  outcomes TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  category TEXT,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Policy rule versions table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.policy_rule_versions (
  version_id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  dsl_source TEXT NOT NULL,
  policy_graph TEXT,
  compiled_rego TEXT,
  change_description TEXT,
  changed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(rule_id, version)
);

-- Approval workflow templates table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.workflow_templates (
  template_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-001',
  name TEXT NOT NULL,
  description TEXT,
  stages_json TEXT NOT NULL,
  escalation_rules_json TEXT NOT NULL,
  auto_approval_conditions_json TEXT,
  sla_config_json TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval workflows (instances) table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.approval_workflows (
  workflow_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-001',
  template_id TEXT,
  booking_reference TEXT,
  traveller_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  current_stage INTEGER NOT NULL DEFAULT 1,
  request_data_json TEXT NOT NULL,
  policy_decision_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  due_by TIMESTAMPTZ
);

-- Approval actions table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.approval_actions (
  action_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  stage_number INTEGER NOT NULL,
  approver_id TEXT NOT NULL,
  action TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Traveller profiles table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.traveller_profiles (
  profile_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-001',
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  department TEXT,
  job_title TEXT,
  cost_centre TEXT,
  grade TEXT DEFAULT 'Standard',
  manager_id TEXT,
  location_json TEXT,
  preferences_json TEXT,
  loyalty_programmes_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delegations table
CREATE TABLE IF NOT EXISTS tenant_tenant_001.delegations (
  delegation_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant-001',
  delegator_id TEXT NOT NULL,
  delegate_id TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant ON tenant_tenant_001.policy_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_rules_active ON tenant_tenant_001.policy_rules(status);
CREATE INDEX IF NOT EXISTS idx_rule_versions_rule ON tenant_tenant_001.policy_rule_versions(rule_id);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON tenant_tenant_001.approval_workflows(status);
CREATE INDEX IF NOT EXISTS idx_workflows_traveller ON tenant_tenant_001.approval_workflows(traveller_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON tenant_tenant_001.traveller_profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_department ON tenant_tenant_001.traveller_profiles(department);
`;

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  try {
    const credentials = await getDbCredentials();

    const client = new Client({
      host: credentials.host,
      port: credentials.port,
      database: credentials.dbname || 'travel_policy',
      user: credentials.username,
      password: credentials.password,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();
    await client.query(MIGRATION_SQL);
    await client.end();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Migration completed successfully', tables: ['policy_rules', 'policy_rule_versions', 'workflow_templates', 'approval_workflows', 'approval_actions', 'traveller_profiles', 'delegations'] }),
    };
  } catch (error) {
    console.error('Migration failed:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Migration failed' }),
    };
  }
}
