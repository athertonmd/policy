'use client';

import { useState } from 'react';
import { Download, Leaf, Target, TrendingDown } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CarbonChart } from '@/components/reports/CarbonChart';
import type { CarbonReport } from '@/lib/api-client';

const MOCK_CARBON_REPORT: CarbonReport = {
  totalEmissions: 485,
  unit: 'tonnes CO₂e',
  target: 400,
  offsetPurchased: 120,
  byTransportMode: [
    { mode: 'Air (Long-haul)', emissions: 280 },
    { mode: 'Air (Short-haul)', emissions: 110 },
    { mode: 'Rail', emissions: 25 },
    { mode: 'Road', emissions: 45 },
    { mode: 'Other', emissions: 25 },
  ],
  byMonth: [
    { month: 'Jan', emissions: 38 },
    { month: 'Feb', emissions: 42 },
    { month: 'Mar', emissions: 48 },
    { month: 'Apr', emissions: 40 },
    { month: 'May', emissions: 44 },
    { month: 'Jun', emissions: 50 },
    { month: 'Jul', emissions: 35 },
    { month: 'Aug', emissions: 28 },
    { month: 'Sep', emissions: 42 },
    { month: 'Oct', emissions: 46 },
    { month: 'Nov', emissions: 40 },
    { month: 'Dec', emissions: 32 },
  ],
  byDepartment: [
    { name: 'Sales', emissions: 180 },
    { name: 'Engineering', emissions: 120 },
    { name: 'Executive', emissions: 95 },
    { name: 'Marketing', emissions: 55 },
    { name: 'Finance', emissions: 35 },
  ],
};

function CarbonReportContent() {
  const [year, setYear] = useState('2024');
  const progressPercentage = Math.min((MOCK_CARBON_REPORT.totalEmissions / MOCK_CARBON_REPORT.target) * 100, 100);
  const netEmissions = MOCK_CARBON_REPORT.totalEmissions - MOCK_CARBON_REPORT.offsetPurchased;
  const isOverTarget = MOCK_CARBON_REPORT.totalEmissions > MOCK_CARBON_REPORT.target;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Carbon Reporting</h1>
          <p className="mt-1 text-sm text-gray-500">
            Track carbon emissions against targets with offset tracking
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="input-field w-28"
            aria-label="Select year"
          >
            <option value="2024">2024</option>
            <option value="2023">2023</option>
          </select>
          <button className="btn-secondary" type="button">
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            Export
          </button>
        </div>
      </div>

      {/* Target progress */}
      <div className="mt-6 card">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-green-600" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-gray-900">Annual Carbon Target</h2>
          </div>
          <span className={`text-sm font-medium ${isOverTarget ? 'text-red-600' : 'text-green-600'}`}>
            {MOCK_CARBON_REPORT.totalEmissions} / {MOCK_CARBON_REPORT.target} {MOCK_CARBON_REPORT.unit}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4" role="progressbar" aria-valuenow={progressPercentage} aria-valuemin={0} aria-valuemax={100} aria-label="Carbon target progress">
          <div
            className={`h-4 rounded-full transition-all ${isOverTarget ? 'bg-red-500' : 'bg-green-500'}`}
            style={{ width: `${Math.min(progressPercentage, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {isOverTarget
            ? `${(MOCK_CARBON_REPORT.totalEmissions - MOCK_CARBON_REPORT.target).toFixed(0)} tonnes over target`
            : `${(MOCK_CARBON_REPORT.target - MOCK_CARBON_REPORT.totalEmissions).toFixed(0)} tonnes remaining`
          }
        </p>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="flex items-center gap-2">
            <Leaf className="h-4 w-4 text-green-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Total Emissions</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {MOCK_CARBON_REPORT.totalEmissions}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{MOCK_CARBON_REPORT.unit}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Offsets Purchased</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-blue-600">
            {MOCK_CARBON_REPORT.offsetPurchased}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{MOCK_CARBON_REPORT.unit}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Net Emissions</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {netEmissions}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">{MOCK_CARBON_REPORT.unit}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Target Progress</p>
          <p className={`mt-1 text-2xl font-semibold ${isOverTarget ? 'text-red-600' : 'text-green-600'}`}>
            {progressPercentage.toFixed(0)}%
          </p>
          <p className="mt-0.5 text-xs text-gray-500">of annual target</p>
        </div>
      </div>

      {/* Charts */}
      <div className="mt-6">
        <CarbonChart report={MOCK_CARBON_REPORT} />
      </div>
    </div>
  );
}

export default function CarbonReportPage() {
  return (
    <ProtectedRoute requiredCapability="view_reports">
      <CarbonReportContent />
    </ProtectedRoute>
  );
}
