/**
 * Sabre OAuth2 Client Credentials Authentication.
 *
 * Implements the Sabre Dev Studio authentication flow:
 * 1. Base64-encode the client_id and client_secret (each individually base64-encoded first)
 * 2. POST to /v2/auth/token with grant_type=client_credentials
 * 3. Cache the token and refresh before expiry
 *
 * Sabre's auth is slightly non-standard: the client_id and client_secret are each
 * base64-encoded separately, then combined with ":" and base64-encoded again.
 */

import type { SabreConfig } from '../config.js';
import { getSabreTokenUrl } from '../config.js';
import type { SabreTokenResponse } from '../types/sabre-types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('sabre-auth');

/** Buffer before token expiry to trigger refresh (60 seconds) */
const TOKEN_REFRESH_BUFFER_MS = 60_000;

export interface SabreAuth {
  /** Get a valid access token, refreshing if necessary */
  getToken(): Promise<string>;
  /** Force invalidate the cached token (e.g., after a 401) */
  invalidateToken(): void;
}

/**
 * Creates a Sabre authentication handler with token caching and auto-refresh.
 */
export function createSabreAuth(config: SabreConfig): SabreAuth {
  let cachedToken: string | null = null;
  let tokenExpiresAt = 0;

  /**
   * Encode credentials per Sabre's specification:
   * Base64(Base64(clientId):Base64(clientSecret))
   */
  function encodeCredentials(): string {
    const encodedClientId = Buffer.from(config.clientId).toString('base64');
    const encodedSecret = Buffer.from(config.clientSecret).toString('base64');
    const combined = `${encodedClientId}:${encodedSecret}`;
    return Buffer.from(combined).toString('base64');
  }

  async function fetchToken(): Promise<string> {
    const tokenUrl = getSabreTokenUrl(config);
    const credentials = encodeCredentials();

    logger.info('Requesting new Sabre access token', {
      environment: config.environment,
      tokenUrl,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(config.requestTimeoutMs ?? 10000),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('Sabre token request failed', new Error(errorBody), {
        status: response.status,
      });
      throw new Error(
        `Sabre authentication failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as SabreTokenResponse;

    // Cache the token with expiry
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000) - TOKEN_REFRESH_BUFFER_MS;

    logger.info('Sabre access token acquired', {
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    });

    return data.access_token;
  }

  async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiresAt) {
      return cachedToken;
    }
    return fetchToken();
  }

  function invalidateToken(): void {
    cachedToken = null;
    tokenExpiresAt = 0;
    logger.info('Sabre token invalidated');
  }

  return { getToken, invalidateToken };
}
