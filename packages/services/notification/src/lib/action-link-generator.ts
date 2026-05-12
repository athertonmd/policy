/**
 * Generates secure JWT-signed action links for email-based approval.
 * Links contain: workflowId, stageNumber, action, approverId, expiresAt.
 * Signs with a secret key from environment/Secrets Manager.
 * Validates links on receipt (used by email-based approval handler).
 *
 * Requirements: 9.1, 9.2
 */
import * as jose from 'jose';

export interface ActionLinkPayload {
  workflowId: string;
  stageNumber: number;
  action: 'approve' | 'reject' | 'request_info';
  approverId: string;
  tenantId: string;
}

export interface GeneratedActionLink {
  action: 'approve' | 'reject' | 'request_info';
  url: string;
  token: string;
  expiresAt: string;
}

export interface ValidatedPayload extends ActionLinkPayload {
  expiresAt: string;
}

const DEFAULT_EXPIRY_HOURS = 24;

/**
 * Generate secure, time-limited action links for approval actions.
 */
export async function generateActionLinks(
  payload: ActionLinkPayload,
  options: {
    secret: string;
    baseUrl: string;
    expiryHours?: number;
  }
): Promise<GeneratedActionLink[]> {
  const { secret, baseUrl, expiryHours = DEFAULT_EXPIRY_HOURS } = options;
  const actions: Array<'approve' | 'reject' | 'request_info'> = [
    'approve',
    'reject',
    'request_info',
  ];

  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
  const secretKey = new TextEncoder().encode(secret);

  const links: GeneratedActionLink[] = [];

  for (const action of actions) {
    const token = await new jose.SignJWT({
      workflowId: payload.workflowId,
      stageNumber: payload.stageNumber,
      action,
      approverId: payload.approverId,
      tenantId: payload.tenantId,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiryHours}h`)
      .setSubject(payload.approverId)
      .sign(secretKey);

    const url = `${baseUrl}/v1/approvals/email-action?token=${encodeURIComponent(token)}&action=${action}`;

    links.push({ action, url, token, expiresAt });
  }

  return links;
}

/**
 * Validate a JWT action link token and return the decoded payload.
 * Throws if the token is expired, malformed, or has an invalid signature.
 */
export async function validateActionToken(
  token: string,
  secret: string
): Promise<ValidatedPayload> {
  const secretKey = new TextEncoder().encode(secret);

  const { payload } = await jose.jwtVerify(token, secretKey, {
    algorithms: ['HS256'],
  });

  const workflowId = payload.workflowId as string | undefined;
  const stageNumber = payload.stageNumber as number | undefined;
  const action = payload.action as string | undefined;
  const approverId = payload.approverId as string | undefined;
  const tenantId = payload.tenantId as string | undefined;

  if (!workflowId || stageNumber === undefined || !action || !approverId || !tenantId) {
    throw new Error('Invalid token payload: missing required fields');
  }

  if (!['approve', 'reject', 'request_info'].includes(action)) {
    throw new Error(`Invalid action in token: ${action}`);
  }

  return {
    workflowId,
    stageNumber,
    action: action as 'approve' | 'reject' | 'request_info',
    approverId,
    tenantId,
    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : '',
  };
}
