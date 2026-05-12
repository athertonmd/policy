/**
 * Budget Calculator
 * Calculates budget status for a tenant/department/cost-centre and includes
 * BudgetStatus in the decision response.
 *
 * For now this provides a stub implementation that returns budget data
 * based on the tenant's schema. In production this would query Aurora PostgreSQL.
 */

import type { BudgetStatus, Money, Offer, TravellerContext } from '@travel-policy/shared';

export interface BudgetConfig {
  budgetId: string;
  budgetName: string;
  totalBudget: Money;
  currentUtilisation: Money;
  warningThreshold: number; // percentage (0-100)
}

export interface BudgetCalculationInput {
  tenantId: string;
  traveller: TravellerContext;
  offers: Offer[];
  budgetConfig?: BudgetConfig;
}

/**
 * Calculates the budget status after applying the proposed offers.
 * Returns BudgetStatus with projected utilisation including the new spend.
 *
 * If no budgetConfig is provided, returns undefined (budget tracking not configured).
 */
export function calculateBudgetStatus(input: BudgetCalculationInput): BudgetStatus | undefined {
  const { offers, budgetConfig } = input;

  if (!budgetConfig) {
    return undefined;
  }

  // Sum the total cost of all offers (use the first offer's currency or budget currency)
  const totalOfferCost = offers.reduce((sum, offer) => sum + offer.totalPrice.amount, 0);
  const currency = budgetConfig.totalBudget.currency;

  const currentAmount = budgetConfig.currentUtilisation.amount;
  const projectedAmount = currentAmount + totalOfferCost;
  const totalBudgetAmount = budgetConfig.totalBudget.amount;

  const percentUsed =
    totalBudgetAmount > 0
      ? Math.round((projectedAmount / totalBudgetAmount) * 10000) / 100
      : 0;

  return {
    budgetId: budgetConfig.budgetId,
    budgetName: budgetConfig.budgetName,
    totalBudget: budgetConfig.totalBudget,
    currentUtilisation: { amount: currentAmount, currency },
    projectedUtilisation: { amount: projectedAmount, currency },
    percentUsed,
    warningThreshold: budgetConfig.warningThreshold,
  };
}

/**
 * Stub: Loads budget configuration for a tenant/traveller from the data store.
 * In production, this queries the tenant's `budgets` table in Aurora PostgreSQL.
 */
export async function loadBudgetConfig(
  tenantId: string,
  traveller: TravellerContext
): Promise<BudgetConfig | undefined> {
  // Stub implementation — returns undefined (no budget configured)
  // In production: query {tenant_schema}.budgets WHERE scope matches department/cost_centre
  void tenantId;
  void traveller;
  return undefined;
}
