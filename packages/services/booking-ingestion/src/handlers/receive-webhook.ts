/**
 * Lambda handler for webhook ingestion endpoint.
 * POST /v1/webhooks/{integrationId}
 *
 * Validates HMAC-SHA256 signature, parses payload, checks idempotency,
 * and queues events for async processing. Must acknowledge within 2 seconds.
 *
 * Requirements: 7.1, 7.3, 7.6
 */
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { validateSignature } from '../lib/signature-validator.js';
import { checkIdempotency, recordIdempotency } from '../lib/idempotency.js';
import { randomUUID } from 'crypto';

const sqsClient = new SQSClient({});
const secretsClient = new SecretsManagerClient({});

const QUEUE_URL = process.env.BOOKING_EVENTS_QUEUE_URL ?? '';
const SIGNATURE_HEADER = 'x-webhook-signature';
const IDEMPOTENCY_HEADER = 'x-idempotency-key';

interface WebhookSecretConfig {
  webhookSecret: string;
}

// Cache integration secrets to avoid repeated Secrets Manager calls
const secretCache = new Map<string, { secret: string; expiresAt: number }>();
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Retrieves the webhook secret for an integration from Secrets Manager.
 */
async function getIntegrationSecret(integrationId: string): Promise<string | null> {
  const now = Date.now();
  const cached = secretCache.get(integrationId);
  if (cached && now < cached.expiresAt) {
    return cached.secret;
  }

  const secretName =
    process.env.INTEGRATION_SECRET_PREFIX
      ? `${process.env.INTEGRATION_SECRET_PREFIX}/${integrationId}`
      : `travel-policy/integrations/${integrationId}`;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    if (!response.SecretString) {
      return null;
    }

    const config = JSON.parse(response.SecretString) as WebhookSecretConfig;
    secretCache.set(integrationId, {
      secret: config.webhookSecret,
      expiresAt: now + SECRET_CACHE_TTL_MS,
    });

    return config.webhookSecret;
  } catch {
    return null;
  }
}

/**
 * Creates a structured error response.
 */
function errorResponse(
  statusCode: number,
  code: string,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: {
        code,
        message,
      },
    }),
  };
}

/**
 * Creates a success response.
 */
function successResponse(
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/**
 * Main Lambda handler for receiving webhook events.
 */
export async function handler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const integrationId = event.pathParameters?.integrationId;

  if (!integrationId) {
    return errorResponse(400, 'MISSING_INTEGRATION_ID', 'Integration ID is required in the path');
  }

  // Extract signature from headers (case-insensitive)
  const signature =
    event.headers[SIGNATURE_HEADER] ??
    event.headers[SIGNATURE_HEADER.toUpperCase()] ??
    event.headers['X-Webhook-Signature'];

  if (!signature) {
    return errorResponse(400, 'MISSING_SIGNATURE', 'Webhook signature header is required');
  }

  // Extract idempotency key from headers
  const idempotencyKey =
    event.headers[IDEMPOTENCY_HEADER] ??
    event.headers[IDEMPOTENCY_HEADER.toUpperCase()] ??
    event.headers['X-Idempotency-Key'];

  if (!idempotencyKey) {
    return errorResponse(400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency key header is required');
  }

  // Validate request body exists
  const rawBody = event.body;
  if (!rawBody) {
    return errorResponse(400, 'MISSING_BODY', 'Request body is required');
  }

  // Retrieve integration secret for signature validation
  const secret = await getIntegrationSecret(integrationId);
  if (!secret) {
    return errorResponse(400, 'INVALID_INTEGRATION', 'Integration not found or not configured');
  }

  // Validate HMAC-SHA256 signature
  if (!validateSignature(rawBody, signature, secret)) {
    return errorResponse(400, 'INVALID_SIGNATURE', 'Webhook signature validation failed');
  }

  // Parse JSON payload
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body is not valid JSON');
  }

  // Check idempotency — if already processed, return 200
  const isDuplicate = await checkIdempotency(integrationId, idempotencyKey);
  if (isDuplicate) {
    return successResponse(200, {
      message: 'Event already processed',
      idempotencyKey,
    });
  }

  // Record idempotency key
  await recordIdempotency(integrationId, idempotencyKey);

  // Generate event ID and queue for async processing
  const eventId = randomUUID();
  const receivedAt = new Date().toISOString();

  await sqsClient.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({
        eventId,
        integrationId,
        idempotencyKey,
        payload,
        receivedAt,
      }),
      MessageAttributes: {
        integrationId: {
          DataType: 'String',
          StringValue: integrationId,
        },
        eventId: {
          DataType: 'String',
          StringValue: eventId,
        },
      },
    })
  );

  // Return 202 Accepted — fast path, no heavy processing
  return successResponse(202, {
    acknowledged: true,
    eventId,
    receivedAt,
  });
}
