/**
 * Unit tests for email-action-validator.
 * Tests token validation, reply parsing, and sender verification.
 *
 * Requirements: 9.2, 27.1, 27.2, 27.3, 27.4, 27.5
 */
import { describe, it, expect } from 'vitest';

import { generateActionLinks } from './action-link-generator.js';
import {
  validateEmailActionToken,
  verifySenderEmail,
  parseReplyAction,
} from './email-action-validator.js';

const TEST_SECRET = 'test-secret-key-for-unit-tests-minimum-length';
const TEST_BASE_URL = 'https://api.travel-policy.example.com';

const TEST_PAYLOAD = {
  workflowId: 'wf-123-456',
  stageNumber: 1,
  action: 'approve' as const,
  approverId: 'approver-001',
  tenantId: 'tenant-abc',
};

describe('validateEmailActionToken', () => {
  it('should return valid result for a valid token', async () => {
    const links = await generateActionLinks(TEST_PAYLOAD, {
      secret: TEST_SECRET,
      baseUrl: TEST_BASE_URL,
      expiryHours: 24,
    });

    const approveLink = links.find((l) => l.action === 'approve')!;
    const result = await validateEmailActionToken(approveLink.token, TEST_SECRET);

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.payload.workflowId).toBe('wf-123-456');
      expect(result.payload.stageNumber).toBe(1);
      expect(result.payload.action).toBe('approve');
      expect(result.payload.approverId).toBe('approver-001');
      expect(result.payload.tenantId).toBe('tenant-abc');
    }
  });

  it('should return expired error for an expired token', async () => {
    const links = await generateActionLinks(TEST_PAYLOAD, {
      secret: TEST_SECRET,
      baseUrl: TEST_BASE_URL,
      expiryHours: 0, // Immediate expiry
    });

    const approveLink = links.find((l) => l.action === 'approve')!;

    // Wait for token to expire
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const result = await validateEmailActionToken(approveLink.token, TEST_SECRET);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.expired).toBe(true);
    }
  });

  it('should return invalid error for wrong secret', async () => {
    const links = await generateActionLinks(TEST_PAYLOAD, {
      secret: TEST_SECRET,
      baseUrl: TEST_BASE_URL,
    });

    const approveLink = links.find((l) => l.action === 'approve')!;
    const result = await validateEmailActionToken(approveLink.token, 'wrong-secret-key');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.expired).toBe(false);
    }
  });

  it('should return invalid error for malformed token', async () => {
    const result = await validateEmailActionToken('not-a-jwt', TEST_SECRET);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.expired).toBe(false);
      expect(result.error).toBeTruthy();
    }
  });

  it('should validate all action types correctly', async () => {
    const links = await generateActionLinks(TEST_PAYLOAD, {
      secret: TEST_SECRET,
      baseUrl: TEST_BASE_URL,
    });

    for (const link of links) {
      const result = await validateEmailActionToken(link.token, TEST_SECRET);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.payload.action).toBe(link.action);
      }
    }
  });
});

describe('verifySenderEmail', () => {
  it('should return true for matching emails', () => {
    expect(verifySenderEmail('approver@company.com', 'approver@company.com')).toBe(true);
  });

  it('should be case-insensitive', () => {
    expect(verifySenderEmail('Approver@Company.COM', 'approver@company.com')).toBe(true);
  });

  it('should trim whitespace', () => {
    expect(verifySenderEmail('  approver@company.com  ', 'approver@company.com')).toBe(true);
  });

  it('should return false for non-matching emails', () => {
    expect(verifySenderEmail('other@company.com', 'approver@company.com')).toBe(false);
  });

  it('should return false for empty sender email', () => {
    expect(verifySenderEmail('', 'approver@company.com')).toBe(false);
  });

  it('should return false for empty expected email', () => {
    expect(verifySenderEmail('approver@company.com', '')).toBe(false);
  });

  it('should return false for both empty', () => {
    expect(verifySenderEmail('', '')).toBe(false);
  });
});

describe('parseReplyAction', () => {
  describe('APPROVE keyword', () => {
    it('should parse "APPROVE" as approve action', () => {
      const result = parseReplyAction('APPROVE');
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should parse "Approve" (case-insensitive) as approve action', () => {
      const result = parseReplyAction('Approve');
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should parse "APPROVED" as approve action', () => {
      const result = parseReplyAction('APPROVED');
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should parse "APPROVE this trip" as approve action', () => {
      const result = parseReplyAction('APPROVE this trip');
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });
  });

  describe('REJECT keyword', () => {
    it('should parse "REJECT" as reject action', () => {
      const result = parseReplyAction('REJECT');
      expect(result).toEqual({ action: 'reject', keyword: 'REJECT' });
    });

    it('should parse "Reject" (case-insensitive) as reject action', () => {
      const result = parseReplyAction('Reject');
      expect(result).toEqual({ action: 'reject', keyword: 'REJECT' });
    });

    it('should parse "REJECTED" as reject action', () => {
      const result = parseReplyAction('REJECTED');
      expect(result).toEqual({ action: 'reject', keyword: 'REJECT' });
    });

    it('should parse "REJECT - not within budget" as reject action', () => {
      const result = parseReplyAction('REJECT - not within budget');
      expect(result).toEqual({ action: 'reject', keyword: 'REJECT' });
    });
  });

  describe('INFO keyword', () => {
    it('should parse "INFO" as request_info action', () => {
      const result = parseReplyAction('INFO');
      expect(result).toEqual({ action: 'request_info', keyword: 'INFO' });
    });

    it('should parse "REQUEST INFO" as request_info action', () => {
      const result = parseReplyAction('REQUEST INFO');
      expect(result).toEqual({ action: 'request_info', keyword: 'INFO' });
    });

    it('should parse "MORE INFO" as request_info action', () => {
      const result = parseReplyAction('MORE INFO');
      expect(result).toEqual({ action: 'request_info', keyword: 'INFO' });
    });

    it('should parse "INFO please provide more details" as request_info action', () => {
      const result = parseReplyAction('INFO please provide more details');
      expect(result).toEqual({ action: 'request_info', keyword: 'INFO' });
    });
  });

  describe('email body parsing', () => {
    it('should ignore quoted text (lines starting with >)', () => {
      const body = 'APPROVE\n\n> Original message:\n> Please approve this trip';
      const result = parseReplyAction(body);
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should stop at email signature delimiter (--)', () => {
      const body = 'APPROVE\n--\nJohn Smith\nVP Engineering';
      const result = parseReplyAction(body);
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should find keyword after empty lines', () => {
      const body = '\n\nAPPROVE\n\nThanks';
      const result = parseReplyAction(body);
      expect(result).toEqual({ action: 'approve', keyword: 'APPROVE' });
    });

    it('should not find keyword only in quoted text', () => {
      const body = '> APPROVE\n\nI need to think about this more.';
      const result = parseReplyAction(body);
      expect(result).toBeNull();
    });

    it('should not find keyword only after signature', () => {
      const body = 'Thanks for sending this.\n--\nAPPROVE';
      const result = parseReplyAction(body);
      expect(result).toBeNull();
    });

    it('should return null for empty body', () => {
      expect(parseReplyAction('')).toBeNull();
    });

    it('should return null for body with no keywords', () => {
      const body = 'Thanks for the update. I will review this later.';
      const result = parseReplyAction(body);
      expect(result).toBeNull();
    });

    it('should return null for null/undefined input', () => {
      expect(parseReplyAction(null as unknown as string)).toBeNull();
      expect(parseReplyAction(undefined as unknown as string)).toBeNull();
    });

    it('should handle multiline reply with keyword on first significant line', () => {
      const body = 'REJECT\n\nThis trip exceeds our budget for Q4.\n\n> On Nov 1, John wrote:\n> Please approve my trip to NYC';
      const result = parseReplyAction(body);
      expect(result).toEqual({ action: 'reject', keyword: 'REJECT' });
    });
  });
});
