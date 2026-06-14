/**
 * PNR Webhook Handler — Express.js handler for Sabre PNR change notifications.
 *
 * Receives webhook events from Sabre when PNRs are created, modified, or cancelled.
 * Validates the webhook signature, parses the event, and forwards to our platform's
 * booking ingestion endpoint.
 */

import type { Request, Response, Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import type { SabreConfig } from '../config.js';
import type { PNRChangeNotification } from '../types/sabre-types.js';
import type { WebhookProcessingResult } from '../types/compliance-types.js';
import { parsePnrNotification } from './pnr-parser.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('pnr-webhook-handler');

/**
 * Creates an Express router that handles Sabre PNR webhook notifications.
 */
export function createPnrWebhookRouter(config: SabreConfig): Router {
  // Dynamic import to avoid requiring express at module load time
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  const router: Router = express.Router();

  router.post('/sabre/pnr-notifications', async (req: Request, res: Response) => {
    const result = await handlePnrWebhook(req, config);

    if (result.success) {
      res.status(200).json({
        status: 'accepted',
        recordLocator: result.recordLocator,
        action: result.action,
        internalBookingId: result.internalBookingId,
      });
    } else {
      const statusCode = result.error?.includes('signature') ? 401 : 500;
      res.status(statusCode).json({
        status: 'error',
        error: result.error,
      });
    }
  });

  // Health check endpoint for webhook monitoring
  router.get('/sabre/pnr-notifications/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  return router;
}

/**
 * Handles a single PNR webhook notification.
 * Can be used standalone (e.g., in a Lambda handler) without Express.
 */
export async function handlePnrWebhook(
  req: Request,
  config: SabreConfig
): Promise<WebhookProcessingResult> {
  try {
    // Step 1: Validate webhook signature
    const isValid = validateWebhookSignature(req, config.webhookSigningSecret);
    if (!isValid) {
      logger.warn('Invalid webhook signature received');
      return {
        success: false,
        recordLocator: '',
        action: 'booking_created',
        error: 'Invalid webhook signature',
      };
    }

    // Step 2: Parse the notification payload
    const notification = req.body as PNRChangeNotification;

    if (!notification.RecordLocator || !notification.Action) {
      logger.warn('Invalid webhook payload: missing required fields');
      return {
        success: false,
        recordLocator: '',
        action: 'booking_created',
        error: 'Invalid payload: missing RecordLocator or Action',
      };
    }

    logger.info('Processing PNR webhook', {
      action: notification.Action,
      recordLocator: notification.RecordLocator,
    });

    // Step 3: Parse into canonical format
    const canonicalEvent = parsePnrNotification(notification);

    // Step 4: Forward to our platform's booking ingestion webhook
    const internalBookingId = await forwardToIngestion(canonicalEvent, config);

    logger.info('PNR webhook processed successfully', {
      recordLocator: notification.RecordLocator,
      action: canonicalEvent.eventType,
      internalBookingId,
    });

    return {
      success: true,
      recordLocator: notification.RecordLocator,
      action: canonicalEvent.eventType,
      internalBookingId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('PNR webhook processing failed', error instanceof Error ? error : new Error(message));

    return {
      success: false,
      recordLocator: (req.body as PNRChangeNotification)?.RecordLocator ?? '',
      action: 'booking_created',
      error: message,
    };
  }
}

/**
 * Validates the webhook signature using HMAC-SHA256.
 * Sabre sends the signature in the X-Sabre-Signature header.
 */
function validateWebhookSignature(req: Request, secret: string): boolean {
  const signature = req.headers['x-sabre-signature'] as string | undefined;

  if (!signature) {
    logger.debug('No signature header present');
    return false;
  }

  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Forwards the canonical booking event to our platform's booking ingestion webhook.
 */
async function forwardToIngestion(
  event: ReturnType<typeof parsePnrNotification>,
  config: SabreConfig
): Promise<string> {
  const response = await fetch(config.bookingIngestionWebhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Source': 'sabre-connector',
      'X-Tenant-Id': config.tenantId,
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(config.requestTimeoutMs ?? 10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Booking ingestion failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json() as { bookingId: string };
  return result.bookingId;
}
