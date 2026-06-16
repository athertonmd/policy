import { PolicyEvaluationRequest } from './fare-mapper';
import { PolicyDecision, evaluateFares } from './mock-policy-evaluator';
import { callPolicyApi, PolicyApiError } from './policy-api-client';
import { getConfig } from './config';

export type EvaluationMode = 'mock' | 'api' | 'auto';

export interface EvaluationResult {
  decisions: PolicyDecision[];
  source: 'mock' | 'api';
  error?: string;
}

export async function evaluateWithService(
  request: PolicyEvaluationRequest,
): Promise<EvaluationResult> {
  const config = getConfig();
  const mode = config.policyApiMode;
  const apiUrl = config.policyApiUrl;

  // Determine if we should try the API
  const shouldUseApi =
    mode === 'api' || (mode === 'auto' && !!apiUrl);

  if (!shouldUseApi) {
    // Use mock evaluator
    return {
      decisions: evaluateFares(request),
      source: 'mock',
    };
  }

  // Try API
  try {
    const decisions = await callPolicyApi(request, {
      baseUrl: apiUrl,
      tenantId: config.tenantId,
      timeoutMs: 5000,
    });
    return { decisions, source: 'api' };
  } catch (error) {
    // API failed — return error state but don't crash
    const errorMsg = error instanceof PolicyApiError
      ? error.message
      : 'Policy service unavailable';
    console.warn('[PolicyEvaluationService]', errorMsg);

    // Fallback to mock if API fails (graceful degradation)
    return {
      decisions: evaluateFares(request),
      source: 'mock',
      error: errorMsg,
    };
  }
}
