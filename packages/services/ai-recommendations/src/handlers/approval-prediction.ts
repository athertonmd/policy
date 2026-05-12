/**
 * Approval Prediction Handler — POST /v1/ai/predict-approval
 *
 * Analyses historical approval patterns for similar trips and predicts
 * the likely outcome (approve/reject/review) with a confidence score.
 *
 * Requirements: 30.3
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';
import {
  calculateDescriptiveStats,
  calculateConfidenceScore,
  calculateProportionCI,
} from '../lib/statistical-analysis';

export interface ApprovalPredictionRequest {
  travellerId: string;
  department: string;
  seniorityLevel: string;
  tripType: 'domestic' | 'international' | 'multi-city';
  productType: 'air' | 'hotel' | 'car' | 'rail';
  cabinClass?: string;
  totalAmount: number;
  currency: string;
  leadTimeDays: number;
  destination?: string;
}

export interface ApprovalPrediction {
  predictedOutcome: 'approve' | 'reject' | 'review';
  confidenceScore: number;
  factors: PredictionFactor[];
  similarDecisions: SimilarDecision[];
  riskIndicators: RiskIndicator[];
}

export interface PredictionFactor {
  factor: string;
  influence: 'positive' | 'negative' | 'neutral';
  weight: number;
  description: string;
}

export interface SimilarDecision {
  decisionId: string;
  result: string;
  similarity: number;
  tripSummary: string;
  evaluatedAt: string;
}

export interface RiskIndicator {
  indicator: string;
  level: 'low' | 'medium' | 'high';
  description: string;
}

interface HistoricalDecision {
  decision_id: string;
  result: string;
  request_payload: string;
  evaluated_at: string;
  traveller_id: string;
}

interface ApprovalAction {
  workflow_id: string;
  action: string;
  stage_number: number;
}

interface WorkflowRow {
  workflow_id: string;
  decision_id: string;
  status: string;
}

export async function approvalPredictionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const tenantId = event.requestContext.authorizer?.tenantId ?? event.headers['x-tenant-id'];
  if (!tenantId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing tenant identifier' }),
    };
  }

  if (!event.body) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Request body is required' }),
    };
  }

  let request: ApprovalPredictionRequest;
  try {
    request = JSON.parse(event.body) as ApprovalPredictionRequest;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  if (!request.travellerId || !request.department || !request.tripType || !request.totalAmount) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required fields: travellerId, department, tripType, totalAmount' }),
    };
  }

  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;

  try {
    const prediction = await withDatabase(async (db) => {
      // Fetch historical decisions for similar trips
      const historicalDecisions = await getSimilarHistoricalDecisions(db, schemaName, request);

      // Fetch approval workflow outcomes
      const workflowOutcomes = await getWorkflowOutcomes(db, schemaName);

      // Calculate prediction
      return calculatePrediction(request, historicalDecisions, workflowOutcomes);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prediction),
    };
  } catch (error) {
    console.error('Error predicting approval:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate approval prediction' }),
    };
  }
}

async function getSimilarHistoricalDecisions(
  db: DatabaseClient,
  schema: string,
  request: ApprovalPredictionRequest
): Promise<HistoricalDecision[]> {
  // Query decisions with similar characteristics
  const result = await db.query<HistoricalDecision>(
    `SELECT decision_id, result, request_payload::text, evaluated_at, traveller_id
     FROM ${schema}.policy_decisions
     WHERE evaluated_at >= NOW() - INTERVAL '180 days'
     ORDER BY evaluated_at DESC
     LIMIT 5000`
  );
  return result.rows;
}

async function getWorkflowOutcomes(
  db: DatabaseClient,
  schema: string
): Promise<Map<string, string>> {
  const result = await db.query<WorkflowRow>(
    `SELECT workflow_id, decision_id, status
     FROM ${schema}.approval_workflows
     WHERE initiated_at >= NOW() - INTERVAL '180 days'
       AND status IN ('approved', 'rejected')`
  );

  const outcomes = new Map<string, string>();
  for (const row of result.rows) {
    outcomes.set(row.decision_id, row.status);
  }
  return outcomes;
}

function calculatePrediction(
  request: ApprovalPredictionRequest,
  historicalDecisions: HistoricalDecision[],
  workflowOutcomes: Map<string, string>
): ApprovalPrediction {
  // Score each historical decision for similarity to the request
  const scoredDecisions = historicalDecisions.map((decision) => {
    const similarity = calculateSimilarity(request, decision);
    return { decision, similarity };
  });

  // Filter to most similar decisions (similarity > 0.3)
  const similarDecisions = scoredDecisions
    .filter((sd) => sd.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 100);

  if (similarDecisions.length === 0) {
    return {
      predictedOutcome: 'review',
      confidenceScore: 0.2,
      factors: [
        {
          factor: 'Insufficient historical data',
          influence: 'neutral',
          weight: 1,
          description: 'Not enough similar trips found to make a confident prediction',
        },
      ],
      similarDecisions: [],
      riskIndicators: [],
    };
  }

  // Weight outcomes by similarity
  let approveScore = 0;
  let rejectScore = 0;
  let reviewScore = 0;
  let totalWeight = 0;

  for (const sd of similarDecisions) {
    const weight = sd.similarity;
    totalWeight += weight;

    // Check if the decision went through a workflow and what the final outcome was
    const workflowOutcome = workflowOutcomes.get(sd.decision.decision_id);

    if (sd.decision.result === 'approve' || workflowOutcome === 'approved') {
      approveScore += weight;
    } else if (sd.decision.result === 'reject' || workflowOutcome === 'rejected') {
      rejectScore += weight;
    } else {
      reviewScore += weight;
    }
  }

  // Normalise scores
  const total = approveScore + rejectScore + reviewScore;
  const approveProb = total > 0 ? approveScore / total : 0.33;
  const rejectProb = total > 0 ? rejectScore / total : 0.33;
  const reviewProb = total > 0 ? reviewScore / total : 0.34;

  // Determine predicted outcome
  let predictedOutcome: 'approve' | 'reject' | 'review';
  let maxProb: number;
  if (approveProb >= rejectProb && approveProb >= reviewProb) {
    predictedOutcome = 'approve';
    maxProb = approveProb;
  } else if (rejectProb >= approveProb && rejectProb >= reviewProb) {
    predictedOutcome = 'reject';
    maxProb = rejectProb;
  } else {
    predictedOutcome = 'review';
    maxProb = reviewProb;
  }

  // Calculate confidence based on sample size and agreement
  const amounts = similarDecisions.map((sd) => sd.similarity);
  const stats = calculateDescriptiveStats(amounts);
  const confidenceScore = Math.min(
    0.95,
    calculateConfidenceScore(similarDecisions.length, 1 - maxProb, 20) * maxProb
  );

  // Identify prediction factors
  const factors = identifyPredictionFactors(request, similarDecisions, historicalDecisions);

  // Identify risk indicators
  const riskIndicators = identifyRiskIndicators(request, similarDecisions);

  // Format top similar decisions for response
  const topSimilar: SimilarDecision[] = similarDecisions.slice(0, 5).map((sd) => {
    let tripSummary = '';
    try {
      const payload = JSON.parse(sd.decision.request_payload);
      tripSummary = `${payload.trip?.tripType ?? 'unknown'} trip, ${payload.offers?.[0]?.productType ?? 'unknown'}`;
    } catch {
      tripSummary = 'Trip details unavailable';
    }

    return {
      decisionId: sd.decision.decision_id,
      result: sd.decision.result,
      similarity: Math.round(sd.similarity * 100) / 100,
      tripSummary,
      evaluatedAt: sd.decision.evaluated_at,
    };
  });

  return {
    predictedOutcome,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    factors,
    similarDecisions: topSimilar,
    riskIndicators,
  };
}

/**
 * Calculates similarity between a prediction request and a historical decision.
 * Uses weighted feature matching.
 */
function calculateSimilarity(
  request: ApprovalPredictionRequest,
  decision: HistoricalDecision
): number {
  let score = 0;
  let maxScore = 0;

  try {
    const payload = JSON.parse(decision.request_payload);
    const trip = payload.trip ?? {};
    const traveller = payload.traveller ?? {};
    const offers = payload.offers ?? [];
    const offer = offers[0] ?? {};

    // Trip type match (weight: 3)
    maxScore += 3;
    if (trip.tripType === request.tripType) score += 3;

    // Product type match (weight: 2)
    maxScore += 2;
    if (offer.productType === request.productType) score += 2;

    // Cabin class match (weight: 2)
    if (request.cabinClass) {
      maxScore += 2;
      if (offer.cabinClass === request.cabinClass) score += 2;
    }

    // Department match (weight: 2)
    maxScore += 2;
    if (traveller.department === request.department) score += 2;

    // Seniority level match (weight: 1.5)
    maxScore += 1.5;
    if (traveller.seniorityLevel === request.seniorityLevel) score += 1.5;

    // Amount similarity (weight: 3) — closer amounts score higher
    maxScore += 3;
    const historicalAmount = offer.totalPrice?.amount ?? 0;
    if (historicalAmount > 0 && request.totalAmount > 0) {
      const ratio = Math.min(historicalAmount, request.totalAmount) / Math.max(historicalAmount, request.totalAmount);
      score += 3 * ratio;
    }

    // Lead time similarity (weight: 1.5)
    maxScore += 1.5;
    const historicalLeadTime = trip.leadTimeDays ?? 0;
    if (historicalLeadTime > 0 && request.leadTimeDays > 0) {
      const leadTimeRatio = Math.min(historicalLeadTime, request.leadTimeDays) / Math.max(historicalLeadTime, request.leadTimeDays);
      score += 1.5 * leadTimeRatio;
    }

    // Same traveller bonus (weight: 1)
    maxScore += 1;
    if (decision.traveller_id === request.travellerId) score += 1;
  } catch {
    return 0;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

function identifyPredictionFactors(
  request: ApprovalPredictionRequest,
  similarDecisions: Array<{ decision: HistoricalDecision; similarity: number }>,
  allDecisions: HistoricalDecision[]
): PredictionFactor[] {
  const factors: PredictionFactor[] = [];

  // Amount factor
  const amounts: number[] = [];
  for (const sd of similarDecisions) {
    try {
      const payload = JSON.parse(sd.decision.request_payload);
      const amount = payload.offers?.[0]?.totalPrice?.amount;
      if (amount) amounts.push(amount);
    } catch { /* skip */ }
  }

  if (amounts.length > 0) {
    const amountStats = calculateDescriptiveStats(amounts);
    if (request.totalAmount > amountStats.mean + amountStats.stdDev) {
      factors.push({
        factor: 'Trip cost above average',
        influence: 'negative',
        weight: 0.7,
        description: `Requested amount (${request.totalAmount}) is above the average for similar trips (${amountStats.mean.toFixed(0)})`,
      });
    } else if (request.totalAmount < amountStats.mean) {
      factors.push({
        factor: 'Trip cost below average',
        influence: 'positive',
        weight: 0.5,
        description: `Requested amount (${request.totalAmount}) is below the average for similar trips (${amountStats.mean.toFixed(0)})`,
      });
    }
  }

  // Lead time factor
  if (request.leadTimeDays < 3) {
    factors.push({
      factor: 'Short lead time',
      influence: 'negative',
      weight: 0.4,
      description: 'Booking with less than 3 days lead time may trigger additional review',
    });
  } else if (request.leadTimeDays >= 14) {
    factors.push({
      factor: 'Advance booking',
      influence: 'positive',
      weight: 0.3,
      description: 'Booking 14+ days in advance is typically viewed favourably',
    });
  }

  // Department historical approval rate
  const deptDecisions = allDecisions.filter((d) => {
    try {
      const payload = JSON.parse(d.request_payload);
      return payload.traveller?.department === request.department;
    } catch { return false; }
  });

  if (deptDecisions.length >= 20) {
    const approvedCount = deptDecisions.filter((d) => d.result === 'approve').length;
    const { proportion } = calculateProportionCI(approvedCount, deptDecisions.length);

    if (proportion >= 0.8) {
      factors.push({
        factor: 'Department approval history',
        influence: 'positive',
        weight: 0.5,
        description: `${request.department} department has a ${(proportion * 100).toFixed(0)}% historical approval rate`,
      });
    } else if (proportion < 0.5) {
      factors.push({
        factor: 'Department approval history',
        influence: 'negative',
        weight: 0.6,
        description: `${request.department} department has a ${(proportion * 100).toFixed(0)}% historical approval rate`,
      });
    }
  }

  return factors;
}

function identifyRiskIndicators(
  request: ApprovalPredictionRequest,
  similarDecisions: Array<{ decision: HistoricalDecision; similarity: number }>
): RiskIndicator[] {
  const indicators: RiskIndicator[] = [];

  // High amount risk
  const amounts: number[] = [];
  for (const sd of similarDecisions) {
    try {
      const payload = JSON.parse(sd.decision.request_payload);
      const amount = payload.offers?.[0]?.totalPrice?.amount;
      if (amount) amounts.push(amount);
    } catch { /* skip */ }
  }

  if (amounts.length > 0) {
    const stats = calculateDescriptiveStats(amounts);
    if (request.totalAmount > stats.mean + 2 * stats.stdDev) {
      indicators.push({
        indicator: 'Unusually high cost',
        level: 'high',
        description: `Trip cost is more than 2 standard deviations above the mean for similar trips`,
      });
    }
  }

  // Short lead time risk
  if (request.leadTimeDays <= 1) {
    indicators.push({
      indicator: 'Same-day or next-day booking',
      level: 'high',
      description: 'Very short lead time bookings often require additional justification',
    });
  } else if (request.leadTimeDays <= 3) {
    indicators.push({
      indicator: 'Short lead time',
      level: 'medium',
      description: 'Booking within 3 days of travel may attract scrutiny',
    });
  }

  // International trip with premium cabin
  if (request.tripType === 'international' && request.cabinClass && !['economy', 'premium_economy'].includes(request.cabinClass)) {
    indicators.push({
      indicator: 'Premium cabin on international trip',
      level: 'medium',
      description: 'Premium cabin classes on international trips typically require approval',
    });
  }

  return indicators;
}
