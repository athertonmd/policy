/**
 * Sabre API configuration and credentials management.
 * Supports both production and certification (sandbox) environments.
 */

export interface SabreConfig {
  /** Sabre environment: 'production' or 'cert' (sandbox) */
  environment: 'production' | 'cert';
  /** OAuth2 client ID (from Sabre Dev Studio) */
  clientId: string;
  /** OAuth2 client secret (from Sabre Dev Studio) */
  clientSecret: string;
  /** Pseudo City Code (PCC) */
  pcc: string;
  /** Policy Decision API base URL */
  policyApiBaseUrl: string;
  /** Policy Decision API key */
  policyApiKey: string;
  /** Tenant ID for policy evaluation */
  tenantId: string;
  /** Booking ingestion webhook URL (our platform) */
  bookingIngestionWebhookUrl: string;
  /** Webhook signing secret for validating Sabre notifications */
  webhookSigningSecret: string;
  /** Request timeout in milliseconds (default: 10000) */
  requestTimeoutMs?: number;
  /** Maximum time budget for search-time policy evaluation (default: 2000ms) */
  searchPolicyBudgetMs?: number;
}

const SABRE_BASE_URLS = {
  production: 'https://api.havail.sabre.com',
  cert: 'https://api-crt.cert.havail.sabre.com',
} as const;

const SABRE_TOKEN_PATHS = {
  production: '/v2/auth/token',
  cert: '/v2/auth/token',
} as const;

/**
 * Load configuration from environment variables.
 * Throws if required variables are missing.
 */
export function loadConfigFromEnv(): SabreConfig {
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  };

  const optional = (key: string, defaultValue: string): string => {
    return process.env[key] ?? defaultValue;
  };

  return {
    environment: (optional('SABRE_ENVIRONMENT', 'cert') as 'production' | 'cert'),
    clientId: required('SABRE_CLIENT_ID'),
    clientSecret: required('SABRE_CLIENT_SECRET'),
    pcc: required('SABRE_PCC'),
    policyApiBaseUrl: required('POLICY_API_BASE_URL'),
    policyApiKey: required('POLICY_API_KEY'),
    tenantId: required('TENANT_ID'),
    bookingIngestionWebhookUrl: required('BOOKING_INGESTION_WEBHOOK_URL'),
    webhookSigningSecret: required('WEBHOOK_SIGNING_SECRET'),
    requestTimeoutMs: parseInt(optional('SABRE_REQUEST_TIMEOUT_MS', '10000'), 10),
    searchPolicyBudgetMs: parseInt(optional('SEARCH_POLICY_BUDGET_MS', '2000'), 10),
  };
}

/**
 * Get the Sabre API base URL for the configured environment.
 */
export function getSabreBaseUrl(config: SabreConfig): string {
  return SABRE_BASE_URLS[config.environment];
}

/**
 * Get the Sabre token endpoint URL for the configured environment.
 */
export function getSabreTokenUrl(config: SabreConfig): string {
  return `${SABRE_BASE_URLS[config.environment]}${SABRE_TOKEN_PATHS[config.environment]}`;
}
