/**
 * AI-Powered Policy Recommendations Service — Barrel exports
 *
 * Provides AI-driven insights for travel policy optimisation:
 * - Policy optimisation recommendations (Requirement 30.1, 30.2)
 * - Approval prediction scoring (Requirement 30.3)
 * - Spend anomaly detection (Requirement 30.4)
 * - Natural language policy queries via Bedrock (Requirement 30.5)
 */

// Handlers
export { policyRecommendationsHandler } from './handlers/policy-recommendations';
export type { PolicyRecommendation, SupportingEvidence } from './handlers/policy-recommendations';

export { approvalPredictionHandler } from './handlers/approval-prediction';
export type {
  ApprovalPredictionRequest,
  ApprovalPrediction,
  PredictionFactor,
  SimilarDecision,
  RiskIndicator,
} from './handlers/approval-prediction';

export { anomalyDetectionHandler } from './handlers/anomaly-detection';
export type { SpendAnomaly, AnomalySupportingData } from './handlers/anomaly-detection';

export { naturalLanguageQueryHandler } from './handlers/natural-language-query';
export type {
  NaturalLanguageQueryRequest,
  NaturalLanguageQueryResponse,
  DataPoint,
} from './handlers/natural-language-query';

// Library utilities
export { getBedrockClient, invokeModel, queryBedrock } from './lib/bedrock-client';
export type { BedrockMessage, BedrockInvokeOptions, BedrockResponse } from './lib/bedrock-client';

export {
  calculateDescriptiveStats,
  detectAnomaly,
  detectAnomalyIQR,
  calculateTrend,
  calculateConfidenceScore,
  calculateConfidenceInterval,
  calculateProportionCI,
  percentile,
} from './lib/statistical-analysis';
export type {
  DescriptiveStats,
  AnomalyResult,
  TrendResult,
  ConfidenceInterval,
} from './lib/statistical-analysis';

// Database
export { createDatabaseClient, getDatabaseCredentials, withDatabase } from './lib/database';
export type { DatabaseClient, DatabaseCredentials, QueryResult } from './lib/database';
