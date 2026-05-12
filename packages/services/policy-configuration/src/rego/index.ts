/**
 * Rego Compiler and OPA Bundle Manager module
 *
 * Provides compilation of PolicyGraph into OPA Rego bundles,
 * S3 upload management, and EventBridge notification publishing.
 */

export {
  compileToRego,
  sanitizeIdentifier,
  type RegoModule,
  type DataDocument,
  type BundleManifest,
  type OPABundleConfig,
  type RegoCompilerOptions,
} from './rego-compiler.js';

export {
  BundleManager,
  type S3Client,
  type EventBridgeClient,
  type BundleManagerConfig,
  type BundleUploadResult,
  type PolicyBundleUpdatedEvent,
} from './bundle-manager.js';
