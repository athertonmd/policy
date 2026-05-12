/**
 * Shared validation logic for email-based approval actions.
 * Validates JWT action tokens, verifies sender emails, and parses reply keywords.
 *
 * Requirements: 9.2, 27.1, 27.2, 27.3, 27.4, 27.5
 */
import { validateActionToken, type ValidatedPayload } from './action-link-generator.js';

export { type ValidatedPayload } from './action-link-generator.js';

export type ReplyAction = 'approve' | 'reject' | 'request_info';

export interface ParsedReplyAction {
  action: ReplyAction;
  keyword: string;
}

export interface TokenValidationResult {
  valid: true;
  payload: ValidatedPayload;
}

export interface TokenValidationError {
  valid: false;
  expired: boolean;
  error: string;
}

export type TokenValidationOutcome = TokenValidationResult | TokenValidationError;

/**
 * Validate an action link JWT token.
 * Returns a discriminated union indicating success or failure with expiry info.
 */
export async function validateEmailActionToken(
  token: string,
  secret: string
): Promise<TokenValidationOutcome> {
  try {
    const payload = await validateActionToken(token, secret);
    return { valid: true, payload };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    const expired = isExpiredError(message);
    return { valid: false, expired, error: message };
  }
}

/**
 * Verify that the sender email matches the designated approver.
 * Looks up the approver's email by approverId and tenantId.
 *
 * In production, this would query the traveller profile service.
 * For now, it accepts a pre-resolved expected email for comparison.
 */
export function verifySenderEmail(
  senderEmail: string,
  expectedEmail: string
): boolean {
  if (!senderEmail || !expectedEmail) {
    return false;
  }
  return normalizeEmail(senderEmail) === normalizeEmail(expectedEmail);
}

/**
 * Parse an email reply body for approval action keywords.
 * Looks for APPROVE, REJECT, or INFO as the first significant word in the body.
 * Ignores quoted text (lines starting with >) and email signatures (lines after --).
 *
 * Returns the parsed action or null if no valid keyword is found.
 */
export function parseReplyAction(emailBody: string): ParsedReplyAction | null {
  if (!emailBody || typeof emailBody !== 'string') {
    return null;
  }

  const lines = emailBody.split(/\r?\n/);
  const significantLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Stop at email signature delimiter
    if (trimmed === '--' || trimmed === '-- ') {
      break;
    }

    // Skip quoted text (reply lines)
    if (trimmed.startsWith('>')) {
      continue;
    }

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    significantLines.push(trimmed);
  }

  // Look for keywords in the first few significant lines
  for (const line of significantLines.slice(0, 3)) {
    const match = matchActionKeyword(line);
    if (match) {
      return match;
    }
  }

  return null;
}

/**
 * Match a line against known approval action keywords.
 */
function matchActionKeyword(line: string): ParsedReplyAction | null {
  const upper = line.toUpperCase().trim();

  // Match exact keywords or keywords at the start of a line
  if (upper === 'APPROVE' || upper === 'APPROVED' || upper.startsWith('APPROVE ') || upper.startsWith('APPROVED ')) {
    return { action: 'approve', keyword: 'APPROVE' };
  }

  if (upper === 'REJECT' || upper === 'REJECTED' || upper.startsWith('REJECT ') || upper.startsWith('REJECTED ')) {
    return { action: 'reject', keyword: 'REJECT' };
  }

  if (upper === 'INFO' || upper === 'REQUEST INFO' || upper === 'MORE INFO' || upper.startsWith('INFO ') || upper.startsWith('REQUEST INFO ')) {
    return { action: 'request_info', keyword: 'INFO' };
  }

  return null;
}

/**
 * Normalize an email address for comparison (lowercase, trim whitespace).
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Determine if a JWT validation error is due to token expiry.
 */
function isExpiredError(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return (
    lowerMessage.includes('exp') ||
    lowerMessage.includes('expired') ||
    lowerMessage.includes('claim timestamp check failed')
  );
}
