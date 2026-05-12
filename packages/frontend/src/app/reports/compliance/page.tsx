'use client';

import { useState } from 'react';
import { Download, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ComplianceGauge } from '@/components/reports/ComplianceGauge';
import type { ComplianceReport } from '@/lib/api-client';

const MOCK_COMPLIANCE_REPORT: ComplianceReport = {
  overallRate: 94.2,
  byDepartment: [
    { name: 'Finance', rate: 98.5 },
    { name: 'Engineering', rate: 96.1 },
    { name: 'Marketing', rate: 93.4 },
    { name: 'Sales', rate: 91.8 },
    { name: 'Executive', rate: 88.2 },
  ],
  byTripType: [
    { type: 'Domestic', rate: 97.3 },
    { type: 'International (Short)', rate: 93.8 },
    { type: 'International (Long)', rate: 89.5 },
  ],
  trends: [
    { month: 'Jan', rate: 91.5 },
    { month: 'Feb', rate: 92.1 },
    { month: 'Mar', rate: 92.8 },
    { month: 'Apr', rate: 93.0 },
    { month: 'May', rate: 93.5 },
    { month: 'Jun', rate: 93.2 },
    { month: 'Jul', rate: 93.8 },
    { month: 'Aug', rate: 94.0 },
    { month: 'Sep', rate: 94.1 },
    { month: 'Oct', rate: 94.5 },
    { month: 'Nov', rate: 94.2 },
    { month: 'Dec', rate: 94.2 },
  ],
  leakageRate: 3.8,
  topViolations: [
    { rule: 'Advance booking requirement (14 days)', count: 45 },
    { rule: 'International flight cap (£2,000)', count: 32 },
    { rule: 'Business class restriction (< 6 hours)', count: 18 },
    { rule: 'Hotel rate cap (£200/night)', count: 15 },
    { rule: 'Weekend stay requirement', count: 8 },
  ],
};

function ComplianceContent() {
  const [period, setPeriod] = useState('12m');

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance Monitoring</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor policy compliance rates with trend analysis and leakage detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="input-field w-36"
            aria-label="Select period"
          >
            <option value="3m">Last 3 months</option>
            <option value="6m">Last 6 months</option>
            <option value="12m">Last 12 months</option>
          </select>
          <button className="btn-secondary" type="button">
            <Download className="mr-1 h-4 w-4" aria-hidden="true" />
            Export
          </button>
        </div>
      </div>

      {/* Overall compliance gauge */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card flex flex-col items-center justify-center">
          <ComplianceGauge value={MOCK_COMPLIANCE_REPORT.overallRate} label="Overall Compliance" />
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Metrics</h3>
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-600">Leakage Rate</dt>
              <dd className="flex items-center gap-1 text-sm font-medium text-amber-600">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                {MOCK_COMPLIANCE_REPORT.leakageRate}%
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-600">Trend (3 months)</dt>
              <dd className="flex items-center gap-1 text-sm font-medium text-green-600">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                +0.7%
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-sm text-gray-600">Total Violations</dt>
              <dd className="text-sm font-medium text-gray-900">
                {MOCK_COMPLIANCE_REPORT.topViolations.reduce((sum, v) => sum + v.count, 0)}
              </dd>
            </div>
          </dl>
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">By Trip Type</h3>
          <div className="space-y-3">
            {MOCK_COMPLIANCE_REPORT.byTripType.map((item) => (
              <div key={item.type}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">{item.type}</span>
                  <span className="text-xs font-medium text-gray-900">{item.rate}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${item.rate >= 95 ? 'bg-green-500' : item.rate >= 90 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${item.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Department compliance */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance by Department</h3>
          <div className="space-y-4">
            {MOCK_COMPLIANCE_REPORT.byDepartment.map((dept) => (
              <div key={dept.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{dept.name}</span>
                  <span className={`text-sm font-medium ${dept.rate >= 95 ? 'text-green-600' : dept.rate >= 90 ? 'text-amber-600' : 'text-red-600'}`}>
                    {dept.rate}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full transition-all ${dept.rate >= 95 ? 'bg-green-500' : dept.rate >= 90 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${dept.rate}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Policy Violations</h3>
          <div className="space-y-3">
            {MOCK_COMPLIANCE_REPORT.topViolations.map((violation, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
                <span className="text-sm text-gray-700">{violation.rule}</span>
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                  {violation.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Trend chart */}
      <div className="mt-6 card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Compliance Trend</h3>
        <div className="h-48 flex items-end gap-2">
          {MOCK_COMPLIANCE_REPORT.trends.map((point) => {
            const height = ((point.rate - 88) / 12) * 100;
            return (
              <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{point.rate}%</span>
                <div
                  className={`w-full rounded-t ${point.rate >= 94 ? 'bg-green-400' : point.rate >= 92 ? 'bg-amber-400' : 'bg-red-400'}`}
                  style={{ height: `${height}%` }}
                  role="img"
                  aria-label={`${point.month}: ${point.rate}% compliance`}
                />
                <span className="text-xs text-gray-500">{point.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function CompliancePage() {
  return (
    <ProtectedRoute requiredCapability="view_compliance">
      <ComplianceContent />
    </ProtectedRoute>
  );
}
