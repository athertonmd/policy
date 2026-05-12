/**
 * Bundle Loader
 * Loads and caches policy bundles (PolicyGraph) from S3/DynamoDB.
 * Supports cache invalidation via EventBridge notifications.
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import type { PolicyGraph } from '@travel-policy/shared';

export interface BundleCacheEntry {
  graph: PolicyGraph;
  loadedAt: number;
  version: string;
  checksum: string;
}

export interface BundleLoaderConfig {
  s3Bucket: string;
  s3KeyPrefix: string;
  dynamoTableName: string;
  cacheTtlMs: number;
  region: string;
}

const DEFAULT_CONFIG: BundleLoaderConfig = {
  s3Bucket: process.env['POLICY_BUNDLE_BUCKET'] ?? 'travel-policy-bundles',
  s3KeyPrefix: process.env['POLICY_BUNDLE_PREFIX'] ?? 'bundles/',
  dynamoTableName: process.env['POLICY_BUNDLE_TABLE'] ?? 'PolicyBundleCache',
  cacheTtlMs: Number(process.env['BUNDLE_CACHE_TTL_MS'] ?? 300000), // 5 minutes default
  region: process.env['AWS_REGION'] ?? 'eu-west-2',
};

/**
 * In-memory cache for policy bundles, keyed by tenantId.
 * Module-level variable persists across Lambda invocations within the same execution context.
 */
let bundleCache: Map<string, BundleCacheEntry> = new Map();

let s3Client: S3Client | null = null;
let dynamoClient: DynamoDBClient | null = null;

function getS3Client(config: BundleLoaderConfig): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region: config.region });
  }
  return s3Client;
}

function getDynamoClient(config: BundleLoaderConfig): DynamoDBClient {
  if (!dynamoClient) {
    dynamoClient = new DynamoDBClient({ region: config.region });
  }
  return dynamoClient;
}

/**
 * Loads the policy graph for a tenant.
 * Uses in-memory cache with TTL, falling back to DynamoDB metadata then S3 for the actual bundle.
 */
export async function loadPolicyGraph(
  tenantId: string,
  config: BundleLoaderConfig = DEFAULT_CONFIG
): Promise<PolicyGraph> {
  // Check in-memory cache first
  const cached = bundleCache.get(tenantId);
  if (cached && !isCacheExpired(cached, config.cacheTtlMs)) {
    return cached.graph;
  }

  // Look up bundle metadata from DynamoDB
  const bundleMetadata = await getBundleMetadata(tenantId, config);

  // If we have a cached version and it matches, return it
  if (cached && bundleMetadata && cached.version === bundleMetadata.version) {
    // Update loadedAt to extend cache
    cached.loadedAt = Date.now();
    return cached.graph;
  }

  // Load the actual bundle from S3
  const s3Key = bundleMetadata?.s3Key ?? `${config.s3KeyPrefix}${tenantId}/latest.json`;
  const graph = await loadGraphFromS3(s3Key, config);

  // Cache the loaded graph
  bundleCache.set(tenantId, {
    graph,
    loadedAt: Date.now(),
    version: bundleMetadata?.version ?? graph.version.toString(),
    checksum: bundleMetadata?.checksum ?? graph.metadata.checksum,
  });

  return graph;
}

/**
 * Invalidates the cached bundle for a specific tenant.
 * Called when an EventBridge PolicyBundleUpdated event is received.
 */
export function invalidateCache(tenantId: string): void {
  bundleCache.delete(tenantId);
}

/**
 * Invalidates all cached bundles.
 * Useful for full cache flush scenarios.
 */
export function invalidateAllCaches(): void {
  bundleCache = new Map();
}

/**
 * Returns the current cache state for monitoring/debugging.
 */
export function getCacheStats(): { size: number; tenants: string[] } {
  return {
    size: bundleCache.size,
    tenants: Array.from(bundleCache.keys()),
  };
}

/**
 * Checks if a cache entry has expired based on TTL.
 */
function isCacheExpired(entry: BundleCacheEntry, ttlMs: number): boolean {
  return Date.now() - entry.loadedAt > ttlMs;
}

interface BundleMetadata {
  version: string;
  s3Key: string;
  checksum: string;
}

/**
 * Retrieves bundle metadata from DynamoDB PolicyBundleCache table.
 */
async function getBundleMetadata(
  tenantId: string,
  config: BundleLoaderConfig
): Promise<BundleMetadata | null> {
  try {
    const client = getDynamoClient(config);
    const response = await client.send(
      new GetItemCommand({
        TableName: config.dynamoTableName,
        Key: {
          tenantId: { S: tenantId },
          bundleVersion: { S: 'LATEST' },
        },
      })
    );

    if (!response.Item) {
      return null;
    }

    return {
      version: response.Item['bundleVersion']?.S ?? '0',
      s3Key: response.Item['bundleS3Key']?.S ?? '',
      checksum: response.Item['checksum']?.S ?? '',
    };
  } catch (error) {
    // If DynamoDB is unavailable, fall back to S3 directly
    console.warn(`Failed to get bundle metadata for tenant ${tenantId}:`, error);
    return null;
  }
}

/**
 * Loads a PolicyGraph JSON from S3.
 */
async function loadGraphFromS3(
  s3Key: string,
  config: BundleLoaderConfig
): Promise<PolicyGraph> {
  const client = getS3Client(config);
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: s3Key,
    })
  );

  const body = await response.Body?.transformToString();
  if (!body) {
    throw new Error(`Empty policy bundle at s3://${config.s3Bucket}/${s3Key}`);
  }

  const graph = JSON.parse(body) as PolicyGraph;

  // Basic validation
  if (!graph.graphId || !graph.rootNodeId || !graph.nodes || !graph.edges) {
    throw new Error(`Invalid policy graph structure at s3://${config.s3Bucket}/${s3Key}`);
  }

  return graph;
}

/**
 * Allows injecting mock clients for testing.
 */
export function _resetClients(): void {
  s3Client = null;
  dynamoClient = null;
  bundleCache = new Map();
}
