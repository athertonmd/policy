/**
 * Lambda handler: Rollback a policy rule to a previous version.
 * POST /v1/policies/rules/{ruleId}/rollback
 *
 * Accepts: targetVersion number.
 * Copies the target version's DSL/graph to the current rule,
 * increments version number, and recompiles the bundle.
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
import { rollbackToVersion, getActiveRules } from '../lib/rule-repository.js';
import {
  extractTenantId,
  extractUserId,
  successResponse,
  errorResponse,
} from './shared.js';

const s3Client = new S3Client({});
const eventBridgeClient = new EventBridgeClient({});

const BUNDLE_BUCKET = process.env.POLICY_BUNDLE_BUCKET ?? 'travel-policy-bundles';
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-events';

interface RollbackRequest {
  targetVersion: number;
}

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

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: RollbackRequest;
    try {
      request = JSON.parse(event.body) as RollbackRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate targetVersion
    if (!request.targetVersion || typeof request.targetVersion !== 'number' || request.targetVersion < 1) {
      return errorResponse(400, 'VALIDATION_ERROR', 'targetVersion must be a positive integer', requestId);
    }

    if (!Number.isInteger(request.targetVersion)) {
      return errorResponse(400, 'VALIDATION_ERROR', 'targetVersion must be an integer', requestId);
    }

    const userId = extractUserId(event);

    // Perform the rollback
    const result = await withDatabase(async (db) => {
      const rolledBackRule = await rollbackToVersion(
        db,
        tenantId,
        ruleId,
        request.targetVersion,
        userId
      );

      if (!rolledBackRule) {
        return null;
      }

      // If the rule is active, recompile the tenant bundle
      let activeRules: Array<{ dslSource: string; policyGraph: unknown }> = [];
      if (rolledBackRule.status === 'active') {
        activeRules = await getActiveRules(db, tenantId);
      }

      return { rolledBackRule, activeRules };
    });

    if (!result) {
      return errorResponse(
        404,
        'NOT_FOUND',
        `Rule ${ruleId} or target version ${request.targetVersion} not found`,
        requestId
      );
    }

    // Recompile bundle if the rule is active
    if (result.rolledBackRule.status === 'active' && result.activeRules.length > 0) {
      try {
        await recompileTenantBundle(tenantId, result.activeRules);
      } catch (bundleError) {
        console.error('Bundle recompilation failed after rollback:', bundleError);
      }
    }

    // Publish rollback event
    try {
      await eventBridgeClient.send(new PutEventsCommand({
        Entries: [{
          Source: 'travel-policy-platform.policy-configuration',
          DetailType: 'PolicyRuleRolledBack',
          Detail: JSON.stringify({
            tenantId,
            ruleId,
            targetVersion: request.targetVersion,
            newVersion: result.rolledBackRule.version,
            requestId,
            timestamp: new Date().toISOString(),
          }),
          EventBusName: EVENT_BUS_NAME,
        }],
      }));
    } catch (eventError) {
      console.error('Event publish failed:', eventError);
    }

    return successResponse(200, result.rolledBackRule, requestId);
  } catch (error) {
    console.error('Rollback version failed:', error);
    return errorResponse(
      500,
      'ROLLBACK_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

/**
 * Recompile the full tenant policy bundle from all active rules.
 */
async function recompileTenantBundle(
  tenantId: string,
  activeRules: Array<{ dslSource: string; policyGraph: unknown }>
): Promise<void> {
  if (activeRules.length === 0) {
    return;
  }

  const combinedDsl = activeRules.map(r => r.dslSource).join('\n\n');

  let ast;
  try {
    ast = parse(combinedDsl);
  } catch {
    console.warn('Combined DSL parse failed during rollback bundle recompilation');
    return;
  }

  const compilationResult = compile(ast);
  if (!compilationResult.success || !compilationResult.policyGraph) {
    console.warn('Combined compilation failed during rollback:', compilationResult.errors);
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
