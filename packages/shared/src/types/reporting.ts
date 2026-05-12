/**
 * Reporting & Analytics types
 */

import { Money } from './common';

export interface SpendReportRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  groupBy: SpendGroupBy[];
  filters?: SpendFilter;
}

export type SpendGroupBy =
  | 'department'
  | 'cost_centre'
  | 'supplier'
  | 'trip_type'
  | 'cabin_class'
  | 'region'
  | 'month';

export interface SpendFilter {
  departments?: string[];
  costCentres?: string[];
  suppliers?: string[];
  tripTypes?: string[];
}

export interface CarbonReportRequest {
  tenantId: string;
  fromDate: string;
  toDate: string;
  groupBy: CarbonGroupBy[];
}

export type CarbonGroupBy = 'department' | 'trip_type' | 'transport_mode' | 'route' | 'month';

export interface Report {
  reportId: string;
  tenantId: string;
  type: string;
  generatedAt: string;
  data: Record<string, unknown>;
  summary: ReportSummary;
}

export interface ReportSummary {
  totalSpend?: Money;
  averageTripCost?: Money;
  complianceRate?: number;
  savingsAchieved?: Money;
  budgetVariance?: Money;
  totalCarbonKg?: number;
}

export interface ComplianceMetrics {
  tenantId: string;
  period: string;
  totalTrips: number;
  compliantTrips: number;
  complianceRate: number;
  overrideCount: number;
  topViolations: ViolationSummary[];
}

export interface ViolationSummary {
  ruleId: string;
  ruleName: string;
  violationCount: number;
  totalCostImpact: Money;
}

export interface ApprovalAnalytics {
  tenantId: string;
  period: string;
  averageApprovalTimeHours: number;
  slaComplianceRate: number;
  escalationRate: number;
  rejectionRate: number;
  autoApprovalRate: number;
  bottlenecks: ApproverBottleneck[];
}

export interface ApproverBottleneck {
  approverId: string;
  approverName: string;
  pendingCount: number;
  averageResponseTimeHours: number;
  escalationCount: number;
}

export interface BudgetUtilisation {
  budgetId: string;
  budgetName: string;
  scope: string;
  totalBudget: Money;
  currentSpend: Money;
  percentUsed: number;
  projectedEndOfPeriod: Money;
  warningThreshold: number;
  periodStart: string;
  periodEnd: string;
}

export interface MetricsFilter {
  fromDate: string;
  toDate: string;
  departments?: string[];
  costCentres?: string[];
}

export interface ScheduleReportRequest {
  tenantId: string;
  reportType: string;
  schedule: string;
  recipients: string[];
  filters?: Record<string, unknown>;
}

export interface ReportSchedule {
  scheduleId: string;
  tenantId: string;
  reportType: string;
  schedule: string;
  recipients: string[];
  isActive: boolean;
  lastRunAt?: string;
  nextRunAt: string;
  createdAt: string;
}
