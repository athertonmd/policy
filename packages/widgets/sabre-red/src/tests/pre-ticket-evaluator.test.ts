import { describe, it, expect } from 'vitest';
import { evaluatePreTicket, PreTicketCheckRequest } from '../lib/pre-ticket-evaluator';

describe('Pre-Ticket Evaluator', () => {
  it('totalCost ≤ £2000 returns proceed with no violations', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'ABC123',
      totalCost: { amount: 2000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('proceed');
    expect(result.reasons).toEqual([]);
    expect(result.violatedRules).toEqual([]);
  });

  it('totalCost £2001-£5000 returns hold with workflow ID', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'DEF456',
      totalCost: { amount: 3000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('hold');
    expect(result.reasons).toContain('Exceeds standard approval threshold');
    expect(result.violatedRules).toContain('Trip Cost Cap');
    expect(result.workflowId).toBeDefined();
    expect(typeof result.workflowId).toBe('string');
  });

  it('totalCost > £5000 returns block', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'GHI789',
      totalCost: { amount: 6000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('block');
    expect(result.reasons).toContain('Exceeds maximum trip budget');
    expect(result.violatedRules).toContain('Trip Budget Limit');
  });

  it('First class returns block regardless of cost', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'JKL012',
      totalCost: { amount: 500, currency: 'GBP' },
      travellerId: 'trav-001',
      cabinClass: 'First',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('block');
    expect(result.reasons).toContain('First class not permitted');
    expect(result.violatedRules).toContain('Cabin Class Restriction');
  });

  it('proceed result has empty reasons and violatedRules', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'MNO345',
      totalCost: { amount: 1000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('proceed');
    expect(result.reasons).toHaveLength(0);
    expect(result.violatedRules).toHaveLength(0);
  });

  it('hold result has a workflowId string', () => {
    const request: PreTicketCheckRequest = {
      pnrLocator: 'PQR678',
      totalCost: { amount: 4000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const result = evaluatePreTicket(request);
    expect(result.action).toBe('hold');
    expect(result.workflowId).toBeDefined();
    expect(typeof result.workflowId).toBe('string');
    expect(result.workflowId!.length).toBeGreaterThan(0);
  });

  it('hold/block never produces proceed', () => {
    const holdRequest: PreTicketCheckRequest = {
      pnrLocator: 'HOLD01',
      totalCost: { amount: 3500, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const holdResult = evaluatePreTicket(holdRequest);
    expect(holdResult.action).not.toBe('proceed');

    const blockRequest: PreTicketCheckRequest = {
      pnrLocator: 'BLOCK01',
      totalCost: { amount: 7000, currency: 'GBP' },
      travellerId: 'trav-001',
    };
    const blockResult = evaluatePreTicket(blockRequest);
    expect(blockResult.action).not.toBe('proceed');

    const firstClassRequest: PreTicketCheckRequest = {
      pnrLocator: 'FIRST01',
      totalCost: { amount: 100, currency: 'GBP' },
      travellerId: 'trav-001',
      cabinClass: 'First',
    };
    const firstClassResult = evaluatePreTicket(firstClassRequest);
    expect(firstClassResult.action).not.toBe('proceed');
  });
});
