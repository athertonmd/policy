/**
 * Lambda handler: Save a policy rule.
 * POST /v1/policies/rules
 *
 * Accepts: name, dslSource, priority, effectiveFrom, effectiveTo
 * Parses, compiles, validates, stores in tenant's policy_rules table,
 * creates version entry, compiles to Rego bundle, uploads to S3,
 * and publishes PolicyRuleChanged event to EventBridge.
 *
 * Requirements: 4.1, 4.3, 4.6
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import type { PolicyRuleInput } from '@travel-policy/shared';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { parse } from '../dsl/parser.js';
import { compile } from '../dsl/compiler.js';
import { compileToRego } from '../rego/rego-compiler.js';
import { BundleManager } from '../rego/bundle-manager.js';
import { withDatabase } from '../lib/database.js';
import { saveRule } from '../lib/rule-repository.js';
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

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: PolicyRuleInput;
    try {
      request = JSON.parse(event.body) as PolicyRuleInput;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate required fields
    const validationError = validateSaveRuleRequest(request);
    if (validationError) {
      return errorResponse(400, 'VALIDATION_ERROR', validationError, requestId);
    }

    // Parse the DSL source
    let ast;
    try {
      ast = parse(request.dslSource);
    } catch (parseError: unknown) {
      const err = parseError as { message?: string; location?: { start: { line: number; column: number } } };
      return errorResponse(
        400,
        'DSL_PARSE_ERROR',
        `DSL parse error: ${err.message ?? 'Unknown parse error'}`,
        requestId
      );
    }

    // Compile AST to PolicyGraph
    const compilationResult = compile(ast);
    if (!compilationResult.success || !compilationResult.policyGraph) {
      return errorResponse(
        400,
        'DSL_COMPILATION_ERROR',
        `DSL compilation failed: ${compilationResult.errors?.map(e => e.message).join('; ') ?? 'Unknown error'}`,
        requestId
      );
    }

    const userId = extractUserId(event);

    // Save to database
    const savedRule = await withDatabase(async (db) => {
      return saveRule(db, {
        tenantId,
        name: request.name,
        description: request.description,
        dslSource: request.dslSource,
        policyGraph: compilationResult.policyGraph!,
        priority: request.priority,
        effectiveFrom: request.effectiveFrom,
        effectiveTo: request.effectiveTo,
        createdBy: userId,
      });
    });

    // Compile to Rego bundle and upload to S3
    try {
      const opaBundle = compileToRego(compilationResult.policyGraph, tenantId);
      const bundleManager = createBundleManager();
      await bundleManager.uploadBundle(opaBundle);
    } catch (bundleError) {
      console.error('Bundle upload failed (rule saved successfully):', bundleError);
      // Rule is saved but bundle upload failed — log but don't fail the request
    }

    // Publish PolicyRuleChanged event
    try {
      await publishRuleChangedEvent(tenantId, savedRule.ruleId, 'created', requestId);
    } catch (eventError) {
      console.error('Event publish failed (rule saved successfully):', eventError);
    }

    return successResponse(201, savedRule, requestId);
  } catch (error) {
    console.error('Save rule failed:', error);
    return errorResponse(
      500,
      'SAVE_RULE_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}

function validateSaveRuleRequest(request: PolicyRuleInput): string | null {
  if (!request.name || request.name.trim().length === 0) {
    return 'name is required';
  }
  if (request.name.length > 255) {
    return 'name must be 255 characters or fewer';
  }
  if (!request.dslSource || request.dslSource.trim().length === 0) {
    return 'dslSource is required';
  }
  if (request.priority === undefined || request.priority === null) {
    return 'priority is required';
  }
  if (typeof request.priority !== 'number' || request.priority < 0) {
    return 'priority must be a non-negative number';
  }
  if (request.effectiveFrom && isNaN(Date.parse(request.effectiveFrom))) {
    return 'effectiveFrom must be a valid ISO date string';
  }
  if (request.effectiveTo && isNaN(Date.parse(request.effectiveTo))) {
    return 'effectiveTo must be a valid ISO date string';
  }
  if (request.effectiveFrom && request.effectiveTo) {
    if (new Date(request.effectiveFrom) >= new Date(request.effectiveTo)) {
      return 'effectiveFrom must be before effectiveTo';
    }
  }
  return null;
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

async function publishRuleChangedEvent(
  tenantId: string,
  ruleId: string,
  action: string,
  requestId: string
): Promise<void> {
  await eventBridgeClient.send(new PutEventsCommand({
    Entries: [{
      Source: 'travel-policy-platform.policy-configuration',
      DetailType: 'PolicyRuleChanged',
      Detail: JSON.stringify({
        tenantId,
        ruleId,
        action,
        requestId,
        timestamp: new Date().toISOString(),
      }),
      EventBusName: EVENT_BUS_NAME,
    }],
  }));
}
