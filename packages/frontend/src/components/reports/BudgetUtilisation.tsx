'use client';

import { AlertTriangle } from 'lucide-react';
import type { BudgetItem } from '@/lib/api-client';

interface BudgetUtilisationProps {
  budget: BudgetItem;
  currency: string;
}

export function BudgetUtilisation({ budget, currency }: BudgetUtilisationProps) {
  const utilisationPercentage = (budget.utilised / budget.allocated) * 100;
  const isAtWarning = utilisationPercentage >= budget.warningThreshold;
  const isOverBudget = utilisationPercentage >= 100;

  const getBarColor = () => {
    if (isOverBudget) return 'bg-red-500';
    if (isAtWarning) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getTextColor = () => {
    if (isOverBudget) return 'text-red-600';
    if (isAtWarning) return 'text-amber-600';
    return 'text-green-600';
  };

  const levelLabels: Record<string, string> = {
    tenant: 'Tenant',
    department: 'Department',
    cost_centre: 'Cost Centre',
    project: 'Project',
  };

  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">{budget.name}</h4>
          <p className="text-xs text-gray-500">{levelLabels[budget.level]} · {budget.period}</p>
        </div>
        {isAtWarning && (
          <AlertTriangle className={`h-4 w-4 ${isOverBudget ? 'text-red-500' : 'text-amber-500'}`} aria-label={isOverBudget ? 'Over budget' : 'Near budget limit'} />
        )}
      </div>

      {/* Gauge */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-1">
          <span className={`text-lg font-semibold ${getTextColor()}`}>
            {utilisationPercentage.toFixed(0)}%
          </span>
          <span className="text-xs text-gray-500">
            {currency} {(budget.utilised / 1000).toFixed(0)}k / {(budget.allocated / 1000).toFixed(0)}k
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3" role="progressbar" aria-valuenow={utilisationPercentage} aria-valuemin={0} aria-valuemax={100} aria-label={`${budget.name} budget utilisation`}>
          <div
            className={`h-3 rounded-full transition-all ${getBarColor()}`}
            style={{ width: `${Math.min(utilisationPercentage, 100)}%` }}
          />
        </div>
        {/* Warning threshold marker */}
        <div className="relative mt-1">
          <div
            className="absolute top-0 h-2 border-l border-dashed border-gray-400"
            style={{ left: `${budget.warningThreshold}%` }}
          />
          <span
            className="absolute -top-0.5 text-xs text-gray-400 transform -translate-x-1/2"
            style={{ left: `${budget.warningThreshold}%` }}
          >
            {budget.warningThreshold}%
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
        <span>Remaining: {currency} {((budget.allocated - budget.utilised) / 1000).toFixed(0)}k</span>
        {isOverBudget && <span className="text-red-600 font-medium">Over budget</span>}
      </div>
    </div>
  );
}
