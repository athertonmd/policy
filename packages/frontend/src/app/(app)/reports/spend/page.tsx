'use client';

import { useState } from 'react';
import { Download, Calendar } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SpendChart } from '@/components/reports/SpendChart';
import type { SpendReport } from '@/lib/api-client';

const MOCK_SPEND_REPORT: SpendReport = {
  totalSpend: 1245000,
  currency: 'GBP',
  averageTripCost: 1850,
  complianceRate: 94.2,
  savings: 87000,
  budgetVariance: -3.2,
  byDepartment: [
    { name: 'Engineering', spend: 320000 },
    { name: 'Sales', spend: 410000 },
    { name: 'Marketing', spend: 185000 },
    { name: 'Executive', spend: 210000 },
    { name: 'Finance', spend: 120000 },
  ],
  byMonth: [
    { month: 'Jan', spend: 95000 },
    { month: 'Feb', spend: 110000 },
    { month: 'Mar', spend: 125000 },
    { month: 'Apr', spend: 98000 },
    { month: 'May', spend: 115000 },
    { month: 'Jun', spend: 130000 },
    { month: 'Jul', spend: 88000 },
    { month: 'Aug', spend: 72000 },
    { month: 'Sep', spend: 105000 },
    { month: 'Oct', spend: 118000 },
    { month: 'Nov', spend: 102000 },
    { month: 'Dec', spend: 87000 },
  ],
  byCategory: [
    { category: 'Flights', spend: 680000 },
    { category: 'Hotels', spend: 340000 },
    { category: 'Rail', spend: 125000 },
    { category: 'Car Hire', spend: 65000 },
    { category: 'Other', spend: 35000 },
  ],
};

function SpendReportContent() {
  const [dateRange, setDateRange] = useState({ start: '2024-01-01', end: '2024-12-31' });
  const [departmentFilter, setDepartmentFilter] = useState('all');

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Spend Reporting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Analyse travel spend across departments, categories, and time periods
          </p>
        </div>
        <button className="btn-secondary" type="button">
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
            className="input-field"
            aria-label="Start date"
          />
          <span className="text-gray-400">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
            className="input-field"
            aria-label="End date"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="input-field w-full sm:w-48"
          aria-label="Filter by department"
        >
          <option value="all">All Departments</option>
          <option value="engineering">Engineering</option>
          <option value="sales">Sales</option>
          <option value="marketing">Marketing</option>
          <option value="executive">Executive</option>
          <option value="finance">Finance</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Total Spend</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            £{(MOCK_SPEND_REPORT.totalSpend / 1000).toFixed(0)}k
          </p>
          <p className="mt-0.5 text-xs text-gray-500">This period</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Average Trip Cost</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            £{MOCK_SPEND_REPORT.averageTripCost.toLocaleString()}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">Per trip</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Policy Savings</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            £{(MOCK_SPEND_REPORT.savings / 1000).toFixed(0)}k
          </p>
          <p className="mt-0.5 text-xs text-gray-500">Estimated savings</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Budget Variance</p>
          <p className={`mt-1 text-2xl font-semibold ${MOCK_SPEND_REPORT.budgetVariance < 0 ? 'text-green-600' : 'text-red-600'}`}>
            {MOCK_SPEND_REPORT.budgetVariance > 0 ? '+' : ''}{MOCK_SPEND_REPORT.budgetVariance}%
          </p>
          <p className="mt-0.5 text-xs text-gray-500">vs. budget</p>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6">
        <SpendChart report={MOCK_SPEND_REPORT} />
      </div>
    </div>
  );
}

export default function SpendReportPage() {
  return (
    <ProtectedRoute requiredCapability="view_reports">
      <SpendReportContent />
    </ProtectedRoute>
  );
}
