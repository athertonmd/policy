/**
 * HTTP client wrapper for Sabre APIs.
 * Handles authentication header injection, retry with exponential backoff,
 * automatic token refresh on 401, and request timeout.
 */

import type { SabreConfig } from '../config.js';
import type { SabreAuth } from '../auth/sabre-auth.js';
import { createLogger } from './logger.js';

const logger = createLogger('sabre-client');

export interface SabreRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface SabreResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
  durationMs: number;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 500;
const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * Creates a configured Sabre HTTP client with auth and retry logic.
 */
export function createSabreClient(config: SabreConfig, auth: SabreAuth) {
  const baseUrl = config.environment === 'production'
    ? 'https://api.havail.sabre.com'
    : 'https://api-crt.cert.havail.sabre.com';

  async function request<T>(options: SabreRequestOptions): Promise<SabreResponse<T>> {
    const { method, path, body, headers: extraHeaders, timeoutMs } = options;
    const url = `${baseUrl}${path}`;
    const timeout = timeoutMs ?? config.requestTimeoutMs ?? 10000;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const token = await auth.getToken();

        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...extraHeaders,
        };

        const startTime = Date.now();

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(timeout),
        });

        const durationMs = Date.now() - startTime;

        // If 401, refresh token and retry once
        if (response.status === 401 && attempt === 0) {
          logger.info('Received 401, refreshing token and retrying', { path });
          auth.invalidateToken();
          continue;
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        const data = await response.json() as T;

        if (!response.ok && RETRYABLE_STATUS_CODES.includes(response.status)) {
          throw new SabreApiError(
            `Sabre API error: ${response.status}`,
            response.status,
            data
          );
        }

        if (!response.ok) {
          throw new SabreApiError(
            `Sabre API error: ${response.status}`,
            response.status,
            data
          );
        }

        logger.debug('Sabre API request completed', {
          method,
          path,
          status: response.status,
          durationMs,
        });

        return { status: response.status, data, headers: responseHeaders, durationMs };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        const isRetryable = error instanceof SabreApiError
          ? RETRYABLE_STATUS_CODES.includes(error.statusCode)
          : true; // Network errors are retryable

        if (!isRetryable || attempt === MAX_RETRIES) {
          break;
        }

        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        logger.warn(`Retrying Sabre request (attempt ${attempt + 1}/${MAX_RETRIES})`, {
          path,
          backoffMs: backoff,
          error: lastError.message,
        });

        await sleep(backoff);
      }
    }

    throw lastError ?? new Error('Sabre request failed');
  }

  return { request };
}

export type SabreClient = ReturnType<typeof createSabreClient>;

export class SabreApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message);
    this.name = 'SabreApiError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
