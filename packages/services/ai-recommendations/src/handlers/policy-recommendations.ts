/**
 * Policy Recommendations Handler — GET /v1/ai/recommendations
 *
 * Generates policy optimisation recommendations based on historical data:
 * - Rules with high override rates
 * - Rules never triggered
 * - Cost-saving opportunities
 *
 * Requires minimum 1000 evaluated trips before generating recommendations.
 *
 * Requirements: 30.1, 30.2
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';
import {
  calculateDescriptiveStats,
  calculateConfidenceScore,
  calculateTrend,
  calculateProportionCI,
} from '../lib/statistical-analysis';

export interface PolicyRecommendation {
  recommendationId: string;
  type: 'high_override_rate' | 'never_triggered' | 'cost_saving' | 'compliance_improvement';
  title: string;
  description: string;
  projectedCostImpact: {
    amount: number;
    currency: string;
    direction: 'saving' | 'increase';
  };
  affectedPopulation: {
    count: number;
    percentage: number;
    departments: string[];
  };
  confidenceScore: number;
  supportingEvidence: SupportingEvidence[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
}

export interface SupportingEvidence {
  metric: string;
  value: number;
  context: string;
}

interface DecisionRow {
  decision_id: string;
  result: string;
  winning_rules: string;
  request_payload: string;
  evaluated_at: string;
  traveller_id: string;
}

interface OverrideRow {
  override_id: string;
  decision_id: string;
  reason_category: string;
  status: string;
  created_at: string;
}

interface RuleRow {
  rule_id: string;
  name: string;
  priority: number;
  status: string;
}

interface TravellerRow {
  traveller_id: string;
  department: string;
}

const MINIMUM_TRIPS = 1000;

export async function policyRecommendationsHandler(
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

  const schemaName = `tenant_${tenantId.replace(/-/g, '_')}`;

  try {
    const recommendations = await withDatabase(async (db) => {
      // Check minimum trip count
      const tripCount = await getTripCount(db, schemaName);
      if (tripCount < MINIMUM_TRIPS) {
        return {
          eligible: false,
          minimumRequired: MINIMUM_TRIPS,
          currentCount: tripCount,
          recommendations: [],
        };
      }

      // Gather data for analysis
      const [decisions, overrides, rules, travellers] = await Promise.all([
        getRecentDecisions(db, schemaName),
        getRecentOverrides(db, schemaName),
        getActiveRules(db, schemaName),
        getTravellers(db, schemaName),
      ]);

      // Generate recommendations
      const recs: PolicyRecommendation[] = [];

      const highOverrideRecs = analyseHighOverrideRules(decisions, overrides, rules, travellers);
      recs.push(...highOverrideRecs);

      const neverTriggeredRecs = analyseNeverTriggeredRules(decisions, rules);
      recs.push(...neverTriggeredRecs);

      const costSavingRecs = analyseCostSavingOpportunities(decisions, travellers);
      recs.push(...costSavingRecs);

      // Sort by priority and confidence
      recs.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (pDiff !== 0) return pDiff;
        return b.confidenceScore - a.confidenceScore;
      });

      return {
        eligible: true,
        totalTripsAnalysed: tripCount,
        recommendations: recs,
        generatedAt: new Date().toISOString(),
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recommendations),
    };
  } catch (error) {
    console.error('Error generating recommendations:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate recommendations' }),
    };
  }
}

async function getTripCount(db: DatabaseClient, schema: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM ${schema}.policy_decisions`
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

async function getRecentDecisions(db: DatabaseClient, schema: string): Promise<DecisionRow[]> {
  const result = await db.query<DecisionRow>(
    `SELECT decision_id, result, winning_rules::text, request_payload::text, evaluated_at, traveller_id
     FROM ${schema}.policy_decisions
     WHERE evaluated_at >= NOW() - INTERVAL '90 days'
     ORDER BY evaluated_at DESC
     LIMIT 10000`
  );
  return result.rows;
}

async function getRecentOverrides(db: DatabaseClient, schema: string): Promise<OverrideRow[]> {
  const result = await db.query<OverrideRow>(
    `SELECT override_id, decision_id, reason_category, status, created_at
     FROM ${schema}.policy_overrides
     WHERE created_at >= NOW() - INTERVAL '90 days'`
  );
  return result.rows;
}

async function getActiveRules(db: DatabaseClient, schema: string): Promise<RuleRow[]> {
  const result = await db.query<RuleRow>(
    `SELECT rule_id, name, priority, status
     FROM ${schema}.policy_rules
     WHERE status = 'active'`
  );
  return result.rows;
}

async function getTravellers(db: DatabaseClient, schema: string): Promise<TravellerRow[]> {
  const result = await db.query<TravellerRow>(
    `SELECT traveller_id, department
     FROM ${schema}.traveller_profiles
     WHERE status = 'active'`
  );
  return result.rows;
}

/**
 * Identifies rules with high override rates — candidates for policy relaxation.
 */
function analyseHighOverrideRules(
  decisions: DecisionRow[],
  overrides: OverrideRow[],
  rules: RuleRow[],
  travellers: TravellerRow[]
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Count how often each rule triggers rejections
  const ruleRejectionCount = new Map<string, number>();
  const ruleDecisionIds = new Map<string, string[]>();

  for (const decision of decisions) {
    if (decision.result === 'reject') {
      try {
        const winningRules = JSON.parse(decision.winning_rules) as Array<{ ruleId: string; ruleName: string }>;
        for (const wr of winningRules) {
          ruleRejectionCount.set(wr.ruleId, (ruleRejectionCount.get(wr.ruleId) ?? 0) + 1);
          const ids = ruleDecisionIds.get(wr.ruleId) ?? [];
          ids.push(decision.decision_id);
          ruleDecisionIds.set(wr.ruleId, ids);
        }
      } catch {
        // Skip malformed winning_rules
      }
    }
  }

  // Count overrides per rule (via decision_id linkage)
  const overrideDecisionIds = new Set(overrides.filter((o) => o.status === 'approved').map((o) => o.decision_id));

  for (const rule of rules) {
    const rejections = ruleRejectionCount.get(rule.rule_id) ?? 0;
    if (rejections < 10) continue; // Need sufficient data

    const decisionIds = ruleDecisionIds.get(rule.rule_id) ?? [];
    const overriddenCount = decisionIds.filter((id) => overrideDecisionIds.has(id)).length;
    const overrideRate = overriddenCount / rejections;

    if (overrideRate >= 0.3) {
      // 30%+ override rate is significant
      const { proportion, ci } = calculateProportionCI(overriddenCount, rejections);

      // Estimate cost impact from overrides (processing cost per override)
      const estimatedCostPerOverride = 50; // Administrative cost estimate
      const projectedSaving = overriddenCount * estimatedCostPerOverride;

      // Determine affected departments
      const affectedTravellerIds = new Set<string>();
      for (const decision of decisions) {
        if (decisionIds.includes(decision.decision_id)) {
          affectedTravellerIds.add(decision.traveller_id);
        }
      }
      const affectedDepartments = new Set<string>();
      for (const t of travellers) {
        if (affectedTravellerIds.has(t.traveller_id)) {
          affectedDepartments.add(t.department);
        }
      }

      const confidence = calculateConfidenceScore(rejections, Math.pow(1 - overrideRate, 2));

      recommendations.push({
        recommendationId: `rec_override_${rule.rule_id.substring(0, 8)}`,
        type: 'high_override_rate',
        title: `Consider relaxing rule: "${rule.name}"`,
        description: `This rule has a ${(overrideRate * 100).toFixed(1)}% override rate (${overriddenCount} of ${rejections} rejections overridden). This suggests the rule may be too restrictive for current business needs.`,
        projectedCostImpact: {
          amount: projectedSaving,
          currency: 'GBP',
          direction: 'saving',
        },
        affectedPopulation: {
          count: affectedTravellerIds.size,
          percentage: travellers.length > 0 ? (affectedTravellerIds.size / travellers.length) * 100 : 0,
          departments: [...affectedDepartments],
        },
        confidenceScore: confidence,
        supportingEvidence: [
          { metric: 'Override Rate', value: proportion, context: `${(proportion * 100).toFixed(1)}% of rejections are overridden (CI: ${(ci.lower * 100).toFixed(1)}%-${(ci.upper * 100).toFixed(1)}%)` },
          { metric: 'Total Rejections (90d)', value: rejections, context: `${rejections} trips rejected by this rule in the last 90 days` },
          { metric: 'Approved Overrides', value: overriddenCount, context: `${overriddenCount} overrides approved, indicating legitimate business need` },
        ],
        priority: overrideRate >= 0.5 ? 'high' : 'medium',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return recommendations;
}

/**
 * Identifies rules that have never been triggered — candidates for removal.
 */
function analyseNeverTriggeredRules(
  decisions: DecisionRow[],
  rules: RuleRow[]
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Collect all rule IDs that appear in winning_rules
  const triggeredRuleIds = new Set<string>();
  for (const decision of decisions) {
    try {
      const winningRules = JSON.parse(decision.winning_rules) as Array<{ ruleId: string }>;
      for (const wr of winningRules) {
        triggeredRuleIds.add(wr.ruleId);
      }
    } catch {
      // Skip malformed
    }
  }

  for (const rule of rules) {
    if (!triggeredRuleIds.has(rule.rule_id)) {
      recommendations.push({
        recommendationId: `rec_unused_${rule.rule_id.substring(0, 8)}`,
        type: 'never_triggered',
        title: `Rule never triggered: "${rule.name}"`,
        description: `This rule has not been triggered in the last 90 days across ${decisions.length} evaluated trips. Consider reviewing whether it is still relevant or if its conditions are too narrow.`,
        projectedCostImpact: {
          amount: 0,
          currency: 'GBP',
          direction: 'saving',
        },
        affectedPopulation: {
          count: 0,
          percentage: 0,
          departments: [],
        },
        confidenceScore: decisions.length >= 1000 ? 0.85 : 0.6,
        supportingEvidence: [
          { metric: 'Trips Evaluated', value: decisions.length, context: `Rule not triggered across ${decisions.length} trip evaluations` },
          { metric: 'Rule Priority', value: rule.priority, context: `Priority ${rule.priority} — ${rule.priority <= 50 ? 'high priority rule not firing may indicate misconfiguration' : 'lower priority rule may be redundant'}` },
        ],
        priority: rule.priority <= 50 ? 'medium' : 'low',
        createdAt: new Date().toISOString(),
      });
    }
  }

  return recommendations;
}

/**
 * Identifies cost-saving opportunities from spending patterns.
 */
function analyseCostSavingOpportunities(
  decisions: DecisionRow[],
  travellers: TravellerRow[]
): PolicyRecommendation[] {
  const recommendations: PolicyRecommendation[] = [];

  // Analyse approved trips for spending patterns
  const departmentSpend = new Map<string, number[]>();
  const travellerDeptMap = new Map<string, string>();
  for (const t of travellers) {
    travellerDeptMap.set(t.traveller_id, t.department);
  }

  for (const decision of decisions) {
    if (decision.result !== 'approve') continue;

    try {
      const payload = JSON.parse(decision.request_payload);
      const offers = payload.offers ?? [];
      const dept = travellerDeptMap.get(decision.traveller_id) ?? 'unknown';

      for (const offer of offers) {
        const amount = offer.totalPrice?.amount ?? 0;
        if (amount > 0) {
          const existing = departmentSpend.get(dept) ?? [];
          existing.push(amount);
          departmentSpend.set(dept, existing);
        }
      }
    } catch {
      // Skip malformed payloads
    }
  }

  // Identify departments with high average spend relative to others
  const allSpends: number[] = [];
  const deptStats = new Map<string, { mean: number; count: number; total: number }>();

  for (const [dept, spends] of departmentSpend) {
    if (spends.length < 20) continue; // Need sufficient data
    const stats = calculateDescriptiveStats(spends);
    deptStats.set(dept, { mean: stats.mean, count: stats.count, total: spends.reduce((s, v) => s + v, 0) });
    allSpends.push(...spends);
  }

  if (allSpends.length > 0) {
    const overallStats = calculateDescriptiveStats(allSpends);

    for (const [dept, stats] of deptStats) {
      if (stats.mean > overallStats.mean * 1.5 && stats.count >= 30) {
        // Department spends 50%+ more than average
        const potentialSaving = (stats.mean - overallStats.mean) * stats.count * 0.3; // Assume 30% reduction achievable
        const confidence = calculateConfidenceScore(stats.count, Math.pow(stats.mean - overallStats.mean, 2));

        // Analyse trend
        const deptSpends = departmentSpend.get(dept) ?? [];
        const trendData = deptSpends.slice(-30).map((y, i) => ({ x: i, y }));
        const trend = calculateTrend(trendData);

        recommendations.push({
          recommendationId: `rec_cost_${dept.substring(0, 8).replace(/\s/g, '_')}`,
          type: 'cost_saving',
          title: `High spend detected in ${dept} department`,
          description: `The ${dept} department's average trip cost (${stats.mean.toFixed(0)}) is ${((stats.mean / overallStats.mean - 1) * 100).toFixed(0)}% above the organisation average (${overallStats.mean.toFixed(0)}). ${trend.direction === 'increasing' ? 'Spending is trending upward.' : ''} Consider implementing stricter cabin class or advance booking policies for this department.`,
          projectedCostImpact: {
            amount: Math.round(potentialSaving),
            currency: 'GBP',
            direction: 'saving',
          },
          affectedPopulation: {
            count: stats.count,
            percentage: travellers.length > 0 ? (stats.count / travellers.length) * 100 : 0,
            departments: [dept],
          },
          confidenceScore: confidence,
          supportingEvidence: [
            { metric: 'Avg Trip Cost', value: stats.mean, context: `Department average: ${stats.mean.toFixed(2)} vs org average: ${overallStats.mean.toFixed(2)}` },
            { metric: 'Trip Count', value: stats.count, context: `Based on ${stats.count} trips in the last 90 days` },
            { metric: 'Spend Trend', value: trend.slope, context: `Spending is ${trend.direction} (R²=${trend.rSquared.toFixed(2)})` },
          ],
          priority: stats.mean > overallStats.mean * 2 ? 'high' : 'medium',
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return recommendations;
}
