-- Migration: 001_create_platform_schema
-- Description: Creates the platform schema and tenants table for multi-tenant management
-- Date: 2024-01-01

CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE platform.tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_name VARCHAR(255) NOT NULL,
    data_residency_region VARCHAR(10) NOT NULL CHECK (data_residency_region IN ('uk', 'eu', 'us', 'anz')),
    status VARCHAR(20) NOT NULL DEFAULT 'provisioning',
    schema_name VARCHAR(63) NOT NULL UNIQUE,
    kms_key_arn VARCHAR(512) NOT NULL,
    cognito_user_pool_id VARCHAR(255),
    plan VARCHAR(20) NOT NULL DEFAULT 'standard',
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decommissioned_at TIMESTAMPTZ
);

-- Index for looking up tenants by status (e.g., active tenants)
CREATE INDEX idx_tenants_status ON platform.tenants (status);

-- Index for looking up tenants by data residency region
CREATE INDEX idx_tenants_region ON platform.tenants (data_residency_region);

-- Trigger to auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION platform.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON platform.tenants
    FOR EACH ROW
    EXECUTE FUNCTION platform.update_updated_at();
