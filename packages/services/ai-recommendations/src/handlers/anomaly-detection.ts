/**
 * Anomaly Detection Handler — GET /v1/ai/anomalies
 *
 * Compares current booking patterns against historical baselines to detect:
 * - Unusual spend spikes
 * - Abnormal booking frequency
 * - Policy circumvention patterns
 *
 * Requirements: 30.4
 */
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { withDatabase, type DatabaseClient } from '../lib/database';
import {
  calculateDescriptiveStats,
  detectAnomaly,
  detectAnomalyIQR,
  calculateTrend,
  type AnomalyResult,
  type DescriptiveStats,
} from '../lib/statistical-analysis';

export interface SpendAnomaly {
  anomalyId: string;
  type: 'spend_spike' | 'booking_frequency' | 'policy_circumvention' | 'unusual_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  detectedAt: string;
  affectedEntity: {
    type: 'department' | 'traveller' | 'supplier' | 'route';
    id: string;
    name: string;
  };
  currentValue: number;
  baselineValue: number;
  deviationPercentage: number;
  supportingData: AnomalySupportingData[];
}

export interface AnomalySupportingData {
  metric: string;
  currentValue: number;
  baselineValue: number;
  period: string;
}

interface DailySpendRow {
  spend_date: string;
  department: string;
  total_amount: number;
  trip_count: number;
}

interface TravellerSpendRow {
  traveller_id: string;
  full_name: string;
  department: string;
  total_amount: number;
  trip_count: number;
  period: string;
}

interface OverridePatternRow {
  traveller_id: string;
  full_name: string;
  department: string;
  override_count: number;
  decision_count: number;
}

export async function anomalyDetectionHandler(
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
  const lookbackDays = parseInt(event.queryStringParameters?.lookbackDays ?? '30', 10);
  const minSeverity = (event.queryStringParameters?.minSeverity ?? 'low') as SpendAnomaly['severity'];

  try {
    const anomalies = await withDatabase(async (db) => {
      const [spendAnomalies, frequencyAnomalies, circumventionAnomalies] = await Promise.all([
        detectSpendAnomalies(db, schemaName, lookbackDays),
        detectFrequencyAnomalies(db, schemaName, lookbackDays),
        detectCircumventionPatterns(db, schemaName, lookbackDays),
      ]);

      const allAnomalies = [...spendAnomalies, ...frequencyAnomalies, ...circumventionAnomalies];

      // Filter by minimum severity
      const severityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
      const filtered = allAnomalies.filter(
        (a) => severityOrder[a.severity] >= severityOrder[minSeverity]
      );

      // Sort by severity (critical first) then by deviation
      filtered.sort((a, b) => {
        const sevDiff = severityOrder[b.severity] - severityOrder[a.severity];
        if (sevDiff !== 0) return sevDiff;
        return Math.abs(b.deviationPercentage) - Math.abs(a.deviationPercentage);
      });

      return filtered;
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anomalies,
        totalDetected: anomalies.length,
        analysisWindow: {
          lookbackDays,
          baselinePeriod: `${lookbackDays * 3} days`,
          analysedAt: new Date().toISOString(),
        },
      }),
    };
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to detect anomalies' }),
    };
  }
}

/**
 * Detects unusual spend spikes by comparing recent department spend
 * against historical baselines.
 */
async function detectSpendAnomalies(
  db: DatabaseClient,
  schema: string,
  lookbackDays: number
): Promise<SpendAnomaly[]> {
  // Get daily spend by department for baseline period (3x lookback)
  const baselineResult = await db.query<DailySpendRow>(
    `SELECT
       DATE(pd.evaluated_at) as spend_date,
       tp.department,
       SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric) as total_amount,
       COUNT(*) as trip_count
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '${lookbackDays * 3} days'
       AND pd.evaluated_at < NOW() - INTERVAL '${lookbackDays} days'
       AND pd.result = 'approve'
     GROUP BY DATE(pd.evaluated_at), tp.department
     ORDER BY spend_date`,
    []
  );

  // Get recent spend by department
  const recentResult = await db.query<DailySpendRow>(
    `SELECT
       DATE(pd.evaluated_at) as spend_date,
       tp.department,
       SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric) as total_amount,
       COUNT(*) as trip_count
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '${lookbackDays} days'
       AND pd.result = 'approve'
     GROUP BY DATE(pd.evaluated_at), tp.department
     ORDER BY spend_date`,
    []
  );

  const anomalies: SpendAnomaly[] = [];

  // Build baseline stats per department
  const baselineByDept = new Map<string, number[]>();
  for (const row of baselineResult.rows) {
    const existing = baselineByDept.get(row.department) ?? [];
    existing.push(Number(row.total_amount));
    baselineByDept.set(row.department, existing);
  }

  // Aggregate recent spend per department
  const recentByDept = new Map<string, { total: number; days: number; dailyAmounts: number[] }>();
  for (const row of recentResult.rows) {
    const existing = recentByDept.get(row.department) ?? { total: 0, days: 0, dailyAmounts: [] };
    existing.total += Number(row.total_amount);
    existing.days += 1;
    existing.dailyAmounts.push(Number(row.total_amount));
    recentByDept.set(row.department, existing);
  }

  for (const [dept, recentData] of recentByDept) {
    const baselineAmounts = baselineByDept.get(dept);
    if (!baselineAmounts || baselineAmounts.length < 5) continue;

    const baselineStats = calculateDescriptiveStats(baselineAmounts);
    const recentAvgDaily = recentData.total / Math.max(recentData.days, 1);

    const anomalyResult = detectAnomaly(recentAvgDaily, baselineStats);

    if (anomalyResult.isAnomaly) {
      const deviationPct = baselineStats.mean > 0
        ? ((recentAvgDaily - baselineStats.mean) / baselineStats.mean) * 100
        : 0;

      anomalies.push({
        anomalyId: `anomaly_spend_${dept.replace(/\s/g, '_').toLowerCase()}_${Date.now()}`,
        type: 'spend_spike',
        severity: anomalyResult.severity,
        title: `Unusual spend spike in ${dept}`,
        description: `Daily average spend in ${dept} (${recentAvgDaily.toFixed(0)}) is ${Math.abs(deviationPct).toFixed(0)}% ${deviationPct > 0 ? 'above' : 'below'} the historical baseline (${baselineStats.mean.toFixed(0)}). Z-score: ${anomalyResult.zScore.toFixed(2)}.`,
        detectedAt: new Date().toISOString(),
        affectedEntity: { type: 'department', id: dept, name: dept },
        currentValue: recentAvgDaily,
        baselineValue: baselineStats.mean,
        deviationPercentage: Math.round(deviationPct * 10) / 10,
        supportingData: [
          { metric: 'Daily Avg Spend (Current)', currentValue: recentAvgDaily, baselineValue: baselineStats.mean, period: `Last ${lookbackDays} days` },
          { metric: 'Std Deviation', currentValue: anomalyResult.zScore, baselineValue: 1, period: 'Z-score' },
          { metric: 'Trip Count', currentValue: recentData.days, baselineValue: baselineAmounts.length, period: 'Days with activity' },
        ],
      });
    }
  }

  return anomalies;
}

/**
 * Detects abnormal booking frequency patterns per traveller.
 */
async function detectFrequencyAnomalies(
  db: DatabaseClient,
  schema: string,
  lookbackDays: number
): Promise<SpendAnomaly[]> {
  // Get traveller booking frequency for baseline
  const baselineResult = await db.query<TravellerSpendRow>(
    `SELECT
       pd.traveller_id,
       tp.full_name,
       tp.department,
       SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric) as total_amount,
       COUNT(*) as trip_count,
       'baseline' as period
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '${lookbackDays * 3} days'
       AND pd.evaluated_at < NOW() - INTERVAL '${lookbackDays} days'
     GROUP BY pd.traveller_id, tp.full_name, tp.department`,
    []
  );

  // Get recent traveller booking frequency
  const recentResult = await db.query<TravellerSpendRow>(
    `SELECT
       pd.traveller_id,
       tp.full_name,
       tp.department,
       SUM((pd.request_payload->'offers'->0->'totalPrice'->>'amount')::numeric) as total_amount,
       COUNT(*) as trip_count,
       'recent' as period
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '${lookbackDays} days'
     GROUP BY pd.traveller_id, tp.full_name, tp.department`,
    []
  );

  const anomalies: SpendAnomaly[] = [];

  // Build baseline frequency per traveller (normalised to per-day)
  const baselineFreq = new Map<string, { tripRate: number; name: string; dept: string }>();
  const baselinePeriodDays = lookbackDays * 2; // baseline spans 2x lookback
  for (const row of baselineResult.rows) {
    baselineFreq.set(row.traveller_id, {
      tripRate: Number(row.trip_count) / baselinePeriodDays,
      name: row.full_name,
      dept: row.department,
    });
  }

  // Compare recent frequency
  for (const row of recentResult.rows) {
    const baseline = baselineFreq.get(row.traveller_id);
    if (!baseline || baseline.tripRate === 0) continue;

    const recentRate = Number(row.trip_count) / lookbackDays;
    const ratio = recentRate / baseline.tripRate;

    // Flag if booking frequency is 3x+ the baseline
    if (ratio >= 3 && Number(row.trip_count) >= 5) {
      const deviationPct = (ratio - 1) * 100;
      const severity: SpendAnomaly['severity'] = ratio >= 5 ? 'high' : ratio >= 4 ? 'medium' : 'low';

      anomalies.push({
        anomalyId: `anomaly_freq_${row.traveller_id.substring(0, 8)}_${Date.now()}`,
        type: 'booking_frequency',
        severity,
        title: `Abnormal booking frequency: ${row.full_name}`,
        description: `${row.full_name} (${row.department}) has ${row.trip_count} bookings in the last ${lookbackDays} days, which is ${ratio.toFixed(1)}x their historical rate.`,
        detectedAt: new Date().toISOString(),
        affectedEntity: { type: 'traveller', id: row.traveller_id, name: row.full_name },
        currentValue: recentRate,
        baselineValue: baseline.tripRate,
        deviationPercentage: Math.round(deviationPct),
        supportingData: [
          { metric: 'Bookings (Current Period)', currentValue: Number(row.trip_count), baselineValue: baseline.tripRate * baselinePeriodDays, period: `Last ${lookbackDays} days vs baseline` },
          { metric: 'Daily Rate', currentValue: recentRate, baselineValue: baseline.tripRate, period: 'Bookings per day' },
          { metric: 'Total Spend', currentValue: Number(row.total_amount), baselineValue: 0, period: `Last ${lookbackDays} days` },
        ],
      });
    }
  }

  return anomalies;
}

/**
 * Detects potential policy circumvention patterns:
 * - Travellers with unusually high override request rates
 * - Repeated rejections followed by similar bookings
 */
async function detectCircumventionPatterns(
  db: DatabaseClient,
  schema: string,
  lookbackDays: number
): Promise<SpendAnomaly[]> {
  // Find travellers with high override-to-decision ratios
  const overrideResult = await db.query<OverridePatternRow>(
    `SELECT
       pd.traveller_id,
       tp.full_name,
       tp.department,
       COUNT(DISTINCT po.override_id) as override_count,
       COUNT(DISTINCT pd.decision_id) as decision_count
     FROM ${schema}.policy_decisions pd
     JOIN ${schema}.traveller_profiles tp ON pd.traveller_id = tp.traveller_id
     LEFT JOIN ${schema}.policy_overrides po ON pd.decision_id = po.decision_id
     WHERE pd.evaluated_at >= NOW() - INTERVAL '${lookbackDays} days'
     GROUP BY pd.traveller_id, tp.full_name, tp.department
     HAVING COUNT(DISTINCT po.override_id) >= 3`,
    []
  );

  const anomalies: SpendAnomaly[] = [];

  // Calculate overall override rate for comparison
  const allOverrideRates = overrideResult.rows.map(
    (r) => Number(r.override_count) / Math.max(Number(r.decision_count), 1)
  );
  const overrideStats = calculateDescriptiveStats(allOverrideRates);

  for (const row of overrideResult.rows) {
    const overrideRate = Number(row.override_count) / Math.max(Number(row.decision_count), 1);

    // Flag if override rate is significantly above average
    if (overrideRate > 0.3 && Number(row.override_count) >= 5) {
      const anomalyResult = detectAnomalyIQR(overrideRate, overrideStats);

      if (anomalyResult.isAnomaly || overrideRate > 0.5) {
        const severity: SpendAnomaly['severity'] = overrideRate >= 0.7 ? 'high' : overrideRate >= 0.5 ? 'medium' : 'low';

        anomalies.push({
          anomalyId: `anomaly_circum_${row.traveller_id.substring(0, 8)}_${Date.now()}`,
          type: 'policy_circumvention',
          severity,
          title: `Potential policy circumvention: ${row.full_name}`,
          description: `${row.full_name} (${row.department}) has requested ${row.override_count} policy overrides out of ${row.decision_count} decisions (${(overrideRate * 100).toFixed(0)}% override rate) in the last ${lookbackDays} days. This may indicate systematic policy circumvention.`,
          detectedAt: new Date().toISOString(),
          affectedEntity: { type: 'traveller', id: row.traveller_id, name: row.full_name },
          currentValue: overrideRate,
          baselineValue: overrideStats.mean,
          deviationPercentage: overrideStats.mean > 0 ? ((overrideRate - overrideStats.mean) / overrideStats.mean) * 100 : 0,
          supportingData: [
            { metric: 'Override Rate', currentValue: overrideRate, baselineValue: overrideStats.mean, period: `Last ${lookbackDays} days` },
            { metric: 'Override Count', currentValue: Number(row.override_count), baselineValue: 0, period: `Last ${lookbackDays} days` },
            { metric: 'Total Decisions', currentValue: Number(row.decision_count), baselineValue: 0, period: `Last ${lookbackDays} days` },
          ],
        });
      }
    }
  }

  return anomalies;
}
