/**
 * Lambda handler: Compile DSL source text.
 * POST /v1/policies/compile
 *
 * Accepts DSL source text, parses and compiles to PolicyGraph.
 * Returns CompilationResult (success/errors/warnings).
 * Does NOT save — just validates and returns the compiled graph.
 *
 * Requirements: 4.1, 4.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { parse } from '../dsl/parser.js';
import { compile } from '../dsl/compiler.js';
import {
  extractTenantId,
  successResponse,
  errorResponse,
} from './shared.js';

interface CompileDSLRequest {
  dslSource: string;
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

    // Parse request body
    if (!event.body) {
      return errorResponse(400, 'MISSING_BODY', 'Request body is required', requestId);
    }

    let request: CompileDSLRequest;
    try {
      request = JSON.parse(event.body) as CompileDSLRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    if (!request.dslSource || typeof request.dslSource !== 'string') {
      return errorResponse(400, 'VALIDATION_ERROR', 'dslSource is required and must be a string', requestId);
    }

    if (request.dslSource.trim().length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'dslSource cannot be empty', requestId);
    }

    // Parse the DSL source
    let ast;
    try {
      ast = parse(request.dslSource);
    } catch (parseError: unknown) {
      const err = parseError as { message?: string; location?: { start: { line: number; column: number } }; expected?: Array<{ description: string }> };
      return successResponse(200, {
        success: false,
        errors: [{
          type: 'syntax',
          message: err.message ?? 'Parse error',
          line: err.location?.start?.line ?? 1,
          column: err.location?.start?.column ?? 1,
          expected: err.expected?.map((e: { description: string }) => e.description),
        }],
      }, requestId);
    }

    // Compile AST to PolicyGraph
    const compilationResult = compile(ast);

    return successResponse(200, compilationResult, requestId);
  } catch (error) {
    console.error('Compile DSL failed:', error);
    return errorResponse(
      500,
      'COMPILATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred',
      requestId
    );
  }
}
