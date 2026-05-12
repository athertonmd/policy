import { Environment } from 'aws-cdk-lib';

/**
 * Platform deployment regions mapped to AWS regions.
 * Each region operates independently with tenant data pinned to the configured region.
 */
export type PlatformRegion = 'uk' | 'eu' | 'us' | 'anz';

export interface PlatformEnvironmentConfig {
  /** Human-readable region label */
  readonly label: string;
  /** AWS CDK environment (account + region) */
  readonly env: Environment;
  /** Platform region identifier */
  readonly platformRegion: PlatformRegion;
  /** Domain prefix for this region (e.g., uk.travel-policy.example.com) */
  readonly domainPrefix: string;
  /** Whether this is the primary region (hosts global resources like CloudFront) */
  readonly isPrimary: boolean;
}

/**
 * Platform-wide configuration shared across all environments.
 */
export interface PlatformConfig {
  /** Root domain for the platform */
  readonly rootDomain: string;
  /** Platform name used for resource naming */
  readonly platformName: string;
  /** AWS account ID (all regions deploy to the same account) */
  readonly accountId: string;
}

/**
 * Returns the platform-wide configuration.
 * Account ID is resolved from CDK context or environment variable.
 */
export function getPlatformConfig(): PlatformConfig {
  return {
    rootDomain: process.env.PLATFORM_DOMAIN ?? 'travel-policy.example.com',
    platformName: 'travel-policy-platform',
    accountId: process.env.CDK_DEFAULT_ACCOUNT ?? '123456789012',
  };
}

/**
 * Returns environment configurations for all platform regions.
 */
export function getEnvironments(): Record<PlatformRegion, PlatformEnvironmentConfig> {
  const config = getPlatformConfig();

  return {
    uk: {
      label: 'United Kingdom',
      env: { account: config.accountId, region: 'eu-west-2' },
      platformRegion: 'uk',
      domainPrefix: 'uk',
      isPrimary: true,
    },
    eu: {
      label: 'European Union',
      env: { account: config.accountId, region: 'eu-central-1' },
      platformRegion: 'eu',
      domainPrefix: 'eu',
      isPrimary: false,
    },
    us: {
      label: 'United States',
      env: { account: config.accountId, region: 'us-east-1' },
      platformRegion: 'us',
      domainPrefix: 'us',
      isPrimary: false,
    },
    anz: {
      label: 'Australia / New Zealand',
      env: { account: config.accountId, region: 'ap-southeast-2' },
      platformRegion: 'anz',
      domainPrefix: 'anz',
      isPrimary: false,
    },
  };
}
