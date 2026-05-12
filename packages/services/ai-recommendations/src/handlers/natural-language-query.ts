/**
 * Natural Language Query Handler — POST /v1/ai/query
 *
 * Accepts natural language questions about policy performance and uses
 * Amazon Bedrock (Claude) to interpret the question, query relevant data,
 * and generate a natural language response.
 *
 * Examples:
 * - "What's our compliance rate this quarter?"
 * - "Which department spends the most on business class?"
 * - "How many overrides were approved last month?"
 *
 * Requirements: 30.5
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';
import { queryBedrock } from '../lib/bedrock-client';

export interface NaturalLanguageQueryRequest {
  question: string;
  context?: {
    timeRange?: string;
    department?: string;
    focusArea?: string;
  };
}

export interface NaturalLanguageQueryResponse {
  question: string;
  answer: string;
  dataPoints: DataPoint[];
  confidence: number;
  suggestedFollowUps: string[];
  queryMetadata: {
    dataSourcesUsed: string[];
    recordsAnalysed: number;
    processingTimeMs: number;
  };
}

export interface DataPoint {
  label: string;
  value: number | string;
  unit?: string;
}

interface QueryPlan {
  intent: string;
  requiredData: string[];
  sqlQueries: string[];
  timeRange: string;
}

const SYSTEM_PROMPT = `You are an AI assistant for a corporate travel policy platform. You help policy administrators understand their travel programme performance by answering questions about:
- Policy compliance rates
- Travel spend patterns
- Approval workflow performance
- Override and exception patterns
- Department-level analytics

When given data context, provide clear, concise answers with specific numbers. If the data is insufficient to answer the question, say so clearly.

You must respond in valid JSON format with the following structure:
{
  "answer": "Your natural language answer here",
  "dataPoints": [{"label": "metric name", "value": "value", "unit": "optional unit"}],
  "confidence": 0.0-1.0,
  "suggestedFollowUps": ["follow-up question 1", "follow-up question 2"]
}`;

const QUERY_PLANNING_PROMPT = `You are a query planner for a corporate travel policy database. Given a natural language question, determine what data is needed to answer it.

The database has these tables (in a tenant schema):
- policy_decisions: decision_id, result (approve/reject/review), winning_rules (JSONB), request_payload (JSONB with traveller, trip, offers), evaluated_at, traveller_id
- approval_workflows: workflow_id, decision_id, status, current_stage, initiated_at, completed_at
- policy_overrides: override_id, decision_id, reason_category, status, approved_by, created_at
- traveller_profiles: traveller_id, full_name, department, cost_centre, seniority_level
- policy_rules: rule_id, name, priority, status
- budgets: budget_id, scope_type, scope_value, amount, current_utilisation

Respond with a JSON object:
{
  "intent": "brief description of what the user wants to know",
  "requiredData": ["list of data categories needed"],
  "dataQueries": ["descriptions of what to query"],
  "timeRange": "inferred time range or 'last 90 days' as default"
}`;

export async function naturalLanguageQueryHandler(
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

  let request: NaturalLanguageQueryRequest;
  try {
    request = JSON.parse(event.body) as NaturalLanguageQueryRequest;
  } catch {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid JSON in request body' }),
    };
  }

  if (!request.question || request.question.trim().length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Question is required' }),
    };
  }

  if (request.question.length > 500) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Question must be 500 characters or fewer' }),
    };
  }

  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;
  const startTime = Date.now();

  try {
    const response = await withDatabase(async (db) => {
      // Step 1: Gather relevant data based on the question
      const dataContext = await gatherRelevantData(db, schemaName, request);

      // Step 2: Use Bedrock to generate the answer
      const questionWithContext = buildQuestionWithContext(request.question, dataContext, request.context);
      const aiResponse = await queryBedrock(questionWithContext, SYSTEM_PROMPT, {
        maxTokens: 2048,
        temperature: 0.2,
      });

      // Step 3: Parse the AI response
      const parsed = parseAIResponse(aiResponse);

      const processingTimeMs = Date.now() - startTime;

      return {
        question: request.question,
        answer: parsed.answer,
        dataPoints: parsed.dataPoints,
        confidence: parsed.confidence,
        suggestedFollowUps: parsed.suggestedFollowUps,
        queryMetadata: {
          dataSourcesUsed: dataContext.sourcesUsed,
          recordsAnalysed: dataContext.totalRecords,
          processingTimeMs,
        },
      } satisfies NaturalLanguageQueryResponse;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error processing natural language query:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to process query' }),
    };
  }
}

interface DataContext {
  summaryText: string;
  sourcesUsed: string[];
  totalRecords: number;
}

/**
 * Gathers relevant data from the database to provide context for the AI response.
 * Uses keyword matching to determine which data to fetch.
 */
async function gatherRelevantData(
  db: DatabaseClient,
  schema: string,
  request: NaturalLanguageQueryRequest
): Promise<DataContext> {
  const question = request.question.toLowerCase();
  const sourcesUsed: string[] = [];
  let totalRecords = 0;
  const summaryParts: string[] = [];

  // Always get high-level stats
  const overviewStats = await getOverviewStats(db, schema);
  sourcesUsed.push('policy_decisions');
  totalRecords += overviewStats.totalDecisions;
  summaryParts.push(`Overview: ${overviewStats.totalDecisions} total decisions, ${overviewStats.approveRate.toFixed(1)}% approved, ${overviewStats.rejectRate.toFixed(1)}% rejected, ${overviewStats.reviewRate.toFixed(1)}% sent for review.`);

  // Compliance-related queries
  if (question.includes('compliance') || question.includes('compliant') || question.includes('violation')) {
    const complianceData = await getComplianceData(db, schema);
    sourcesUsed.push('compliance_metrics');
    totalRecords += complianceData.totalEvaluated;
    summaryParts.push(`Compliance: Overall rate ${complianceData.complianceRate.toFixed(1)}%. By department: ${complianceData.byDepartment.map((d) => `${d.department}: ${d.rate.toFixed(1)}%`).join(', ')}.`);
  }

  // Spend-related queries
  if (question.includes('spend') || question.includes('cost') || question.includes('budget') || question.includes('expensive') || question.includes('business class') || question.includes('first class')) {
    const spendData = await getSpendData(db, schema);
    sourcesUsed.push('spend_analytics');
    totalRecords += spendData.tripCount;
    summaryParts.push(`Spend: Total ${spendData.totalSpend.toFixed(0)} across ${spendData.tripCount} trips. Average trip cost: ${spendData.avgTripCost.toFixed(0)}. By department: ${spendData.byDepartment.map((d) => `${d.department}: ${d.total.toFixed(0)} (${d.count} trips)`).join(', ')}.`);
  }

  // Override-related queries
  if (question.includes('override') || question.includes('exception') || question.includes('waiver')) {
    const overrideData = await getOverrideData(db, schema);
    sourcesUsed.push('policy_overrides');
    totalRecords += overrideData.totalOverrides;
    summaryParts.push(`Overrides: ${overrideData.totalOverrides} total, ${overrideData.approvedCount} approved (${overrideData.approvalRate.toFixed(1)}%). Top reasons: ${overrideData.topReasons.map((r) => `${r.category}: ${r.count}`).join(', ')}.`);
  }

  // Approval workflow queries
  if (question.includes('approval') || question.includes('pending') || question.includes('workflow') || question.includes('sla') || question.includes('turnaround')) {
    const approvalData = await getApprovalData(db, schema);
    sourcesUsed.push('approval_workflows');
    totalRecords += approvalData.totalWorkflows;
    summaryParts.push(`Approvals: ${approvalData.totalWorkflows} workflows, ${approvalData.avgCompletionHours.toFixed(1)} hours avg completion time, ${approvalData.pendingCount} currently pending.`);
  }

  // Department-related queries
  if (question.includes('department') || question.includes('team') || question.includes('which')) {
    const deptData = await getDepartmentData(db, schema);
    sourcesUsed.push('department_analytics');
    totalRecords += deptData.totalTravellers;
    summaryParts.push(`Departments: ${deptData.departments.map((d) => `${d.name} (${d.travellerCount} travellers, ${d.tripCount} trips)`).join(', ')}.`);
  }

  return {
    summaryText: summaryParts.join('\n'),
    sourcesUsed: [...new Set(sourcesUsed)],
    totalRecords,
  };
}

function buildQuestionWithContext(
  question: string,
  dataContext: DataContext,
  additionalContext?: NaturalLanguageQueryRequest['context']
): string {
  let prompt = `Based on the following data from our travel policy platform, please answer this question:\n\nQuestion: "${question}"\n\nData Context:\n${dataContext.summaryText}`;

  if (additionalContext?.timeRange) {
    prompt += `\n\nTime range specified: ${additionalContext.timeRange}`;
  }
  if (additionalContext?.department) {
    prompt += `\nDepartment focus: ${additionalContext.department}`;
  }

  prompt += '\n\nPlease provide your response in the specified JSON format.';
  return prompt;
}

function parseAIResponse(response: string): {
  answer: string;
  dataPoints: DataPoint[];
  confidence: number;
  suggestedFollowUps: string[];
} {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        answer: parsed.answer ?? 'Unable to generate a response.',
        dataPoints: Array.isArray(parsed.dataPoints) ? parsed.dataPoints : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps) ? parsed.suggestedFollowUps : [],
      };
    }
  } catch {
    // If JSON parsing fails, use the raw response as the answer
  }

  return {
    answer: response || 'Unable to generate a response.',
    dataPoints: [],
    confidence: 0.3,
    suggestedFollowUps: [],
  };
}

// --- Data fetching helpers ---

async function getOverviewStats(db: DatabaseClient, schema: string) {
  const result = await db.query<{ result: string; count: string }>(
    `SELECT result, COUNT(*) as count
     FROM ${schema}.policy_decisions
     WHERE evaluated_at >= NOW() - INTERVAL '90 days'
     GROUP BY result`
  );

  let total = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  for (const row of result.rows) {
    const count = parseInt(row.count, 10);
    total += count;
    if (row.result === 'approve') approved = count;
    else if (row.result === 'reject') rejected = count;
    else if (row.result === 'review') review = count;
  }

  return {
    totalDecisions: total,
    approveRate: total > 0 ? (approved / total) * 100 : 0,
    rejectRate: total > 0 ? (rejected / total) * 100 : 0,
    reviewRate: total > 0 ? (review / total) * 100 : 0,
  };
}

async function getComplianceData(db: DatabaseClient, schema: string) {
  const result = await db.query<{ department: string; total: string; compliant: string }>(
    `SELECT
       tp.department,
       COUNT(*) as total,
       SUM(CASE WHEN pd.result = 'approve' THEN 1 ELSE 0 END) as compliant
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '90 days'
     GROUP BY tp.department
     ORDER BY COUNT(*) DESC
     LIMIT 10`
  );

  let totalEvaluated = 0;
  let totalCompliant = 0;
  const byDepartment: Array<{ department: string; rate: number }> = [];

  for (const row of result.rows) {
    const total = parseInt(row.total, 10);
    const compliant = parseInt(row.compliant, 10);
    totalEvaluated += total;
    totalCompliant += compliant;
    byDepartment.push({
      department: row.department,
      rate: total > 0 ? (compliant / total) * 100 : 0,
    });
  }

  return {
    totalEvaluated,
    complianceRate: totalEvaluated > 0 ? (totalCompliant / totalEvaluated) * 100 : 0,
    byDepartment,
  };
}

async function getSpendData(db: DatabaseClient, schema: string) {
  const result = await db.query<{ department: string; total_spend: string; trip_count: string }>(
    `SELECT
       tp.department,
       SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric) as total_spend,
       COUNT(*) as trip_count
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '90 days'
       AND pd.result = 'approve'
     GROUP BY tp.department
     ORDER BY total_spend DESC
     LIMIT 10`
  );

  let totalSpend = 0;
  let tripCount = 0;
  const byDepartment: Array<{ department: string; total: number; count: number }> = [];

  for (const row of result.rows) {
    const spend = parseFloat(row.total_spend ?? '0');
    const count = parseInt(row.trip_count, 10);
    totalSpend += spend;
    tripCount += count;
    byDepartment.push({ department: row.department, total: spend, count });
  }

  return {
    totalSpend,
    tripCount,
    avgTripCost: tripCount > 0 ? totalSpend / tripCount : 0,
    byDepartment,
  };
}

async function getOverrideData(db: DatabaseClient, schema: string) {
  const countResult = await db.query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) as count
     FROM ${schema}.policy_overrides
     WHERE created_at >= NOW() - INTERVAL '90 days'
     GROUP BY status`
  );

  let totalOverrides = 0;
  let approvedCount = 0;
  for (const row of countResult.rows) {
    const count = parseInt(row.count, 10);
    totalOverrides += count;
    if (row.status === 'approved') approvedCount = count;
  }

  const reasonResult = await db.query<{ reason_category: string; count: string }>(
    `SELECT reason_category, COUNT(*) as count
     FROM ${schema}.policy_overrides
     WHERE created_at >= NOW() - INTERVAL '90 days'
     GROUP BY reason_category
     ORDER BY count DESC
     LIMIT 5`
  );

  const topReasons = reasonResult.rows.map((r) => ({
    category: r.reason_category,
    count: parseInt(r.count, 10),
  }));

  return {
    totalOverrides,
    approvedCount,
    approvalRate: totalOverrides > 0 ? (approvedCount / totalOverrides) * 100 : 0,
    topReasons,
  };
}

async function getApprovalData(db: DatabaseClient, schema: string) {
  const result = await db.query<{ total: string; pending: string; avg_hours: string }>(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
       AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - initiated_at)) / 3600) as avg_hours
     FROM ${schema}.approval_workflows
     WHERE initiated_at >= NOW() - INTERVAL '90 days'`
  );

  const row = result.rows[0];
  return {
    totalWorkflows: parseInt(row?.total ?? '0', 10),
    pendingCount: parseInt(row?.pending ?? '0', 10),
    avgCompletionHours: parseFloat(row?.avg_hours ?? '0'),
  };
}

async function getDepartmentData(db: DatabaseClient, schema: string) {
  const result = await db.query<{ department: string; traveller_count: string; trip_count: string }>(
    `SELECT
       tp.department,
       COUNT(DISTINCT tp.traveller_id) as traveller_count,
       COUNT(DISTINCT pd.decision_id) as trip_count
     FROM ${schema}.traveller_profiles tp
     LEFT JOIN ${schema}.policy_decisions pd ON tp.traveller_id = pd.traveller_id
       AND pd.evaluated_at >= NOW() - INTERVAL '90 days'
     WHERE tp.status = 'active'
     GROUP BY tp.department
     ORDER BY trip_count DESC
     LIMIT 10`
  );

  let totalTravellers = 0;
  const departments = result.rows.map((r) => {
    const count = parseInt(r.traveller_count, 10);
    totalTravellers += count;
    return {
      name: r.department,
      travellerCount: count,
      tripCount: parseInt(r.trip_count, 10),
    };
  });

  return { totalTravellers, departments };
}
