/**
 * Lambda handler: Run Policy Simulation
 * POST /v1/policies/simulate
 *
 * Evaluates draft policy rules against historical trip data and produces
 * a comparison report showing the impact of proposed changes.
 *
 * The simulation never affects live decisions — it uses its own graph
 * instances and reads historical data in a read-only manner.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { parse } from '../dsl/parser.js';
import { compile } from '../dsl/compiler.js';
import { runSimulationEngine, type SimulationInput } from '../lib/simulation-engine.js';
import { withDatabase } from '../lib/database.js';
import {
  extractTenantId,
  successResponse,
  errorResponse,
} from './shared.js';
import type {
  PolicyGraph,
  PolicyDecisionRequest,
  SimulationReport,
} from '@travel-policy/shared';

const s3Client = new S3Client({});
const SIMULATION_BUCKET = process.env.SIMULATION_RESULTS_BUCKET ?? 'travel-policy-simulation-results';
const SIMULATION_RETENTION_DAYS = 90;

interface SimulateRequest {
  draftDslSource: string;
  dateRange?: { from: string; to: string };
  sampleSize?: number;
  historicalTripIds?: string[];
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

    let request: SimulateRequest;
    try {
      request = JSON.parse(event.body) as SimulateRequest;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON', requestId);
    }

    // Validate required fields
    if (!request.draftDslSource || typeof request.draftDslSource !== 'string') {
      return errorResponse(
        400,
        'VALIDATION_ERROR',
        'draftDslSource is required and must be a string',
        requestId
      );
    }

    if (request.draftDslSource.trim().length === 0) {
      return errorResponse(400, 'VALIDATION_ERROR', 'draftDslSource cannot be empty', requestId);
    }

    // Compile draft DSL into a PolicyGraph
    let draftGraph: PolicyGraph;
    try {
      const ast = parse(request.draftDslSource);
      const compilationResult = compile(ast);

      if (!compilationResult.success || !compilationResult.policyGraph) {
        return errorResponse(
          400,
          'COMPILATION_ERROR',
          `Draft DSL compilation failed: ${compilationResult.errors?.map((e) => e.message).join('; ') ?? 'Unknown error'}`,
          requestId
        );
      }

      draftGraph = compilationResult.policyGraph;
    } catch (parseError: unknown) {
      const err = parseError as { message?: string };
      return errorResponse(
        400,
        'PARSE_ERROR',
        `Draft DSL parse error: ${err.message ?? 'Unknown parse error'}`,
        requestId
      );
    }

    // Load active policy graph and historical trips from database
    const { activeGraph, historicalTrips } = await withDatabase(async (db) => {
      // Load the current active policy rules and compile them into a graph
      const activeRulesResult = await db.query<{ dsl_source: string; policy_graph: string }>(
        `SELECT dsl_source, policy_graph FROM policy_rules WHERE status = 'active' ORDER BY priority ASC`,
      );

      let activeGraph: PolicyGraph;
      if (activeRulesResult.rows.length > 0) {
        // Use the stored policy_graph from the first active rule
        // In practice, we'd merge multiple rules into a single graph
        const combinedDsl = activeRulesResult.rows.map((r) => r.dsl_source).join('\n\n');
        try {
          const ast = parse(combinedDsl);
          const result = compile(ast);
          activeGraph = result.policyGraph ?? createEmptyGraph();
        } catch {
          activeGraph = createEmptyGraph();
        }
      } else {
        activeGraph = createEmptyGraph();
      }

      // Load historical trips from policy_decisions table
      let tripQuery = `SELECT request_payload, decision_id FROM policy_decisions`;
      const queryParams: unknown[] = [];
      const conditions: string[] = [];

      if (request.historicalTripIds && request.historicalTripIds.length > 0) {
        conditions.push(`trip_id = ANY($${queryParams.length + 1})`);
        queryParams.push(request.historicalTripIds);
      }

      if (request.dateRange) {
        conditions.push(`evaluated_at >= $${queryParams.length + 1}`);
        queryParams.push(request.dateRange.from);
        conditions.push(`evaluated_at <= $${queryParams.length + 1}`);
        queryParams.push(request.dateRange.to);
      }

      if (conditions.length > 0) {
        tripQuery += ` WHERE ${conditions.join(' AND ')}`;
      }

      tripQuery += ` ORDER BY evaluated_at DESC`;

      if (request.sampleSize && request.sampleSize > 0) {
        tripQuery += ` LIMIT $${queryParams.length + 1}`;
        queryParams.push(request.sampleSize);
      } else {
        // Default limit to prevent unbounded queries
        tripQuery += ` LIMIT 1000`;
      }

      const tripsResult = await db.query<{ request_payload: string | object }>(
        tripQuery,
        queryParams
      );

      const historicalTrips: PolicyDecisionRequest[] = tripsResult.rows
        .map((row) => {
          try {
            const payload = typeof row.request_payload === 'string'
              ? JSON.parse(row.request_payload)
              : row.request_payload;
            return payload as PolicyDecisionRequest;
          } catch {
            return null;
          }
        })
        .filter((t): t is PolicyDecisionRequest => t !== null);

      return { activeGraph, historicalTrips };
    });

    // Run the simulation engine (pure function, no side effects)
    const simulationInput: SimulationInput = {
      draftGraph,
      activeGraph,
      historicalTrips,
    };

    const report = runSimulationEngine(simulationInput);

    // Store simulation results in S3 for 90-day retention
    await storeSimulationResult(tenantId, report);

    return successResponse(200, report, requestId);
  } catch (error) {
    console.error('Simulation failed:', error);
    return errorResponse(
      500,
      'SIMULATION_FAILED',
      error instanceof Error ? error.message : 'An unexpected error occurred during simulation',
      requestId
    );
  }
}

/**
 * Store simulation results in S3 with a lifecycle policy for 90-day retention.
 */
async function storeSimulationResult(
  tenantId: string,
  report: SimulationReport
): Promise<void> {
  const key = `simulations/${tenantId}/${report.simulationId}.json`;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SIMULATION_RETENTION_DAYS);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: SIMULATION_BUCKET,
      Key: key,
      Body: JSON.stringify(report),
      ContentType: 'application/json',
      Expires: expiresAt,
      Metadata: {
        tenantId,
        simulationId: report.simulationId,
        completedAt: report.completedAt,
      },
    })
  );
}

/**
 * Create an empty policy graph (approves everything by default).
 */
function createEmptyGraph(): PolicyGraph {
  const rootNodeId = 'empty-root';
  return {
    graphId: 'empty-graph',
    version: 0,
    rootNodeId,
    nodes: [
      {
        nodeId: rootNodeId,
        type: 'terminal',
        terminal: {
          result: 'approve',
          reasons: [],
          obligations: [],
        },
      },
    ],
    edges: [],
    metadata: {
      createdAt: new Date().toISOString(),
      compiledFrom: 'empty',
      checksum: '00000000',
    },
  };
}
