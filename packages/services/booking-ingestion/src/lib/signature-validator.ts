/**
 * Webhook signature validation using HMAC-SHA256.
 * Supports both hex and base64 encoded signatures.
 * Uses timing-safe comparison to prevent timing attacks.
 */
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Validates an HMAC-SHA256 signature against a payload and secret.
 * Supports both hex and base64 encoded signatures.
 * Uses timing-safe comparison to prevent timing attacks.
 *
 * @param payload - The raw request body string
 * @param signature - The signature provided in the webhook header
 * @param secret - The integration's webhook secret key
 * @returns true if the signature is valid, false otherwise
 */
export function validateSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!payload || !signature || !secret) {
    return false;
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(payload);

  // Try hex encoding first
  const expectedHex = hmac.digest('hex');
  if (safeCompare(signature, expectedHex)) {
    return true;
  }

  // Try base64 encoding
  const hmac2 = createHmac('sha256', secret);
  hmac2.update(payload);
  const expectedBase64 = hmac2.digest('base64');
  if (safeCompare(signature, expectedBase64)) {
    return true;
  }

  return false;
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to avoid leaking length info via timing
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(a, 'utf8'); // compare against itself to keep constant time
    timingSafeEqual(bufA, bufB);
    return false;
  }

  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}
