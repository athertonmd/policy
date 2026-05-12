/**
 * Condition Evaluator
 * Evaluates individual PolicyCondition objects against input data.
 */

import type { ComparisonOp, PolicyCondition } from '@travel-policy/shared';

export interface EvaluationInput {
  traveller: Record<string, unknown>;
  trip: Record<string, unknown>;
  offer: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Resolves a dot-notation field path against the evaluation input.
 * Supports paths like "traveller.seniorityLevel", "trip.leadTimeDays", "offer.totalPrice.amount"
 */
export function resolveField(input: EvaluationInput, field: string): unknown {
  const parts = field.split('.');
  const rootKey = parts[0];

  let current: unknown;
  if (rootKey === 'traveller') {
    current = input.traveller;
  } else if (rootKey === 'trip') {
    current = input.trip;
  } else if (rootKey === 'offer') {
    current = input.offer;
  } else if (rootKey === 'metadata') {
    current = input.metadata;
  } else {
    // Try to find the field in any context
    current = input.traveller[rootKey] ?? input.trip[rootKey] ?? input.offer[rootKey] ?? input.metadata?.[rootKey];
    // If we found it at root level, no need to traverse further parts
    if (current !== undefined && parts.length === 1) {
      return current;
    }
    // If not found at root, return undefined
    if (current === undefined) {
      return undefined;
    }
  }

  // Traverse remaining path segments
  for (let i = 1; i < parts.length; i++) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[parts[i]];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluates a single condition against the input data.
 * Returns true if the condition is satisfied, false otherwise.
 */
export function evaluateCondition(
  condition: PolicyCondition,
  input: EvaluationInput
): boolean {
  const fieldValue = resolveField(input, condition.field);
  const targetValue = condition.value;

  return compareValues(fieldValue, condition.operator, targetValue);
}

/**
 * Compares a field value against a target value using the specified operator.
 */
export function compareValues(
  fieldValue: unknown,
  operator: ComparisonOp,
  targetValue: unknown
): boolean {
  switch (operator) {
    case 'eq':
      return isEqual(fieldValue, targetValue);

    case 'neq':
      return !isEqual(fieldValue, targetValue);

    case 'gt':
      return toNumber(fieldValue) > toNumber(targetValue);

    case 'gte':
      return toNumber(fieldValue) >= toNumber(targetValue);

    case 'lt':
      return toNumber(fieldValue) < toNumber(targetValue);

    case 'lte':
      return toNumber(fieldValue) <= toNumber(targetValue);

    case 'in':
      return isIn(fieldValue, targetValue);

    case 'not_in':
      return !isIn(fieldValue, targetValue);

    case 'contains':
      return doesContain(fieldValue, targetValue);

    case 'matches':
      return doesMatch(fieldValue, targetValue);

    case 'between':
      return isBetween(fieldValue, targetValue);

    default:
      return false;
  }
}

function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Handle numeric string comparison
  if (typeof a === 'number' && typeof b === 'string') return a === Number(b);
  if (typeof a === 'string' && typeof b === 'number') return Number(a) === b;
  return String(a) === String(b);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

function isIn(fieldValue: unknown, targetValue: unknown): boolean {
  if (!Array.isArray(targetValue)) return false;
  return targetValue.some((item) => isEqual(fieldValue, item));
}

function doesContain(fieldValue: unknown, targetValue: unknown): boolean {
  if (typeof fieldValue === 'string' && typeof targetValue === 'string') {
    return fieldValue.includes(targetValue);
  }
  if (Array.isArray(fieldValue)) {
    return fieldValue.some((item) => isEqual(item, targetValue));
  }
  return false;
}

function doesMatch(fieldValue: unknown, targetValue: unknown): boolean {
  if (typeof fieldValue !== 'string' || typeof targetValue !== 'string') {
    return false;
  }
  try {
    const regex = new RegExp(targetValue);
    return regex.test(fieldValue);
  } catch {
    return false;
  }
}

function isBetween(fieldValue: unknown, targetValue: unknown): boolean {
  if (!Array.isArray(targetValue) || targetValue.length !== 2) {
    return false;
  }
  const numValue = toNumber(fieldValue);
  const lower = toNumber(targetValue[0]);
  const upper = toNumber(targetValue[1]);
  return numValue >= lower && numValue <= upper;
}
