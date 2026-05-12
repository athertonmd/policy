/**
 * Platform Monitoring and Observability Module
 *
 * Health check endpoint returning status within 1 second.
 * Structured JSON logging helper with correlation IDs.
 * CloudWatch metric publishing helper.
 * Distributed tracing support via AWS X-Ray.
 *
 * Requirements: 21.1, 21.2, 21.3, 21.4, 21.5, 21.6
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { CloudWatchClient, PutMetricDataCommand, type MetricDatum } from '@aws-sdk/client-cloudwatch';

// --- Types ---

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLogEntry {
  level: LogLevel;
  message: string;
  service: string;
  correlationId: string;
  traceId?: string;
  spanId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  timestamp: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  checks: HealthCheckComponent[];
  responseTimeMs: number;
}

export interface HealthCheckComponent {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  responseTimeMs?: number;
  message?: string;
  lastChecked: string;
}

export type HealthCheckFn = () => Promise<HealthCheckComponent>;

export interface MetricDefinition {
  namespace: string;
  metricName: string;
  value: number;
  unit: 'Count' | 'Milliseconds' | 'Bytes' | 'Percent' | 'None';
  dimensions?: Record<string, string>;
  timestamp?: Date;
}

export interface LoggerConfig {
  service: string;
  defaultLevel?: LogLevel;
  enableConsole?: boolean;
}

// --- Structured Logger ---

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  FATAL: 4,
};

const MINIMUM_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? 'INFO';

/**
 * Structured JSON logger with correlation ID propagation.
 * Emits logs in a format compatible with CloudWatch Logs Insights.
 */
export class StructuredLogger {
  private readonly service: string;
  private correlationId: string;
  private traceId?: string;
  private tenantId?: string;
  private userId?: string;
  private requestId?: string;

  constructor(config: LoggerConfig) {
    this.service = config.service;
    this.correlationId = '';
  }

  /**
   * Set context for all subsequent log entries.
   */
  setContext(context: {
    correlationId?: string;
    traceId?: string;
    tenantId?: string;
    userId?: string;
    requestId?: string;
  }): void {
    if (context.correlationId) this.correlationId = context.correlationId;
    if (context.traceId) this.traceId = context.traceId;
    if (context.tenantId) this.tenantId = context.tenantId;
    if (context.userId) this.userId = context.userId;
    if (context.requestId) this.requestId = context.requestId;
  }

  /**
   * Extract correlation context from an API Gateway event and Lambda context.
   */
  setContextFromEvent(event: APIGatewayProxyEvent, lambdaContext: Context): void {
    this.correlationId =
      event.headers?.['x-correlation-id'] ??
      event.headers?.['X-Correlation-Id'] ??
      lambdaContext.awsRequestId;
    this.requestId = lambdaContext.awsRequestId;
    this.traceId = process.env._X_AMZN_TRACE_ID;
    this.tenantId = event.headers?.['x-tenant-id'] ?? event.headers?.['X-Tenant-Id'];
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('DEBUG', message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('INFO', message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('WARN', message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log('ERROR', message, metadata, error);
  }

  fatal(message: string, error?: Error, metadata?: Record<string, unknown>): void {
    this.log('FATAL', message, metadata, error);
  }

  private log(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>,
    error?: Error
  ): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[MINIMUM_LOG_LEVEL]) {
      return;
    }

    const entry: StructuredLogEntry = {
      level,
      message,
      service: this.service,
      correlationId: this.correlationId,
      traceId: this.traceId,
      tenantId: this.tenantId,
      userId: this.userId,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
      metadata,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    // Emit as single-line JSON for CloudWatch Logs Insights
    const output = JSON.stringify(entry);

    switch (level) {
      case 'ERROR':
      case 'FATAL':
        console.error(output);
        break;
      case 'WARN':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  /**
   * Create a child logger that inherits context.
   */
  child(additionalContext: Record<string, unknown>): StructuredLogger {
    const child = new StructuredLogger({ service: this.service });
    child.correlationId = this.correlationId;
    child.traceId = this.traceId;
    child.tenantId = this.tenantId;
    child.userId = this.userId;
    child.requestId = this.requestId;
    return child;
  }
}

/**
 * Create a new structured logger instance for a service.
 */
export function createLogger(service: string): StructuredLogger {
  return new StructuredLogger({ service });
}

// --- CloudWatch Metrics ---

const cloudWatchClient = new CloudWatchClient({});
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? 'TravelPolicyPlatform';
const METRIC_BUFFER: MetricDatum[] = [];
const METRIC_BUFFER_SIZE = 20;

/**
 * Publish a single metric to CloudWatch.
 */
export async function publishMetric(metric: MetricDefinition): Promise<void> {
  const datum: MetricDatum = {
    MetricName: metric.metricName,
    Value: metric.value,
    Unit: metric.unit,
    Timestamp: metric.timestamp ?? new Date(),
    Dimensions: metric.dimensions
      ? Object.entries(metric.dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  };

  METRIC_BUFFER.push(datum);

  if (METRIC_BUFFER.length >= METRIC_BUFFER_SIZE) {
    await flushMetrics(metric.namespace);
  }
}

/**
 * Publish multiple metrics in a batch.
 */
export async function publishMetrics(metrics: MetricDefinition[]): Promise<void> {
  if (metrics.length === 0) return;

  const namespace = metrics[0].namespace ?? METRIC_NAMESPACE;
  const data: MetricDatum[] = metrics.map((m) => ({
    MetricName: m.metricName,
    Value: m.value,
    Unit: m.unit,
    Timestamp: m.timestamp ?? new Date(),
    Dimensions: m.dimensions
      ? Object.entries(m.dimensions).map(([Name, Value]) => ({ Name, Value }))
      : undefined,
  }));

  // CloudWatch accepts max 1000 metrics per request, batch in groups of 25
  for (let i = 0; i < data.length; i += 25) {
    const batch = data.slice(i, i + 25);
    await cloudWatchClient.send(
      new PutMetricDataCommand({
        Namespace: namespace,
        MetricData: batch,
      })
    );
  }
}

/**
 * Flush buffered metrics to CloudWatch.
 */
export async function flushMetrics(namespace?: string): Promise<void> {
  if (METRIC_BUFFER.length === 0) return;

  const metricsToFlush = METRIC_BUFFER.splice(0, METRIC_BUFFER.length);
  const ns = namespace ?? METRIC_NAMESPACE;

  try {
    for (let i = 0; i < metricsToFlush.length; i += 25) {
      const batch = metricsToFlush.slice(i, i + 25);
      await cloudWatchClient.send(
        new PutMetricDataCommand({
          Namespace: ns,
          MetricData: batch,
        })
      );
    }
  } catch (error) {
    console.error('Failed to flush metrics to CloudWatch:', error);
    // Re-add failed metrics to buffer for retry
    METRIC_BUFFER.push(...metricsToFlush);
  }
}

// --- Health Check ---

const SERVICE_START_TIME = Date.now();
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? '1.0.0';

/**
 * Create a health check Lambda handler for a service.
 * Responds within 1 second as required by Requirement 21.2.
 */
export function createHealthCheckHandler(
  serviceName: string,
  checks: HealthCheckFn[] = []
) {
  return async function healthCheckHandler(
    _event: APIGatewayProxyEvent,
    _context: Context
  ): Promise<APIGatewayProxyResult> {
    const startTime = Date.now();
    const timeout = 900; // 900ms budget to stay under 1s SLA

    const componentResults: HealthCheckComponent[] = [];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Run health checks with timeout protection
    for (const check of checks) {
      try {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeout) {
          componentResults.push({
            name: 'timeout',
            status: 'warn',
            message: 'Health check budget exceeded, remaining checks skipped',
            lastChecked: new Date().toISOString(),
          });
          overallStatus = 'degraded';
          break;
        }

        const result = await Promise.race([
          check(),
          new Promise<HealthCheckComponent>((resolve) =>
            setTimeout(
              () =>
                resolve({
                  name: 'unknown',
                  status: 'warn',
                  message: 'Check timed out',
                  lastChecked: new Date().toISOString(),
                }),
              timeout - elapsed
            )
          ),
        ]);

        componentResults.push(result);

        if (result.status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        componentResults.push({
          name: 'unknown',
          status: 'fail',
          message: error instanceof Error ? error.message : 'Check failed',
          lastChecked: new Date().toISOString(),
        });
        overallStatus = 'unhealthy';
      }
    }

    const responseTimeMs = Date.now() - startTime;

    const result: HealthCheckResult = {
      status: overallStatus,
      service: serviceName,
      version: SERVICE_VERSION,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - SERVICE_START_TIME) / 1000),
      checks: componentResults,
      responseTimeMs,
    };

    const statusCode = overallStatus === 'unhealthy' ? 503 : 200;

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store',
      },
      body: JSON.stringify(result),
    };
  };
}

// --- Correlation ID Middleware ---

/**
 * Extract or generate a correlation ID from an incoming request.
 */
export function extractCorrelationId(event: APIGatewayProxyEvent, context: Context): string {
  return (
    event.headers?.['x-correlation-id'] ??
    event.headers?.['X-Correlation-Id'] ??
    event.headers?.['x-request-id'] ??
    event.headers?.['X-Request-Id'] ??
    context.awsRequestId
  );
}

/**
 * Generate a new correlation ID.
 */
export function generateCorrelationId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

// --- Timer Utility ---

/**
 * Measure execution time of an async operation and publish as a metric.
 */
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  dimensions?: Record<string, string>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;

    await publishMetric({
      namespace: METRIC_NAMESPACE,
      metricName: `${operation}Duration`,
      value: duration,
      unit: 'Milliseconds',
      dimensions: { Operation: operation, ...dimensions },
    });

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    await publishMetric({
      namespace: METRIC_NAMESPACE,
      metricName: `${operation}Error`,
      value: 1,
      unit: 'Count',
      dimensions: { Operation: operation, ...dimensions },
    });

    await publishMetric({
      namespace: METRIC_NAMESPACE,
      metricName: `${operation}Duration`,
      value: duration,
      unit: 'Milliseconds',
      dimensions: { Operation: operation, ...dimensions },
    });

    throw error;
  }
}
