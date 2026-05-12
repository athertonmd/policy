import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { validateSignature } from './signature-validator.js';

describe('validateSignature', () => {
  const secret = 'test-webhook-secret-key';
  const payload = JSON.stringify({ event: 'booking.created', data: { id: '123' } });

  it('returns true for a valid hex-encoded signature', () => {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    expect(validateSignature(payload, expectedSignature, secret)).toBe(true);
  });

  it('returns true for a valid base64-encoded signature', () => {
    const expectedSignature = createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    expect(validateSignature(payload, expectedSignature, secret)).toBe(true);
  });

  it('returns false for an invalid signature', () => {
    const invalidSignature = 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';

    expect(validateSignature(payload, invalidSignature, secret)).toBe(false);
  });

  it('returns false for a signature computed with a different secret', () => {
    const wrongSecret = 'wrong-secret';
    const signature = createHmac('sha256', wrongSecret)
      .update(payload)
      .digest('hex');

    expect(validateSignature(payload, signature, secret)).toBe(false);
  });

  it('returns false for a signature computed against a different payload', () => {
    const differentPayload = JSON.stringify({ event: 'booking.updated' });
    const signature = createHmac('sha256', secret)
      .update(differentPayload)
      .digest('hex');

    expect(validateSignature(payload, signature, secret)).toBe(false);
  });

  it('returns false when payload is empty', () => {
    const signature = createHmac('sha256', secret).update(payload).digest('hex');
    expect(validateSignature('', signature, secret)).toBe(false);
  });

  it('returns false when signature is empty', () => {
    expect(validateSignature(payload, '', secret)).toBe(false);
  });

  it('returns false when secret is empty', () => {
    expect(validateSignature(payload, 'some-sig', '')).toBe(false);
  });

  it('handles large payloads correctly', () => {
    const largePayload = JSON.stringify({ data: 'x'.repeat(100000) });
    const signature = createHmac('sha256', secret)
      .update(largePayload)
      .digest('hex');

    expect(validateSignature(largePayload, signature, secret)).toBe(true);
  });

  it('is case-sensitive for hex signatures', () => {
    const signature = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    const upperSignature = signature.toUpperCase();

    // Hex signatures from Node.js are lowercase; uppercase should fail
    expect(validateSignature(payload, upperSignature, secret)).toBe(false);
  });
});
