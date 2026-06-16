export interface PreTicketCheckRequest {
  pnrLocator: string;
  totalCost: { amount: number; currency: string };
  travellerId: string;
  cabinClass?: string;
}

export interface PreTicketResult {
  action: 'proceed' | 'hold' | 'block';
  reasons: string[];
  violatedRules: string[];
  workflowId?: string;
}

export function evaluatePreTicket(request: PreTicketCheckRequest): PreTicketResult {
  // Rule: First class is always blocked regardless of cost
  if (request.cabinClass?.toLowerCase() === 'first') {
    return {
      action: 'block',
      reasons: ['First class not permitted'],
      violatedRules: ['Cabin Class Restriction'],
    };
  }

  const amount = request.totalCost.amount;

  // Rule: > £5000 → block
  if (amount > 5000) {
    return {
      action: 'block',
      reasons: ['Exceeds maximum trip budget'],
      violatedRules: ['Trip Budget Limit'],
    };
  }

  // Rule: > £2000 and ≤ £5000 → hold
  if (amount > 2000) {
    return {
      action: 'hold',
      reasons: ['Exceeds standard approval threshold'],
      violatedRules: ['Trip Cost Cap'],
      workflowId: crypto.randomUUID(),
    };
  }

  // Rule: ≤ £2000 → proceed
  return {
    action: 'proceed',
    reasons: [],
    violatedRules: [],
  };
}
