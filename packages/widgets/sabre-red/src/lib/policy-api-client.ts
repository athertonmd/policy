import { PolicyEvaluationRequest } from './fare-mapper';
import { PolicyDecision } from './mock-policy-evaluator';

export interface PolicyApiConfig {
  baseUrl: string;
  tenantId: string;
  timeoutMs?: number;
}

export interface PolicyApiResponse {
  decisions: PolicyDecision[];
}

export class PolicyApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly isTimeout?: boolean,
  ) {
    super(message);
    this.name = 'PolicyApiError';
  }
}

export async function callPolicyApi(
  request: PolicyEvaluationRequest,
  config: PolicyApiConfig,
): Promise<PolicyDecision[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs ?? 5000);

  try {
    const response = await fetch(`${config.baseUrl}/v1/policies/evaluate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': config.tenantId,
      },
      body: JSON.stringify({
        travellerId: request.travellerId,
        offers: request.offers,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new PolicyApiError(
        `Policy API returned ${response.status}`,
        response.status,
      );
    }

    const data = await response.json();

    // Validate response shape
    if (!data || !Array.isArray(data.decisions)) {
      throw new PolicyApiError('Malformed API response: missing decisions array');
    }

    return data.decisions;
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof PolicyApiError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new PolicyApiError('Policy API request timed out', undefined, true);
    }
    throw new PolicyApiError(
      error instanceof Error ? error.message : 'Unknown error calling Policy API',
    );
  }
}
