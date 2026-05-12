/**
 * Statistical analysis functions for AI-powered policy recommendations.
 * Provides utilities for anomaly detection, trend analysis, and confidence scoring.
 */

export interface DescriptiveStats {
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
  count: number;
  q1: number;
  q3: number;
  iqr: number;
}

export interface AnomalyResult {
  value: number;
  zScore: number;
  isAnomaly: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  deviationFromMean: number;
}

export interface TrendResult {
  slope: number;
  intercept: number;
  rSquared: number;
  direction: 'increasing' | 'decreasing' | 'stable';
  isSignificant: boolean;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

/**
 * Calculates descriptive statistics for a numeric dataset.
 */
export function calculateDescriptiveStats(values: number[]): DescriptiveStats {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdDev: 0, min: 0, max: 0, count: 0, q1: 0, q3: 0, iqr: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const count = sorted.length;
  const mean = sorted.reduce((sum, v) => sum + v, 0) / count;

  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  const variance = sorted.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / count;
  const stdDev = Math.sqrt(variance);

  const q1 = percentile(sorted, 25);
  const q3 = percentile(sorted, 75);
  const iqr = q3 - q1;

  return {
    mean,
    median,
    stdDev,
    min: sorted[0],
    max: sorted[count - 1],
    count,
    q1,
    q3,
    iqr,
  };
}

/**
 * Calculates the percentile value from a sorted array.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

/**
 * Detects anomalies using Z-score method with configurable thresholds.
 */
export function detectAnomaly(
  value: number,
  stats: DescriptiveStats,
  thresholds = { low: 2, medium: 2.5, high: 3, critical: 4 }
): AnomalyResult {
  if (stats.stdDev === 0) {
    return {
      value,
      zScore: 0,
      isAnomaly: false,
      severity: 'low',
      deviationFromMean: 0,
    };
  }

  const zScore = Math.abs((value - stats.mean) / stats.stdDev);
  const deviationFromMean = value - stats.mean;

  let severity: AnomalyResult['severity'] = 'low';
  let isAnomaly = false;

  if (zScore >= thresholds.critical) {
    severity = 'critical';
    isAnomaly = true;
  } else if (zScore >= thresholds.high) {
    severity = 'high';
    isAnomaly = true;
  } else if (zScore >= thresholds.medium) {
    severity = 'medium';
    isAnomaly = true;
  } else if (zScore >= thresholds.low) {
    severity = 'low';
    isAnomaly = true;
  }

  return { value, zScore, isAnomaly, severity, deviationFromMean };
}

/**
 * Detects anomalies using the IQR (Interquartile Range) method.
 * More robust to outliers than Z-score for non-normal distributions.
 */
export function detectAnomalyIQR(
  value: number,
  stats: DescriptiveStats,
  multiplier = 1.5
): AnomalyResult {
  const lowerFence = stats.q1 - multiplier * stats.iqr;
  const upperFence = stats.q3 + multiplier * stats.iqr;

  const isAnomaly = value < lowerFence || value > upperFence;
  const deviationFromMean = value - stats.mean;

  // Calculate severity based on how far beyond the fence
  let severity: AnomalyResult['severity'] = 'low';
  if (isAnomaly) {
    const extremeLower = stats.q1 - 3 * stats.iqr;
    const extremeUpper = stats.q3 + 3 * stats.iqr;
    if (value < extremeLower || value > extremeUpper) {
      severity = 'critical';
    } else {
      const moderateLower = stats.q1 - 2 * stats.iqr;
      const moderateUpper = stats.q3 + 2 * stats.iqr;
      if (value < moderateLower || value > moderateUpper) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
    }
  }

  const zScore = stats.stdDev > 0 ? Math.abs((value - stats.mean) / stats.stdDev) : 0;

  return { value, zScore, isAnomaly, severity, deviationFromMean };
}

/**
 * Performs simple linear regression on time-series data.
 * Returns trend direction, slope, and R-squared goodness of fit.
 */
export function calculateTrend(dataPoints: { x: number; y: number }[]): TrendResult {
  const n = dataPoints.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, rSquared: 0, direction: 'stable', isSignificant: false };
  }

  const sumX = dataPoints.reduce((s, p) => s + p.x, 0);
  const sumY = dataPoints.reduce((s, p) => s + p.y, 0);
  const sumXY = dataPoints.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = dataPoints.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = dataPoints.reduce((s, p) => s + p.y * p.y, 0);

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, rSquared: 0, direction: 'stable', isSignificant: false };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared calculation
  const ssRes = dataPoints.reduce((s, p) => {
    const predicted = slope * p.x + intercept;
    return s + Math.pow(p.y - predicted, 2);
  }, 0);
  const meanY = sumY / n;
  const ssTot = dataPoints.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  // Determine direction and significance
  const direction: TrendResult['direction'] =
    Math.abs(slope) < 0.001 ? 'stable' : slope > 0 ? 'increasing' : 'decreasing';

  // Significance: R² > 0.5 and at least 5 data points
  const isSignificant = rSquared > 0.5 && n >= 5;

  return { slope, intercept, rSquared, direction, isSignificant };
}

/**
 * Calculates a confidence score (0-1) based on sample size and variance.
 * Higher sample sizes and lower variance yield higher confidence.
 */
export function calculateConfidenceScore(
  sampleSize: number,
  variance: number,
  minSampleSize = 30
): number {
  if (sampleSize === 0) return 0;

  // Sample size factor: approaches 1 as sample size grows
  const sizeFactor = Math.min(1, sampleSize / (minSampleSize * 3));

  // Variance factor: lower variance = higher confidence
  // Normalise variance to 0-1 range using sigmoid-like function
  const varianceFactor = 1 / (1 + Math.sqrt(variance));

  // Combined confidence: weighted average
  const confidence = 0.6 * sizeFactor + 0.4 * varianceFactor;

  return Math.round(confidence * 100) / 100;
}

/**
 * Calculates a confidence interval for a mean estimate.
 */
export function calculateConfidenceInterval(
  mean: number,
  stdDev: number,
  sampleSize: number,
  confidenceLevel = 0.95
): ConfidenceInterval {
  if (sampleSize <= 1) {
    return { lower: mean, upper: mean, level: confidenceLevel };
  }

  // Z-scores for common confidence levels
  const zScores: Record<number, number> = {
    0.90: 1.645,
    0.95: 1.96,
    0.99: 2.576,
  };

  const z = zScores[confidenceLevel] ?? 1.96;
  const marginOfError = z * (stdDev / Math.sqrt(sampleSize));

  return {
    lower: mean - marginOfError,
    upper: mean + marginOfError,
    level: confidenceLevel,
  };
}

/**
 * Calculates the proportion and its confidence interval.
 * Useful for compliance rates, override rates, etc.
 */
export function calculateProportionCI(
  successes: number,
  total: number,
  confidenceLevel = 0.95
): { proportion: number; ci: ConfidenceInterval } {
  if (total === 0) {
    return { proportion: 0, ci: { lower: 0, upper: 0, level: confidenceLevel } };
  }

  const proportion = successes / total;

  // Wilson score interval for better small-sample behaviour
  const zScores: Record<number, number> = { 0.90: 1.645, 0.95: 1.96, 0.99: 2.576 };
  const z = zScores[confidenceLevel] ?? 1.96;
  const z2 = z * z;

  const denominator = 1 + z2 / total;
  const centre = (proportion + z2 / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt(
    (proportion * (1 - proportion)) / total + z2 / (4 * total * total)
  );

  return {
    proportion,
    ci: {
      lower: Math.max(0, centre - margin),
      upper: Math.min(1, centre + margin),
      level: confidenceLevel,
    },
  };
}
