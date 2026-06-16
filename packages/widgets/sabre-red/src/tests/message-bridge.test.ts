import { describe, it, expect } from 'vitest';
import { validateOrigin, isValidMessage, createReadyMessage } from '../lib/message-bridge';

describe('validateOrigin', () => {
  it('accepts allowed origins', () => {
    const allowed = ['https://sabre.example.com', 'https://app.example.com'];
    expect(validateOrigin('https://sabre.example.com', allowed)).toBe(true);
    expect(validateOrigin('https://app.example.com', allowed)).toBe(true);
  });

  it('rejects non-allowed origins', () => {
    const allowed = ['https://sabre.example.com'];
    expect(validateOrigin('https://evil.example.com', allowed)).toBe(false);
    expect(validateOrigin('https://other.com', allowed)).toBe(false);
  });

  it('accepts all origins when allowlist is empty', () => {
    expect(validateOrigin('https://anything.com', [])).toBe(true);
    expect(validateOrigin('http://localhost:3000', [])).toBe(true);
  });
});

describe('isValidMessage', () => {
  it('accepts valid INIT message', () => {
    expect(
      isValidMessage({
        type: 'INIT',
        payload: { tenantId: 't1', agentId: 'a1' },
        correlationId: 'abc-123',
        timestamp: 1700000000000,
      })
    ).toBe(true);
  });

  it('accepts valid SEARCH_RESULTS message', () => {
    expect(
      isValidMessage({
        type: 'SEARCH_RESULTS',
        payload: { fares: [] },
        correlationId: 'def-456',
        timestamp: 1700000000001,
      })
    ).toBe(true);
  });

  it('accepts valid END_TRANSACTION message', () => {
    expect(
      isValidMessage({
        type: 'END_TRANSACTION',
        payload: { pnrLocator: 'ABC123' },
        correlationId: 'ghi-789',
        timestamp: 1700000000002,
      })
    ).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidMessage(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidMessage(undefined)).toBe(false);
  });

  it('rejects non-object primitives', () => {
    expect(isValidMessage('hello')).toBe(false);
    expect(isValidMessage(42)).toBe(false);
    expect(isValidMessage(true)).toBe(false);
  });

  it('rejects objects missing required fields', () => {
    expect(isValidMessage({ type: 'INIT' })).toBe(false);
    expect(isValidMessage({ type: 'INIT', correlationId: 'abc' })).toBe(false);
    expect(isValidMessage({ correlationId: 'abc', timestamp: 123 })).toBe(false);
  });

  it('rejects unknown message types', () => {
    expect(
      isValidMessage({
        type: 'UNKNOWN_TYPE',
        payload: {},
        correlationId: 'abc',
        timestamp: 123,
      })
    ).toBe(false);
  });

  it('rejects when correlationId is not a string', () => {
    expect(
      isValidMessage({
        type: 'INIT',
        payload: {},
        correlationId: 123,
        timestamp: 123,
      })
    ).toBe(false);
  });

  it('rejects when timestamp is not a number', () => {
    expect(
      isValidMessage({
        type: 'INIT',
        payload: {},
        correlationId: 'abc',
        timestamp: '123',
      })
    ).toBe(false);
  });
});

describe('createReadyMessage', () => {
  it('returns correct shape with type READY', () => {
    const msg = createReadyMessage();
    expect(msg.type).toBe('READY');
    expect(msg.payload).toEqual({ version: '0.1.0' });
    expect(typeof msg.correlationId).toBe('string');
    expect(msg.correlationId.length).toBeGreaterThan(0);
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it('generates unique correlationIds', () => {
    const msg1 = createReadyMessage();
    const msg2 = createReadyMessage();
    expect(msg1.correlationId).not.toBe(msg2.correlationId);
  });
});
