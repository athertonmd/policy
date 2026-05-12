/**
 * OPA Bundle Manager
 *
 * Manages S3 upload of compiled OPA bundles and publishes
 * bundle update events to EventBridge.
 *
 * Validates: Requirements 4.1, 5.3
 */

import type { OPABundleConfig, RegoModule, DataDocument, BundleManifest } from './rego-compiler.js';

/** S3 client interface for bundle storage */
export interface S3Client {
  putObject(params: {
    Bucket: string;
    Key: string;
    Body: string | Buffer;
    ContentType: string;
    Metadata?: Record<string, string>;
  }): Promise<{ VersionId?: string }>;
}

/** EventBridge client interface for publishing events */
export interface EventBridgeClient {
  putEvents(params: {
    Entries: EventBridgeEntry[];
  }): Promise<{ FailedEntryCount: number }>;
}

interface EventBridgeEntry {
  Source: string;
  DetailType: string;
  Detail: string;
  EventBusName: string;
}

/** Configuration for the bundle manager */
export interface BundleManagerConfig {
  /** S3 bucket name for storing bundles */
  bucketName: string;
  /** S3 key prefix for bundles */
  keyPrefix?: string;
  /** EventBridge event bus name */
  eventBusName: string;
  /** EventBridge event source */
  eventSource?: string;
}

/** Result of a bundle upload operation */
export interface BundleUploadResult {
  bucketName: string;
  bundleKey: string;
  versionId?: string;
  manifestKey: string;
  moduleCount: number;
  uploadedAt: string;
}

/** Event published when a bundle is updated */
export interface PolicyBundleUpdatedEvent {
  version: '1.0';
  tenantId: string;
  bundleId: string;
  bundleKey: string;
  versionId?: string;
  graphId: string;
  graphVersion: number;
  moduleCount: number;
  updatedAt: string;
}

/**
 * Manages OPA bundle lifecycle: upload to S3 and publish update events.
 */
export class BundleManager {
  private readonly s3: S3Client;
  private readonly eventBridge: EventBridgeClient;
  private readonly config: BundleManagerConfig;

  constructor(
    s3: S3Client,
    eventBridge: EventBridgeClient,
    config: BundleManagerConfig
  ) {
    this.s3 = s3;
    this.eventBridge = eventBridge;
    this.config = config;
  }

  /**
   * Upload an OPA bundle to S3 and publish an update event.
   *
   * @param bundle - The compiled OPA bundle configuration
   * @returns Upload result with S3 keys and version info
   */
  async uploadBundle(bundle: OPABundleConfig): Promise<BundleUploadResult> {
    const keyPrefix = this.config.keyPrefix
      ? `${this.config.keyPrefix}/${bundle.tenantId}`
      : `bundles/${bundle.tenantId}`;

    const bundleKey = `${keyPrefix}/${bundle.bundleId}`;

    // Upload each Rego module
    for (const module of bundle.regoModules) {
      await this.s3.putObject({
        Bucket: this.config.bucketName,
        Key: `${bundleKey}/${module.path}`,
        Body: module.content,
        ContentType: 'text/plain',
        Metadata: {
          'bundle-id': bundle.bundleId,
          'tenant-id': bundle.tenantId,
        },
      });
    }

    // Upload data documents
    for (const doc of bundle.dataDocuments) {
      await this.s3.putObject({
        Bucket: this.config.bucketName,
        Key: `${bundleKey}/${doc.path}`,
        Body: JSON.stringify(doc.content, null, 2),
        ContentType: 'application/json',
        Metadata: {
          'bundle-id': bundle.bundleId,
          'tenant-id': bundle.tenantId,
        },
      });
    }

    // Upload manifest
    const manifestKey = `${bundleKey}/.manifest`;
    const manifestResult = await this.s3.putObject({
      Bucket: this.config.bucketName,
      Key: manifestKey,
      Body: JSON.stringify(bundle.manifest, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'bundle-id': bundle.bundleId,
        'tenant-id': bundle.tenantId,
        revision: bundle.manifest.revision,
      },
    });

    const uploadResult: BundleUploadResult = {
      bucketName: this.config.bucketName,
      bundleKey,
      versionId: manifestResult.VersionId,
      manifestKey,
      moduleCount: bundle.regoModules.length,
      uploadedAt: new Date().toISOString(),
    };

    // Publish bundle update event
    await this.publishBundleUpdatedEvent(bundle, uploadResult);

    return uploadResult;
  }

  /**
   * Publish a PolicyBundleUpdated event to EventBridge.
   */
  private async publishBundleUpdatedEvent(
    bundle: OPABundleConfig,
    uploadResult: BundleUploadResult
  ): Promise<void> {
    const event: PolicyBundleUpdatedEvent = {
      version: '1.0',
      tenantId: bundle.tenantId,
      bundleId: bundle.bundleId,
      bundleKey: uploadResult.bundleKey,
      versionId: uploadResult.versionId,
      graphId: bundle.manifest.metadata.graphId,
      graphVersion: bundle.manifest.metadata.graphVersion,
      moduleCount: uploadResult.moduleCount,
      updatedAt: uploadResult.uploadedAt,
    };

    const result = await this.eventBridge.putEvents({
      Entries: [
        {
          Source: this.config.eventSource ?? 'travel-policy-platform',
          DetailType: 'PolicyBundleUpdated',
          Detail: JSON.stringify({
            tenantId: bundle.tenantId,
            correlationId: bundle.bundleId,
            aggregateId: bundle.manifest.metadata.graphId,
            aggregateType: 'PolicyBundle',
            payload: event,
          }),
          EventBusName: this.config.eventBusName,
        },
      ],
    });

    if (result.FailedEntryCount > 0) {
      throw new Error(
        `Failed to publish PolicyBundleUpdated event for bundle ${bundle.bundleId}`
      );
    }
  }

  /**
   * Generate the S3 key for a bundle.
   * Useful for constructing bundle references without uploading.
   */
  getBundleKey(tenantId: string, bundleId: string): string {
    const keyPrefix = this.config.keyPrefix
      ? `${this.config.keyPrefix}/${tenantId}`
      : `bundles/${tenantId}`;
    return `${keyPrefix}/${bundleId}`;
  }
}
