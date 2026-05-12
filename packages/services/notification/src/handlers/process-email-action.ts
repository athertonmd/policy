/**
 * Lambda handler: Process email-based approval action links.
 * GET /v1/approvals/email-action?token={jwt}
 *
 * Validates the JWT token from the action link, checks expiry,
 * extracts workflow context, and submits the approval action.
 * Returns an HTML response confirming the action or showing an error.
 *
 * Requirements: 9.2, 27.1, 27.2, 27.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

import { validateEmailActionToken } from '../lib/email-action-validator.js';

const secretsClient = new SecretsManagerClient({});

const ACTION_LINK_SECRET_ARN = process.env.ACTION_LINK_SECRET_ARN ?? '';
const PLATFORM_UI_URL = process.env.PLATFORM_UI_URL ?? 'https://app.travel-policy.example.com';
const APPROVAL_API_URL = process.env.APPROVAL_API_URL ?? '';

let cachedSecret: string | null = null;

async function getActionLinkSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  if (!ACTION_LINK_SECRET_ARN) {
    return process.env.ACTION_LINK_SECRET ?? 'dev-secret-key';
  }

  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: ACTION_LINK_SECRET_ARN })
  );
  cachedSecret = result.SecretString ?? '';
  return cachedSecret;
}

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;
  const token = event.queryStringParameters?.token;

  console.log('Processing email action link', { requestId, hasToken: !!token });

  if (!token) {
    return htmlResponse(400, renderErrorPage('Missing Token', 'No action token was provided in the link.'));
  }

  const secret = await getActionLinkSecret();
  const validationResult = await validateEmailActionToken(token, secret);

  if (!validationResult.valid) {
    if (validationResult.expired) {
      // 410 Gone — token has expired, redirect to UI
      console.log('Action link expired', { requestId });
      return htmlResponse(
        410,
        renderExpiredPage()
      );
    }

    // Invalid token (malformed, wrong signature, etc.)
    console.error('Invalid action token', { requestId, error: validationResult.error });
    return htmlResponse(400, renderErrorPage('Invalid Link', 'This approval link is invalid or has been tampered with.'));
  }

  const { payload } = validationResult;

  console.log('Token validated', {
    requestId,
    workflowId: payload.workflowId,
    action: payload.action,
    approverId: payload.approverId,
    stageNumber: payload.stageNumber,
  });

  // Submit the approval action to the workflow service
  try {
    await submitApprovalAction({
      workflowId: payload.workflowId,
      stageNumber: payload.stageNumber,
      approverId: payload.approverId,
      action: payload.action,
      tenantId: payload.tenantId,
      source: 'email',
    });

    const actionLabel = formatActionLabel(payload.action);
    console.log('Email action submitted successfully', {
      requestId,
      workflowId: payload.workflowId,
      action: payload.action,
    });

    return htmlResponse(200, renderSuccessPage(actionLabel, payload.workflowId));
  } catch (error) {
    console.error('Failed to submit approval action', {
      requestId,
      workflowId: payload.workflowId,
      error: error instanceof Error ? error.message : error,
    });

    return htmlResponse(
      500,
      renderErrorPage(
        'Action Failed',
        'We could not process your approval action. Please try again from the platform.'
      )
    );
  }
}

/**
 * Submit the approval action to the approval workflow service.
 * In production, this calls the approval API endpoint or invokes the Lambda directly.
 */
async function submitApprovalAction(params: {
  workflowId: string;
  stageNumber: number;
  approverId: string;
  action: string;
  tenantId: string;
  source: string;
}): Promise<void> {
  const apiUrl = APPROVAL_API_URL || process.env.APPROVAL_API_URL;

  if (!apiUrl) {
    // Direct invocation fallback for local development
    console.log('No APPROVAL_API_URL configured, logging action', params);
    return;
  }

  const response = await fetch(`${apiUrl}/v1/approvals/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-Id': params.tenantId,
      'X-Source': params.source,
    },
    body: JSON.stringify({
      workflowId: params.workflowId,
      stageNumber: params.stageNumber,
      approverId: params.approverId,
      action: params.action,
      comment: `Action taken via email link`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Approval API returned ${response.status}: ${body}`);
  }
}

function formatActionLabel(action: string): string {
  switch (action) {
    case 'approve':
      return 'Approved';
    case 'reject':
      return 'Rejected';
    case 'request_info':
      return 'More Information Requested';
    default:
      return action;
  }
}

function htmlResponse(statusCode: number, body: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  };
}

function renderSuccessPage(actionLabel: string, workflowId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Action Confirmed - Travel Policy Platform</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #1e293b; margin: 0 0 12px; font-size: 24px; }
    p { color: #64748b; margin: 0 0 24px; line-height: 1.5; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>${actionLabel}</h1>
    <p>Your action has been recorded for workflow <strong>${workflowId}</strong>.</p>
    <p><a href="${PLATFORM_UI_URL}/approvals">View in Platform →</a></p>
  </div>
</body>
</html>`;
}

function renderExpiredPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Expired - Travel Policy Platform</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #1e293b; margin: 0 0 12px; font-size: 24px; }
    p { color: #64748b; margin: 0 0 24px; line-height: 1.5; }
    a.btn { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; }
    a.btn:hover { background: #1d4ed8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏰</div>
    <h1>Link Expired</h1>
    <p>This approval link has expired. For security, action links are only valid for a limited time.</p>
    <p>Please log in to the platform to complete this action.</p>
    <a class="btn" href="${PLATFORM_UI_URL}/approvals">Go to Platform</a>
  </div>
</body>
</html>`;
}

function renderErrorPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Travel Policy Platform</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f8fafc; }
    .card { background: white; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { color: #1e293b; margin: 0 0 12px; font-size: 24px; }
    p { color: #64748b; margin: 0 0 24px; line-height: 1.5; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⚠️</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p><a href="${PLATFORM_UI_URL}/approvals">Go to Platform →</a></p>
  </div>
</body>
</html>`;
}
