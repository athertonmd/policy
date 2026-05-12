/**
 * Typed API client for all backend services.
 * Handles authentication headers, error handling, and response typing.
 */

import { getAccessToken } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

export interface ApiError {
  statusCode: number;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextToken?: string;
  totalCount?: number;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`, window.location.origin);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const token = getAccessToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error: ApiError = {
        statusCode: response.status,
        message: response.statusText,
      };
      try {
        const errorBody = await response.json();
        error.message = errorBody.message || error.message;
        error.details = errorBody.details;
      } catch {
        // Use default error message
      }
      throw error;
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Policy endpoints
  async listPolicies(params?: Record<string, string>) {
    return this.request<PaginatedResponse<PolicyRule>>('GET', '/v1/policies/rules', undefined, params);
  }

  async getPolicy(ruleId: string) {
    return this.request<PolicyRule>('GET', `/v1/policies/rules/${ruleId}`);
  }

  async createPolicy(rule: CreatePolicyRequest) {
    return this.request<PolicyRule>('POST', '/v1/policies/rules', rule);
  }

  async updatePolicy(ruleId: string, rule: UpdatePolicyRequest) {
    return this.request<PolicyRule>('PUT', `/v1/policies/rules/${ruleId}`, rule);
  }

  async getPolicyVersions(ruleId: string) {
    return this.request<PaginatedResponse<PolicyVersion>>('GET', `/v1/policies/rules/${ruleId}/versions`);
  }

  async rollbackPolicy(ruleId: string, version: number) {
    return this.request<PolicyRule>('POST', `/v1/policies/rules/${ruleId}/rollback`, { version });
  }

  async simulatePolicy(request: SimulationRequest) {
    return this.request<SimulationResult>('POST', '/v1/policies/simulate', request);
  }

  async evaluatePolicy(request: EvaluationRequest) {
    return this.request<EvaluationResult>('POST', '/v1/policies/evaluate', request);
  }

  // Approval endpoints
  async listApprovals(params?: Record<string, string>) {
    return this.request<PaginatedResponse<ApprovalItem>>('GET', '/v1/approvals/workflows', undefined, params);
  }

  async submitApprovalAction(workflowId: string, action: ApprovalAction) {
    return this.request<void>('POST', `/v1/approvals/actions`, { workflowId, ...action });
  }

  async bulkApprovalAction(actions: BulkApprovalRequest) {
    return this.request<BulkApprovalResult>('POST', '/v1/approvals/actions/bulk', actions);
  }

  // TMC Dashboard endpoints
  async getTmcQueue(params?: Record<string, string>) {
    return this.request<PaginatedResponse<TmcQueueItem>>('GET', '/v1/tmc/queue', undefined, params);
  }

  // Report endpoints
  async getSpendReport(params?: Record<string, string>) {
    return this.request<SpendReport>('GET', '/v1/reports/spend', undefined, params);
  }

  async getCarbonReport(params?: Record<string, string>) {
    return this.request<CarbonReport>('GET', '/v1/reports/carbon', undefined, params);
  }

  async getApprovalAnalytics(params?: Record<string, string>) {
    return this.request<ApprovalAnalytics>('GET', '/v1/reports/approvals', undefined, params);
  }

  async getBudgetReport(params?: Record<string, string>) {
    return this.request<BudgetReport>('GET', '/v1/reports/budgets', undefined, params);
  }

  async getComplianceReport(params?: Record<string, string>) {
    return this.request<ComplianceReport>('GET', '/v1/reports/compliance', undefined, params);
  }

  // Profile endpoints
  async listProfiles(params?: Record<string, string>) {
    return this.request<PaginatedResponse<TravellerProfile>>('GET', '/v1/profiles', undefined, params);
  }

  async getProfile(travellerId: string) {
    return this.request<TravellerProfile>('GET', `/v1/profiles/${travellerId}`);
  }

  async updateProfile(travellerId: string, data: UpdateProfileRequest) {
    return this.request<TravellerProfile>('PUT', `/v1/profiles/${travellerId}`, data);
  }

  // Override endpoints
  async listOverrides(params?: Record<string, string>) {
    return this.request<PaginatedResponse<OverrideRequest>>('GET', '/v1/overrides', undefined, params);
  }

  async createOverride(request: CreateOverrideRequest) {
    return this.request<OverrideRequest>('POST', '/v1/overrides', request);
  }
}

// Types
export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  dsl: string;
  version: number;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface PolicyVersion {
  version: number;
  dsl: string;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  createdBy: string;
  changeDescription?: string;
}

export interface CreatePolicyRequest {
  name: string;
  description: string;
  dsl: string;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  dsl?: string;
  status?: 'draft' | 'active' | 'archived';
}

export interface SimulationRequest {
  draftRuleId?: string;
  draftDsl?: string;
  dateRange: { start: string; end: string };
  compareWithActive?: boolean;
}

export interface SimulationResult {
  id: string;
  tripsEvaluated: number;
  tripsAffected: number;
  approvalRateChange: number;
  costImpact: number;
  comparisonDetails: SimulationComparison[];
}

export interface SimulationComparison {
  tripId: string;
  currentDecision: string;
  proposedDecision: string;
  reason: string;
}

export interface EvaluationRequest {
  travellerId: string;
  tripContext: Record<string, unknown>;
  offers: Record<string, unknown>[];
}

export interface EvaluationResult {
  decision: 'approve' | 'reject' | 'flag';
  reasons: string[];
  obligations: string[];
  alternatives?: Record<string, unknown>[];
}

export interface ApprovalItem {
  id: string;
  workflowId: string;
  type: 'booking' | 'override' | 'budget_exception';
  status: 'pending' | 'approved' | 'rejected' | 'escalated';
  traveller: { id: string; name: string; department: string };
  trip: { destination: string; dates: string; amount: number; currency: string };
  policyViolations: string[];
  submittedAt: string;
  dueBy?: string;
  assignedTo?: string;
}

export interface ApprovalAction {
  action: 'approve' | 'reject' | 'request_info' | 'escalate';
  comment?: string;
}

export interface BulkApprovalRequest {
  workflowIds: string[];
  action: 'approve' | 'reject';
  comment?: string;
}

export interface BulkApprovalResult {
  succeeded: string[];
  failed: { id: string; reason: string }[];
}

export interface TmcQueueItem extends ApprovalItem {
  priority: 'high' | 'medium' | 'low';
  slaBreached: boolean;
  category: 'approval' | 'exception' | 'override' | 'sla_breach';
}

export interface SpendReport {
  totalSpend: number;
  currency: string;
  averageTripCost: number;
  complianceRate: number;
  savings: number;
  budgetVariance: number;
  byDepartment: { name: string; spend: number }[];
  byMonth: { month: string; spend: number }[];
  byCategory: { category: string; spend: number }[];
}

export interface CarbonReport {
  totalEmissions: number;
  unit: string;
  target: number;
  offsetPurchased: number;
  byTransportMode: { mode: string; emissions: number }[];
  byMonth: { month: string; emissions: number }[];
  byDepartment: { name: string; emissions: number }[];
}

export interface ApprovalAnalytics {
  averageApprovalTime: number;
  slaCompliance: number;
  escalationRate: number;
  rejectionRate: number;
  autoApprovalRate: number;
  bottlenecks: { approver: string; avgTime: number; queueDepth: number }[];
  byMonth: { month: string; avgTime: number; volume: number }[];
}

export interface BudgetReport {
  budgets: BudgetItem[];
  totalAllocated: number;
  totalUtilised: number;
  currency: string;
}

export interface BudgetItem {
  id: string;
  name: string;
  level: 'tenant' | 'department' | 'cost_centre' | 'project';
  allocated: number;
  utilised: number;
  period: string;
  warningThreshold: number;
}

export interface ComplianceReport {
  overallRate: number;
  byDepartment: { name: string; rate: number }[];
  byTripType: { type: string; rate: number }[];
  trends: { month: string; rate: number }[];
  leakageRate: number;
  topViolations: { rule: string; count: number }[];
}

export interface TravellerProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department: string;
  costCentre: string;
  jobTitle: string;
  managerId?: string;
  loyaltyProgrammes: { airline?: string; hotel?: string }[];
  preferences: { seatPreference?: string; mealPreference?: string };
  location?: { country: string; city: string; latitude?: number; longitude?: number };
  lastUpdated: string;
}

export interface UpdateProfileRequest {
  preferences?: TravellerProfile['preferences'];
  loyaltyProgrammes?: TravellerProfile['loyaltyProgrammes'];
}

export interface OverrideRequest {
  id: string;
  travellerId: string;
  travellerName: string;
  ruleId: string;
  ruleName: string;
  reasonCategory: 'business_critical' | 'client_meeting' | 'emergency' | 'vip' | 'other';
  justification: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export interface CreateOverrideRequest {
  ruleId: string;
  reasonCategory: OverrideRequest['reasonCategory'];
  justification: string;
  tripDetails: Record<string, unknown>;
}

export const apiClient = new ApiClient(API_BASE_URL);
