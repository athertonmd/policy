/**
 * Budget Utilisation Updater — EventBridge handler
 *
 * Subscribes to ApprovalWorkflowCompleted events (approved trips) and updates
 * budget utilisation in near-real-time (within 60 seconds of approval).
 *
 * Responsibilities:
 * - Calculate trip cost from the approval event payload
 * - Find applicable budgets (tenant, department, cost_centre, project)
 * - Atomically increment utilisation
 * - Check warning threshold (default 80%) and send notification if breached
 * - Trigger finance approval obligation when utilisation would exceed 100%
 *
 * Requirements: 14.3, 14.4, 14.5
 */
import type { EventBridgeEvent } from 'aws-lambda';
import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import { withDatabase } from '../lib/database';
import {
  findApplicableBudgets,
  incrementUtilisation,
  type UtilisationUpdateResult,
} from '../lib/budget-repository';

const eventBridgeClient = new EventBridgeClient({});
const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME ?? 'travel-policy-platform';

/**
 * Payload structure from ApprovalWorkflowCompleted event.
 */
interface ApprovalCompletedPayload {
  tenantId: string;
  workflowId: string;
  tripRequestId: string;
  travellerId: string;
  outcome: 'approved' | 'rejected';
  totalCost: {
    amount: number;
    currency: string;
  };
  department?: string;
  costCentre?: string;
  project?: string;
  approvedAt: string;
  correlationId: string;
}

interface EventDetail {
  tenantId: string;
  correlationId: string;
  aggregateId: string;
  aggregateType: string;
  payload: ApprovalCompletedPayload;
}

/**
 * EventBridge handler for ApprovalWorkflowCompleted events.
 * Updates budget utilisation when a trip is approved.
 */
export async function handler(
  event: EventBridgeEvent<'ApprovalWorkflowCompleted', EventDetail>
): Promise<void> {
  const detail = event.detail;
  const payload = detail.payload;

  // Only process approved trips
  if (payload.outcome !== 'approved') {
    console.log(`Skipping non-approved workflow: ${payload.workflowId}, outcome: ${payload.outcome}`);
    return;
  }

  const tenantId = payload.tenantId;
  const tripCost = payload.totalCost.amount;
  const approvedDate = payload.approvedAt?.split('T')[0] ?? new Date().toISOString().split('T')[0];

  // Resolve tenant schema from tenantId
  const tenantSchema = resolveTenantSchema(tenantId);

  console.log(`Processing budget update for tenant ${tenantId}, trip cost: ${tripCost} ${payload.totalCost.currency}`);

  await withDatabase(async (client) => {
    // Find all applicable budgets for this trip
    const applicableBudgets = await findApplicableBudgets(
      client,
      tenantSchema,
      tenantId,
      payload.department,
      payload.costCentre,
      approvedDate
    );

    if (applicableBudgets.length === 0) {
      console.log(`No applicable budgets found for tenant ${tenantId}`);
      return;
    }

    console.log(`Found ${applicableBudgets.length} applicable budget(s) to update`);

    // Update each applicable budget
    const updateResults: UtilisationUpdateResult[] = [];

    for (const budget of applicableBudgets) {
      const result = await incrementUtilisation(
        client,
        tenantSchema,
        budget.budget_id,
        tripCost
      );

      if (result) {
        updateResults.push(result);
        console.log(
          `Updated budget ${budget.budget_id}: ${result.previous_utilisation} → ${result.new_utilisation} / ${result.amount}`
        );
      }
    }

    // Process threshold breaches
    await processThresholdBreaches(updateResults, payload, tenantId);
  });
}

/**
 * Processes threshold breaches and triggers appropriate actions.
 */
async function processThresholdBreaches(
  results: UtilisationUpdateResult[],
  payload: ApprovalCompletedPayload,
  tenantId: string
): Promise<void> {
  const events: Array<{
    Source: string;
    DetailType: string;
    Detail: string;
    EventBusName: string;
  }> = [];

  for (const result of results) {
    const previousPercent = result.amount > 0
      ? (result.previous_utilisation / result.amount) * 100
      : 0;
    const newPercent = result.amount > 0
      ? (result.new_utilisation / result.amount) * 100
      : 0;

    // Check if warning threshold was just crossed (wasn't breached before, is now)
    const wasThresholdBreached = previousPercent >= result.warning_threshold;
    const isThresholdBreached = newPercent >= result.warning_threshold;

    if (isThresholdBreached && !wasThresholdBreached) {
      console.log(
        `Budget ${result.budget_id} crossed warning threshold: ${newPercent.toFixed(1)}% >= ${result.warning_threshold}%`
      );

      // Send BudgetThresholdBreached event for notification
      events.push({
        Source: 'travel-policy-platform',
        DetailType: 'BudgetThresholdBreached',
        Detail: JSON.stringify({
          tenantId,
          correlationId: payload.correlationId,
          aggregateId: result.budget_id,
          aggregateType: 'Budget',
          payload: {
            budgetId: result.budget_id,
            tenantId,
            thresholdType: 'warning',
            thresholdValue: result.warning_threshold,
            currentUtilisation: result.new_utilisation,
            totalBudget: result.amount,
            percentUsed: Math.round(newPercent * 100) / 100,
            triggeredBy: {
              workflowId: payload.workflowId,
              tripRequestId: payload.tripRequestId,
              travellerId: payload.travellerId,
            },
            breachedAt: new Date().toISOString(),
          },
        }),
        EventBusName: EVENT_BUS_NAME,
      });
    }

    // Check if budget exceeded 100% — trigger finance approval obligation
    const wasOverBudget = previousPercent >= 100;
    const isOverBudget = newPercent >= 100;

    if (isOverBudget && !wasOverBudget) {
      console.log(
        `Budget ${result.budget_id} exceeded 100%: ${newPercent.toFixed(1)}% — triggering finance approval`
      );

      events.push({
        Source: 'travel-policy-platform',
        DetailType: 'BudgetThresholdBreached',
        Detail: JSON.stringify({
          tenantId,
          correlationId: payload.correlationId,
          aggregateId: result.budget_id,
          aggregateType: 'Budget',
          payload: {
            budgetId: result.budget_id,
            tenantId,
            thresholdType: 'exceeded',
            thresholdValue: 100,
            currentUtilisation: result.new_utilisation,
            totalBudget: result.amount,
            percentUsed: Math.round(newPercent * 100) / 100,
            requiresFinanceApproval: true,
            triggeredBy: {
              workflowId: payload.workflowId,
              tripRequestId: payload.tripRequestId,
              travellerId: payload.travellerId,
            },
            breachedAt: new Date().toISOString(),
          },
        }),
        EventBusName: EVENT_BUS_NAME,
      });
    }
  }

  // Publish all events in a single batch
  if (events.length > 0) {
    try {
      await eventBridgeClient.send(
        new PutEventsCommand({
          Entries: events,
        })
      );
      console.log(`Published ${events.length} threshold breach event(s)`);
    } catch (error) {
      console.error('Failed to publish threshold breach events:', error);
      throw error;
    }
  }
}

/**
 * Resolves the tenant database schema name from the tenant ID.
 * Convention: tenant_{short_id} where short_id is first 8 chars of UUID.
 */
function resolveTenantSchema(tenantId: string): string {
  const schemaOverride = process.env.TENANT_SCHEMA_OVERRIDE;
  if (schemaOverride) {
    return schemaOverride;
  }
  const shortId = tenantId.replace(/-/g, '').substring(0, 8);
  return `tenant_${shortId}`;
}
