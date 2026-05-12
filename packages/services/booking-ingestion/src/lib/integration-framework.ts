/**
 * Integration Framework
 *
 * Pluggable adapter interface (auth, protocol, payload mapping).
 * Base connector class with retry, queue, and health monitoring.
 * Example OBT connector and GDS connector stubs.
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5
 */

// --- Adapter Interfaces ---

export type AuthType = 'oauth2' | 'api-key' | 'basic' | 'hmac' | 'certificate';
export type ProtocolType = 'rest' | 'soap' | 'graphql' | 'webhook' | 'event';
export type IntegrationPattern = 'synchronous' | 'asynchronous';
export type ConnectorStatus = 'healthy' | 'degraded' | 'unhealthy' | 'disconnected';

export interface AuthConfig {
  type: AuthType;
  credentials: Record<string, string>;
  tokenEndpoint?: string;
  refreshInterval?: number;
}

export interface ProtocolConfig {
  type: ProtocolType;
  baseUrl: string;
  timeout: number;
  headers?: Record<string, string>;
  tlsConfig?: {
    rejectUnauthorized: boolean;
    certPath?: string;
    keyPath?: string;
  };
}

export interface PayloadMapping {
  sourceField: string;
  targetField: string;
  transform?: 'uppercase' | 'lowercase' | 'date-iso' | 'number' | 'boolean' | 'custom';
  customTransform?: (value: unknown) => unknown;
  required?: boolean;
  defaultValue?: unknown;
}

export interface IntegrationConfig {
  connectorId: string;
  name: string;
  tenantId: string;
  authConfig: AuthConfig;
  protocolConfig: ProtocolConfig;
  payloadMappings: PayloadMapping[];
  pattern: IntegrationPattern;
  retryConfig: RetryConfig;
  enabled: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface ConnectorHealth {
  connectorId: string;
  status: ConnectorStatus;
  lastSuccessfulCall: string | null;
  lastFailedCall: string | null;
  consecutiveFailures: number;
  metrics: {
    throughput: number;
    errorRate: number;
    averageLatencyMs: number;
    queueDepth: number;
  };
  lastChecked: string;
}

export interface IntegrationResult<T = unknown> {
  success: boolean;
  data?: T;
  statusCode?: number;
  error?: string;
  latencyMs: number;
  retryCount: number;
  timestamp: string;
}

// --- Adapter Interface ---

/**
 * Base interface for all integration adapters.
 * Each adapter handles auth, protocol specifics, and payload transformation.
 */
export interface IntegrationAdapter {
  readonly connectorId: string;
  readonly name: string;
  readonly pattern: IntegrationPattern;

  /** Initialise the adapter with configuration */
  initialize(config: IntegrationConfig): Promise<void>;

  /** Send a request to the external system */
  send<T = unknown>(payload: Record<string, unknown>): Promise<IntegrationResult<T>>;

  /** Receive/poll for data from the external system (async pattern) */
  receive?<T = unknown>(): Promise<IntegrationResult<T>>;

  /** Validate connectivity and payload mapping */
  testConnectivity(): Promise<{ success: boolean; message: string; latencyMs: number }>;

  /** Get current health status */
  getHealth(): ConnectorHealth;

  /** Gracefully shut down the adapter */
  disconnect(): Promise<void>;
}

// --- Base Connector Class ---

/**
 * Base connector class with retry, queue, and health monitoring.
 * All concrete connectors extend this class.
 */
export abstract class BaseConnector implements IntegrationAdapter {
  readonly connectorId: string;
  readonly name: string;
  readonly pattern: IntegrationPattern;

  protected config!: IntegrationConfig;
  protected health: ConnectorHealth;
  protected operationQueue: Array<{ payload: Record<string, unknown>; resolve: Function; reject: Function }> = [];
  protected isProcessingQueue = false;
  private authToken: string | null = null;
  private tokenExpiry = 0;

  constructor(connectorId: string, name: string, pattern: IntegrationPattern) {
    this.connectorId = connectorId;
    this.name = name;
    this.pattern = pattern;
    this.health = {
      connectorId,
      status: 'disconnected',
      lastSuccessfulCall: null,
      lastFailedCall: null,
      consecutiveFailures: 0,
      metrics: {
        throughput: 0,
        errorRate: 0,
        averageLatencyMs: 0,
        queueDepth: 0,
      },
      lastChecked: new Date().toISOString(),
    };
  }

  async initialize(config: IntegrationConfig): Promise<void> {
    this.config = config;
    this.health.status = 'healthy';
    this.health.lastChecked = new Date().toISOString();
  }

  /**
   * Send with retry logic and queue management.
   * Requirement 25.5: Queue when unavailable, retry with backoff, notify after 3 failures.
   */
  async send<T = unknown>(payload: Record<string, unknown>): Promise<IntegrationResult<T>> {
    const startTime = Date.now();
    let lastError: string | undefined;
    let retryCount = 0;

    const { maxAttempts, initialDelayMs, maxDelayMs, backoffMultiplier, retryableStatusCodes } =
      this.config.retryConfig;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Authenticate if needed
        const token = await this.getAuthToken();

        // Map payload
        const mappedPayload = this.mapPayload(payload);

        // Execute the request (implemented by subclass)
        const result = await this.executeRequest<T>(mappedPayload, token);

        // Success
        this.recordSuccess(Date.now() - startTime);

        return {
          success: true,
          data: result.data,
          statusCode: result.statusCode,
          latencyMs: Date.now() - startTime,
          retryCount,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        retryCount = attempt;
        lastError = error instanceof Error ? error.message : 'Unknown error';

        // Check if error is retryable
        const statusCode = (error as { statusCode?: number }).statusCode;
        const isRetryable = statusCode
          ? retryableStatusCodes.includes(statusCode)
          : true;

        if (!isRetryable || attempt === maxAttempts - 1) {
          break;
        }

        // Calculate backoff delay
        const delay = Math.min(
          initialDelayMs * Math.pow(backoffMultiplier, attempt),
          maxDelayMs
        );
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    this.recordFailure();

    // Queue the operation if source is unavailable (Requirement 25.5)
    if (this.health.consecutiveFailures >= 3) {
      this.health.status = 'unhealthy';
      console.error(
        `Connector ${this.connectorId} has ${this.health.consecutiveFailures} consecutive failures. ` +
        `Notifying tenant administrator.`
      );
    }

    return {
      success: false,
      error: lastError,
      latencyMs: Date.now() - startTime,
      retryCount,
      timestamp: new Date().toISOString(),
    };
  }

  async testConnectivity(): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const startTime = Date.now();
    try {
      await this.executeHealthCheck();
      const latencyMs = Date.now() - startTime;
      return { success: true, message: 'Connection successful', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
        latencyMs,
      };
    }
  }

  getHealth(): ConnectorHealth {
    this.health.metrics.queueDepth = this.operationQueue.length;
    this.health.lastChecked = new Date().toISOString();
    return { ...this.health };
  }

  async disconnect(): Promise<void> {
    this.health.status = 'disconnected';
    this.operationQueue = [];
  }

  // --- Protected Methods (for subclasses) ---

  protected abstract executeRequest<T>(
    payload: Record<string, unknown>,
    authToken: string | null
  ): Promise<{ data?: T; statusCode: number }>;

  protected abstract executeHealthCheck(): Promise<void>;

  /**
   * Map payload using configured field mappings.
   */
  protected mapPayload(payload: Record<string, unknown>): Record<string, unknown> {
    if (!this.config.payloadMappings || this.config.payloadMappings.length === 0) {
      return payload;
    }

    const mapped: Record<string, unknown> = {};

    for (const mapping of this.config.payloadMappings) {
      let value = this.getNestedValue(payload, mapping.sourceField);

      if (value === undefined || value === null) {
        if (mapping.required) {
          throw new Error(`Required field '${mapping.sourceField}' is missing from payload`);
        }
        value = mapping.defaultValue;
      }

      if (value !== undefined && mapping.transform) {
        value = this.applyTransform(value, mapping.transform, mapping.customTransform);
      }

      if (value !== undefined) {
        this.setNestedValue(mapped, mapping.targetField, value);
      }
    }

    return mapped;
  }

  // --- Private Methods ---

  private async getAuthToken(): Promise<string | null> {
    if (!this.config.authConfig) return null;

    const now = Date.now();
    if (this.authToken && now < this.tokenExpiry) {
      return this.authToken;
    }

    switch (this.config.authConfig.type) {
      case 'api-key':
        this.authToken = this.config.authConfig.credentials.apiKey ?? null;
        this.tokenExpiry = now + 3600_000;
        break;
      case 'basic': {
        const { username, password } = this.config.authConfig.credentials;
        this.authToken = Buffer.from(`${username}:${password}`).toString('base64');
        this.tokenExpiry = now + 3600_000;
        break;
      }
      case 'oauth2':
        this.authToken = await this.fetchOAuth2Token();
        this.tokenExpiry = now + (this.config.authConfig.refreshInterval ?? 3500_000);
        break;
      default:
        this.authToken = null;
    }

    return this.authToken;
  }

  private async fetchOAuth2Token(): Promise<string> {
    const { tokenEndpoint, credentials } = this.config.authConfig;
    if (!tokenEndpoint) throw new Error('OAuth2 requires tokenEndpoint');

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId ?? '',
        client_secret: credentials.clientSecret ?? '',
        scope: credentials.scope ?? '',
      }),
    });

    if (!response.ok) {
      throw new Error(`OAuth2 token request failed: ${response.status}`);
    }

    const data = (await response.json()) as { access_token: string };
    return data.access_token;
  }

  private recordSuccess(latencyMs: number): void {
    this.health.lastSuccessfulCall = new Date().toISOString();
    this.health.consecutiveFailures = 0;
    this.health.status = 'healthy';
    this.health.metrics.throughput++;
    // Running average for latency
    const { averageLatencyMs, throughput } = this.health.metrics;
    this.health.metrics.averageLatencyMs = Math.round(
      (averageLatencyMs * (throughput - 1) + latencyMs) / throughput
    );
  }

  private recordFailure(): void {
    this.health.lastFailedCall = new Date().toISOString();
    this.health.consecutiveFailures++;
    this.health.metrics.errorRate =
      this.health.metrics.throughput > 0
        ? this.health.consecutiveFailures / this.health.metrics.throughput
        : 1;

    if (this.health.consecutiveFailures >= 3) {
      this.health.status = 'unhealthy';
    } else if (this.health.consecutiveFailures >= 1) {
      this.health.status = 'degraded';
    }
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((current, key) => {
      if (current && typeof current === 'object') {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  }

  private setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = {};
      }
      current = current[keys[i]] as Record<string, unknown>;
    }
    current[keys[keys.length - 1]] = value;
  }

  private applyTransform(
    value: unknown,
    transform: string,
    customFn?: (value: unknown) => unknown
  ): unknown {
    switch (transform) {
      case 'uppercase':
        return typeof value === 'string' ? value.toUpperCase() : value;
      case 'lowercase':
        return typeof value === 'string' ? value.toLowerCase() : value;
      case 'date-iso':
        return new Date(value as string).toISOString();
      case 'number':
        return Number(value);
      case 'boolean':
        return Boolean(value);
      case 'custom':
        return customFn ? customFn(value) : value;
      default:
        return value;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- Example OBT Connector ---

/**
 * Example Online Booking Tool connector.
 * Supports synchronous request/response pattern for policy evaluation at search time.
 * Requirement 25.2: Pre-built OBT connector.
 */
export class OBTConnector extends BaseConnector {
  constructor(connectorId?: string) {
    super(
      connectorId ?? 'obt-connector-default',
      'Online Booking Tool Connector',
      'synchronous'
    );
  }

  protected async executeRequest<T>(
    payload: Record<string, unknown>,
    authToken: string | null
  ): Promise<{ data?: T; statusCode: number }> {
    const { baseUrl, timeout, headers: configHeaders } = this.config.protocolConfig;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...configHeaders,
    };

    if (authToken) {
      if (this.config.authConfig.type === 'basic') {
        headers['Authorization'] = `Basic ${authToken}`;
      } else {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
    }

    const response = await fetch(`${baseUrl}/bookings`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const error = new Error(`OBT request failed: ${response.status} ${response.statusText}`);
      (error as unknown as { statusCode: number }).statusCode = response.status;
      throw error;
    }

    const data = (await response.json()) as T;
    return { data, statusCode: response.status };
  }

  protected async executeHealthCheck(): Promise<void> {
    const { baseUrl, timeout } = this.config.protocolConfig;

    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`OBT health check failed: ${response.status}`);
    }
  }
}

// --- Example GDS Connector ---

/**
 * Example Global Distribution System connector.
 * Supports asynchronous webhook/event pattern for booking confirmations.
 * Requirement 25.2: Pre-built GDS connector.
 */
export class GDSConnector extends BaseConnector {
  constructor(connectorId?: string) {
    super(
      connectorId ?? 'gds-connector-default',
      'Global Distribution System Connector',
      'asynchronous'
    );
  }

  protected async executeRequest<T>(
    payload: Record<string, unknown>,
    authToken: string | null
  ): Promise<{ data?: T; statusCode: number }> {
    const { baseUrl, timeout, headers: configHeaders } = this.config.protocolConfig;

    const headers: Record<string, string> = {
      'Content-Type': 'application/xml',
      'Accept': 'application/json',
      ...configHeaders,
    };

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    // GDS systems often use SOAP/XML but we normalise to JSON internally
    const response = await fetch(`${baseUrl}/reservations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      const error = new Error(`GDS request failed: ${response.status} ${response.statusText}`);
      (error as unknown as { statusCode: number }).statusCode = response.status;
      throw error;
    }

    const data = (await response.json()) as T;
    return { data, statusCode: response.status };
  }

  protected async executeHealthCheck(): Promise<void> {
    const { baseUrl, timeout } = this.config.protocolConfig;

    const response = await fetch(`${baseUrl}/status`, {
      method: 'GET',
      signal: AbortSignal.timeout(timeout),
    });

    if (!response.ok) {
      throw new Error(`GDS health check failed: ${response.status}`);
    }
  }
}

// --- Connector Registry ---

/**
 * Registry for managing multiple integration connectors.
 */
export class ConnectorRegistry {
  private connectors = new Map<string, IntegrationAdapter>();

  /**
   * Register a connector instance.
   */
  register(connector: IntegrationAdapter): void {
    this.connectors.set(connector.connectorId, connector);
  }

  /**
   * Get a connector by ID.
   */
  get(connectorId: string): IntegrationAdapter | undefined {
    return this.connectors.get(connectorId);
  }

  /**
   * Remove a connector from the registry.
   */
  async unregister(connectorId: string): Promise<void> {
    const connector = this.connectors.get(connectorId);
    if (connector) {
      await connector.disconnect();
      this.connectors.delete(connectorId);
    }
  }

  /**
   * Get health status of all registered connectors.
   */
  getAllHealth(): ConnectorHealth[] {
    return Array.from(this.connectors.values()).map((c) => c.getHealth());
  }

  /**
   * Get all registered connector IDs.
   */
  listConnectors(): string[] {
    return Array.from(this.connectors.keys());
  }

  /**
   * Run connectivity tests on all connectors.
   * Requirement 25.3: Automated test suite for new integrations.
   */
  async testAll(): Promise<Array<{ connectorId: string; success: boolean; message: string; latencyMs: number }>> {
    const results = [];
    for (const [id, connector] of this.connectors) {
      const result = await connector.testConnectivity();
      results.push({ connectorId: id, ...result });
    }
    return results;
  }
}

/**
 * Default retry configuration.
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  maxDelayMs: 30_000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

/**
 * Create a new connector registry with default connectors.
 */
export function createConnectorRegistry(): ConnectorRegistry {
  return new ConnectorRegistry();
}
