'use client';

import { useState } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export interface RuleCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface RuleAction {
  id: string;
  type: 'approve' | 'reject' | 'flag' | 'require_approval' | 'notify';
  params: Record<string, string>;
}

interface RuleBuilderProps {
  conditions: RuleCondition[];
  actions: RuleAction[];
  onConditionsChange: (conditions: RuleCondition[]) => void;
  onActionsChange: (actions: RuleAction[]) => void;
}

const FIELD_OPTIONS = [
  { value: 'trip.destination', label: 'Destination' },
  { value: 'trip.amount', label: 'Amount' },
  { value: 'trip.cabin_class', label: 'Cabin Class' },
  { value: 'trip.advance_days', label: 'Advance Booking Days' },
  { value: 'trip.duration', label: 'Trip Duration' },
  { value: 'traveller.department', label: 'Department' },
  { value: 'traveller.grade', label: 'Grade' },
  { value: 'trip.type', label: 'Trip Type' },
];

const OPERATOR_OPTIONS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'greater_than', label: 'greater than' },
  { value: 'less_than', label: 'less than' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is in' },
];

const ACTION_TYPES = [
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'flag', label: 'Flag for Review' },
  { value: 'require_approval', label: 'Require Approval' },
  { value: 'notify', label: 'Send Notification' },
];

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

export function RuleBuilder({
  conditions,
  actions,
  onConditionsChange,
  onActionsChange,
}: RuleBuilderProps) {
  const addCondition = () => {
    onConditionsChange([
      ...conditions,
      { id: generateId(), field: 'trip.amount', operator: 'greater_than', value: '' },
    ]);
  };

  const removeCondition = (id: string) => {
    onConditionsChange(conditions.filter((c) => c.id !== id));
  };

  const updateCondition = (id: string, updates: Partial<RuleCondition>) => {
    onConditionsChange(
      conditions.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const addAction = () => {
    onActionsChange([
      ...actions,
      { id: generateId(), type: 'flag', params: {} },
    ]);
  };

  const removeAction = (id: string) => {
    onActionsChange(actions.filter((a) => a.id !== id));
  };

  const updateAction = (id: string, updates: Partial<RuleAction>) => {
    onActionsChange(
      actions.map((a) => (a.id === id ? { ...a, ...updates } : a))
    );
  };

  return (
    <div className="space-y-6">
      {/* Conditions */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Conditions</h3>
          <button
            type="button"
            onClick={addCondition}
            className="btn-secondary text-xs"
            aria-label="Add condition"
          >
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Condition
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {conditions.length === 0 && (
            <p className="text-sm text-gray-500 italic">No conditions defined. Add a condition to start building your rule.</p>
          )}
          {conditions.map((condition, index) => (
            <div
              key={condition.id}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
            >
              <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />

              {index > 0 && (
                <span className="text-xs font-medium text-gray-500 flex-shrink-0">AND</span>
              )}

              <select
                value={condition.field}
                onChange={(e) => updateCondition(condition.id, { field: e.target.value })}
                className="input-field text-sm"
                aria-label="Condition field"
              >
                {FIELD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <select
                value={condition.operator}
                onChange={(e) => updateCondition(condition.id, { operator: e.target.value })}
                className="input-field text-sm"
                aria-label="Condition operator"
              >
                {OPERATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              <input
                type="text"
                value={condition.value}
                onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
                className="input-field text-sm"
                placeholder="Value"
                aria-label="Condition value"
              />

              <button
                type="button"
                onClick={() => removeCondition(condition.id)}
                className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove condition"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
          <button
            type="button"
            onClick={addAction}
            className="btn-secondary text-xs"
            aria-label="Add action"
          >
            <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
            Add Action
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {actions.length === 0 && (
            <p className="text-sm text-gray-500 italic">No actions defined. Add an action to specify what happens when conditions are met.</p>
          )}
          {actions.map((action) => (
            <div
              key={action.id}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-3"
            >
              <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden="true" />

              <select
                value={action.type}
                onChange={(e) => updateAction(action.id, { type: e.target.value as RuleAction['type'] })}
                className="input-field text-sm"
                aria-label="Action type"
              >
                {ACTION_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>

              {action.type === 'notify' && (
                <input
                  type="text"
                  value={action.params.recipient || ''}
                  onChange={(e) =>
                    updateAction(action.id, { params: { ...action.params, recipient: e.target.value } })
                  }
                  className="input-field text-sm"
                  placeholder="Recipient email"
                  aria-label="Notification recipient"
                />
              )}

              <button
                type="button"
                onClick={() => removeAction(action.id)}
                className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove action"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
