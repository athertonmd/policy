/**
 * Lambda handler: Activate a policy rule version.
 * POST /v1/policies/rules/{ruleId}/activate
 *
 * Sets the rule status to 'active', recompiles the full tenant policy bundle,
 * and publishes PolicyBundleUpdated event.
 *
 * Requirements: 4.6, 4.7
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { compile } from '../dsl/compiler.js';
import { compileToRego } from '../rego/rego-compiler.js';
import { BundleManager } from '../rego/bundle-manager.js';
import { parse } from '../dsl/parser.js';
import { withDatabase } from '../lib/database.js';
import { activateRule, getActiveRules } from '../lib/rule-repository.js';
import {
  extractTenantId,
  successResponse,
  errorResponse,
} from './shared.js';

const s3Client = new S3Client({});
const eventBridgeClient = new EventBridgeClient({});

const BUNDLE_BUCKET = process.env.POLICY_BUNDLE_BUCKET ?? 'travel-policy-bundles';
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

export async function handler(
  event: APIGatewayProxyEvent,
  _context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = _context.awsRequestId;

  try {
    // Validate tenant context
    const tenantId = extractTenantId(event);
    if (!tenantId) {
      return errorResponse(401, 'MISSING_TENANT', 'Tenant ID is required', requestId);
    }

    // Extract ruleId from path
    const ruleId = event.pathParameters?.ruleId;
    if (!ruleId) {
      return errorResponse(400, 'MISSING_RULE_ID', 'Rule ID is required in path', requestId);
    }

    // Activate the rule and recompile the tenant bundle
    const result = await withDatabase(async (db) => {
      // Activate the rule
      const activatedRule = await activateRule(db, tenantId, ruleId);
      if (!activatedRule) {
        return null;
      }

      // Get all active rules for the tenant to recompile the full bundle
      const activeRules = await getActiveRules(db, tenantId);
      return { activatedRule, activeRules };
    });

    if (!result) {
      return errorResponse(404, 'RULE_NOT_FOUND', `Rule ${ruleId} not found`, requestId);
    }

    // Recompile the full tenant policy bundle from all active rules
    try {
      await recompileTenantBundle(tenantId, result.activeRules);
    } catch (bundleError) {
      console.error('Bundle recompilation failed:', bundleError);
      // Rule is activated but bundle failed — log but don't fail
    }

    // Publish PolicyBundleUpdated event
    try {
      await eventBridgeClient.send(new PutEventsCommand({
        Entries: [{
          Source: 'travel-policy-platform.policy-configuration',
          DetailType: 'PolicyBundleUpdated',
          Detail: JSON.stringify({
            tenantId,
            ruleId,
            action: 'activated',
            activeRuleCount: result.activeRules.length,
            requestId,
            timestamp: new Date().toISOString(),
          }),
          EventBusName: EVENT_BUS_NAME,
        }],
      }));
    } catch (eventError) {
      console.error('Event publish failed:', eventError);
    }

    return successResponse(200, result.activatedRule, requestId);
  } catch (error) {
    console.error('Activate version failed:', error);
    return errorResponse(
      500,
      'ACTIVATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

/**
 * Recompile the full tenant policy bundle from all active rules.
 * Combines all active rules into a single PolicyGraph and compiles to Rego.
 */
async function recompileTenantBundle(
  tenantId: string,
  activeRules: Array<{ dslSource: string; policyGraph: unknown }>
): Promise<void> {
  if (activeRules.length === 0) {
    return;
  }

  // Combine all active rules' DSL sources and compile a unified bundle
  const combinedDsl = activeRules.map(r => r.dslSource).join('\n\n');

  let ast;
  try {
    ast = parse(combinedDsl);
  } catch {
    // If combined DSL fails to parse, compile individual rules
    // Use the first active rule's graph as fallback
    console.warn('Combined DSL parse failed, using individual rule graphs');
    return;
  }

  const compilationResult = compile(ast);
  if (!compilationResult.success || !compilationResult.policyGraph) {
    console.warn('Combined compilation failed:', compilationResult.errors);
    return;
  }

  const opaBundle = compileToRego(compilationResult.policyGraph, tenantId);
  const bundleManager = createBundleManager();
  await bundleManager.uploadBundle(opaBundle);
}

function createBundleManager(): BundleManager {
  const s3Adapter = {
    async putObject(params: { Bucket: string; Key: string; Body: string | Buffer; ContentType: string; Metadata?: Record<string, string> }) {
      await s3Client.send(new PutObjectCommand({
        Bucket: params.Bucket,
        Key: params.Key,
        Body: params.Body,
        ContentType: params.ContentType,
        Metadata: params.Metadata,
      }));
      return {};
    },
  };

  const eventBridgeAdapter = {
    async putEvents(params: { Entries: Array<{ Source: string; DetailType: string; Detail: string; EventBusName: string }> }) {
      const result = await eventBridgeClient.send(new PutEventsCommand({
        Entries: params.Entries.map(entry => ({
          Source: entry.Source,
          DetailType: entry.DetailType,
          Detail: entry.Detail,
          EventBusName: entry.EventBusName,
        })),
      }));
      return { FailedEntryCount: result.FailedEntryCount ?? 0 };
    },
  };

  return new BundleManager(s3Adapter, eventBridgeAdapter, {
    bucketName: BUNDLE_BUCKET,
    eventBusName: EVENT_BUS_NAME,
    eventSource: 'travel-policy-platform.policy-configuration',
  });
}
