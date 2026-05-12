import { describe, it, expect } from 'vitest';
import {
  evaluateCondition,
  resolveField,
  compareValues,
  type EvaluationInput,
} from './condition-evaluator.js';
import type { PolicyCondition } from '@travel-policy/shared';

const sampleInput: EvaluationInput = {
  traveller: {
    travellerId: 'trav-001',
    employeeId: 'EMP-123',
    department: 'Engineering',
    costCentre: 'CC-100',
    seniorityLevel: 'senior',
    region: 'UK',
    loyaltyTiers: { airline: 'gold', hotel: 'platinum' },
  },
  trip: {
    tripId: 'trip-001',
    tripType: 'international',
    origin: { code: 'LHR', city: 'London', country: 'UK' },
    destination: { code: 'JFK', city: 'New York', country: 'US' },
    departureDate: '2024-06-15',
    returnDate: '2024-06-20',
    leadTimeDays: 14,
    purpose: 'conference',
  },
  offer: {
    offerId: 'offer-001',
    supplier: 'British Airways',
    productType: 'air',
    cabinClass: 'business',
    totalPrice: { amount: 2500, currency: 'GBP' },
    carbonFootprintKg: 450,
    refundable: true,
  },
  metadata: {
    source: 'api',
    version: '1.0',
  },
};

describe('resolveField', () => {
  it('resolves top-level traveller fields', () => {
    expect(resolveField(sampleInput, 'traveller.department')).toBe('Engineering');
    expect(resolveField(sampleInput, 'traveller.seniorityLevel')).toBe('senior');
    expect(resolveField(sampleInput, 'traveller.region')).toBe('UK');
  });

  it('resolves nested traveller fields', () => {
    expect(resolveField(sampleInput, 'traveller.loyaltyTiers.airline')).toBe('gold');
  });

  it('resolves trip fields', () => {
    expect(resolveField(sampleInput, 'trip.tripType')).toBe('international');
    expect(resolveField(sampleInput, 'trip.leadTimeDays')).toBe(14);
  });

  it('resolves nested trip fields', () => {
    expect(resolveField(sampleInput, 'trip.origin.code')).toBe('LHR');
    expect(resolveField(sampleInput, 'trip.destination.country')).toBe('US');
  });

  it('resolves offer fields', () => {
    expect(resolveField(sampleInput, 'offer.cabinClass')).toBe('business');
    expect(resolveField(sampleInput, 'offer.totalPrice.amount')).toBe(2500);
    expect(resolveField(sampleInput, 'offer.carbonFootprintKg')).toBe(450);
  });

  it('resolves metadata fields', () => {
    expect(resolveField(sampleInput, 'metadata.source')).toBe('api');
  });

  it('returns undefined for non-existent fields', () => {
    expect(resolveField(sampleInput, 'traveller.nonExistent')).toBeUndefined();
    expect(resolveField(sampleInput, 'unknown.field')).toBeUndefined();
  });

  it('returns undefined for deeply nested non-existent paths', () => {
    expect(resolveField(sampleInput, 'traveller.loyaltyTiers.nonExistent')).toBeUndefined();
  });
});

describe('compareValues', () => {
  describe('eq operator', () => {
    it('compares equal strings', () => {
      expect(compareValues('hello', 'eq', 'hello')).toBe(true);
      expect(compareValues('hello', 'eq', 'world')).toBe(false);
    });

    it('compares equal numbers', () => {
      expect(compareValues(42, 'eq', 42)).toBe(true);
      expect(compareValues(42, 'eq', 43)).toBe(false);
    });

    it('handles numeric string comparison', () => {
      expect(compareValues(42, 'eq', '42')).toBe(true);
      expect(compareValues('42', 'eq', 42)).toBe(true);
    });
  });

  describe('neq operator', () => {
    it('returns true for different values', () => {
      expect(compareValues('hello', 'neq', 'world')).toBe(true);
      expect(compareValues(42, 'neq', 43)).toBe(true);
    });

    it('returns false for equal values', () => {
      expect(compareValues('hello', 'neq', 'hello')).toBe(false);
    });
  });

  describe('gt operator', () => {
    it('compares numbers', () => {
      expect(compareValues(10, 'gt', 5)).toBe(true);
      expect(compareValues(5, 'gt', 10)).toBe(false);
      expect(compareValues(5, 'gt', 5)).toBe(false);
    });

    it('handles string numbers', () => {
      expect(compareValues('10', 'gt', 5)).toBe(true);
      expect(compareValues(10, 'gt', '5')).toBe(true);
    });
  });

  describe('gte operator', () => {
    it('compares numbers', () => {
      expect(compareValues(10, 'gte', 5)).toBe(true);
      expect(compareValues(5, 'gte', 5)).toBe(true);
      expect(compareValues(4, 'gte', 5)).toBe(false);
    });
  });

  describe('lt operator', () => {
    it('compares numbers', () => {
      expect(compareValues(5, 'lt', 10)).toBe(true);
      expect(compareValues(10, 'lt', 5)).toBe(false);
      expect(compareValues(5, 'lt', 5)).toBe(false);
    });
  });

  describe('lte operator', () => {
    it('compares numbers', () => {
      expect(compareValues(5, 'lte', 10)).toBe(true);
      expect(compareValues(5, 'lte', 5)).toBe(true);
      expect(compareValues(6, 'lte', 5)).toBe(false);
    });
  });

  describe('in operator', () => {
    it('checks membership in array', () => {
      expect(compareValues('business', 'in', ['economy', 'business', 'first'])).toBe(true);
      expect(compareValues('premium', 'in', ['economy', 'business', 'first'])).toBe(false);
    });

    it('handles numeric values', () => {
      expect(compareValues(2, 'in', [1, 2, 3])).toBe(true);
      expect(compareValues(4, 'in', [1, 2, 3])).toBe(false);
    });

    it('returns false for non-array target', () => {
      expect(compareValues('test', 'in', 'test')).toBe(false);
    });
  });

  describe('not_in operator', () => {
    it('checks non-membership in array', () => {
      expect(compareValues('premium', 'not_in', ['economy', 'business'])).toBe(true);
      expect(compareValues('business', 'not_in', ['economy', 'business'])).toBe(false);
    });
  });

  describe('contains operator', () => {
    it('checks string containment', () => {
      expect(compareValues('hello world', 'contains', 'world')).toBe(true);
      expect(compareValues('hello world', 'contains', 'xyz')).toBe(false);
    });

    it('checks array containment', () => {
      expect(compareValues(['a', 'b', 'c'], 'contains', 'b')).toBe(true);
      expect(compareValues(['a', 'b', 'c'], 'contains', 'd')).toBe(false);
    });

    it('returns false for non-string/non-array field', () => {
      expect(compareValues(42, 'contains', '4')).toBe(false);
    });
  });

  describe('matches operator', () => {
    it('matches regex patterns', () => {
      expect(compareValues('BA-1234', 'matches', '^BA-\\d+')).toBe(true);
      expect(compareValues('LH-5678', 'matches', '^BA-\\d+')).toBe(false);
    });

    it('returns false for invalid regex', () => {
      expect(compareValues('test', 'matches', '[')).toBe(false);
    });

    it('returns false for non-string values', () => {
      expect(compareValues(42, 'matches', '\\d+')).toBe(false);
    });
  });

  describe('between operator', () => {
    it('checks value is between bounds (inclusive)', () => {
      expect(compareValues(5, 'between', [1, 10])).toBe(true);
      expect(compareValues(1, 'between', [1, 10])).toBe(true);
      expect(compareValues(10, 'between', [1, 10])).toBe(true);
      expect(compareValues(0, 'between', [1, 10])).toBe(false);
      expect(compareValues(11, 'between', [1, 10])).toBe(false);
    });

    it('returns false for invalid target', () => {
      expect(compareValues(5, 'between', [1])).toBe(false);
      expect(compareValues(5, 'between', 'invalid')).toBe(false);
    });
  });
});

describe('evaluateCondition', () => {
  it('evaluates a simple equality condition', () => {
    const condition: PolicyCondition = {
      field: 'traveller.department',
      operator: 'eq',
      value: 'Engineering',
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(true);
  });

  it('evaluates a numeric comparison condition', () => {
    const condition: PolicyCondition = {
      field: 'offer.totalPrice.amount',
      operator: 'gt',
      value: 2000,
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(true);
  });

  it('evaluates an "in" condition', () => {
    const condition: PolicyCondition = {
      field: 'offer.cabinClass',
      operator: 'in',
      value: ['economy', 'premium_economy'],
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(false);
  });

  it('evaluates a between condition on lead time', () => {
    const condition: PolicyCondition = {
      field: 'trip.leadTimeDays',
      operator: 'between',
      value: [7, 30],
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(true);
  });

  it('evaluates a regex match condition', () => {
    const condition: PolicyCondition = {
      field: 'offer.supplier',
      operator: 'matches',
      value: '^British',
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(true);
  });

  it('evaluates nested field conditions', () => {
    const condition: PolicyCondition = {
      field: 'trip.destination.country',
      operator: 'eq',
      value: 'US',
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(true);
  });

  it('returns false when field does not exist', () => {
    const condition: PolicyCondition = {
      field: 'traveller.nonExistent',
      operator: 'eq',
      value: 'something',
      valueType: 'literal',
    };
    expect(evaluateCondition(condition, sampleInput)).toBe(false);
  });
});
