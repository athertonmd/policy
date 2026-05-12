/**
 * Common shared types used across the platform
 */

export interface Money {
  amount: number;
  currency: string;
}

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
  nextToken?: string;
  hasMore: boolean;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  data: T;
  metadata?: ResponseMetadata;
}

export interface ResponseMetadata {
  requestId: string;
  timestamp: string;
  version: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  responseTimeMs?: number;
  message?: string;
}
