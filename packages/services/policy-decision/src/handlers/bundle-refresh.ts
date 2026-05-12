/**
 * Lambda Handler: EventBridge — PolicyBundleUpdated
 * Invalidates the in-memory policy bundle cache when a tenant's policy is updated.
 */

import { invalidateCache, invalidateAllCaches } from '../engine/bundle-loader.js';

export interface EventBridgeEvent {
  version: string;
  id: string;
  source: string;
  'detail-type': string;
  time: string;
  region: string;
  resources: string[];
  detail: PolicyBundleUpdatedDetail;
}

export interface PolicyBundleUpdatedDetail {
  tenantId: string;
  correlationId: string;
  aggregateId: string;
  aggregateType: string;
  payload: {
    bundleVersion?: string;
    previousVersion?: string;
    updatedAt?: string;
    reason?: string;
  };
}

export interface EventBridgeResponse {
  statusCode: number;
  body: string;
}

/**
 * Lambda handler for PolicyBundleUpdated EventBridge events.
 * Invalidates the cached policy graph for the affected tenant.
 */
export async function handler(event: EventBridgeEvent): Promise<EventBridgeResponse> {
  try {
    const detailType = event['detail-type'];
    const tenantId = event.detail?.tenantId;

    console.info('Received event:', {
      detailType,
      tenantId,
      correlationId: event.detail?.correlationId,
      bundleVersion: event.detail?.payload?.bundleVersion,
    });

    if (detailType === 'PolicyBundleUpdated') {
      if (tenantId) {
        invalidateCache(tenantId);
        console.info(`Cache invalidated for tenant: ${tenantId}`);
      } else {
        // If no tenantId, invalidate all caches as a safety measure
        invalidateAllCaches();
        console.warn('No tenantId in event, invalidated all caches');
      }
    } else if (detailType === 'PolicyBundleInvalidateAll') {
      invalidateAllCaches();
      console.info('All caches invalidated');
    } else {
      console.warn(`Unhandled event type: ${detailType}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Cache invalidation processed',
        tenantId: tenantId ?? 'all',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error('Bundle refresh handler failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to process cache invalidation',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}
