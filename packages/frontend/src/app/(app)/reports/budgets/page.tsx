'use client';

import { useState } from 'react';
import { Download, Wallet, AlertTriangle } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { BudgetUtilisation } from '@/components/reports/BudgetUtilisation';
import type { BudgetReport, BudgetItem } from '@/lib/api-client';

const MOCK_BUDGET_REPORT: BudgetReport = {
  budgets: [
    { id: 'b-001', name: 'Engineering', level: 'department', allocated: 500000, utilised: 320000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-002', name: 'Sales', level: 'department', allocated: 600000, utilised: 510000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-003', name: 'Marketing', level: 'department', allocated: 250000, utilised: 185000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-004', name: 'Executive', level: 'department', allocated: 300000, utilised: 280000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-005', name: 'Finance', level: 'department', allocated: 150000, utilised: 120000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-006', name: 'Project Alpha', level: 'project', allocated: 100000, utilised: 95000, period: 'Q1 2024', warningThreshold: 80 },
    { id: 'b-007', name: 'EMEA Region', level: 'cost_centre', allocated: 800000, utilised: 620000, period: 'Q1 2024', warningThreshold: 80 },
  ],
  totalAllocated: 2700000,
  totalUtilised: 2130000,
  currency: 'GBP',
};

function BudgetReportContent() {
  const [levelFilter, setLevelFilter] = useState<string>('all');

  const filteredBudgets = MOCK_BUDGET_REPORT.budgets.filter(
    (b) => levelFilter === 'all' || b.level === levelFilter
  );

  const overallUtilisation = (MOCK_BUDGET_REPORT.totalUtilised / MOCK_BUDGET_REPORT.totalAllocated) * 100;
  const budgetsAtRisk = MOCK_BUDGET_REPORT.budgets.filter(
    (b) => (b.utilised / b.allocated) * 100 >= b.warningThreshold
  );

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track budget utilisation across departments, cost centres, and projects
          </p>
        </div>
        <button className="btn-secondary" type="button">
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
          Export
        </button>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Total Allocated</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            £{(MOCK_BUDGET_REPORT.totalAllocated / 1000000).toFixed(1)}M
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Total Utilised</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            £{(MOCK_BUDGET_REPORT.totalUtilised / 1000000).toFixed(1)}M
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{overallUtilisation.toFixed(1)}% of total</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Budgets at Risk</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {budgetsAtRisk.length}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">above warning threshold</p>
        </div>
      </div>

      {/* Filter */}
      <div className="mt-6 flex items-center gap-3">
        <select
          value={levelFilter}
          onChange={(e) => setLevelFilter(e.target.value)}
          className="input-field w-48"
          aria-label="Filter by budget level"
        >
          <option value="all">All Levels</option>
          <option value="department">Department</option>
          <option value="cost_centre">Cost Centre</option>
          <option value="project">Project</option>
          <option value="tenant">Tenant</option>
        </select>
      </div>

      {/* Budget utilisation gauges */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBudgets.map((budget) => (
          <BudgetUtilisation key={budget.id} budget={budget} currency={MOCK_BUDGET_REPORT.currency} />
        ))}
      </div>
    </div>
  );
}

export default function BudgetReportPage() {
  return (
    <ProtectedRoute requiredCapability="view_budgets">
      <BudgetReportContent />
    </ProtectedRoute>
  );
}
