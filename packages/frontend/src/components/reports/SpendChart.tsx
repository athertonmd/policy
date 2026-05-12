'use client';

import type { SpendReport } from '@/lib/api-client';

interface SpendChartProps {
  report: SpendReport;
}

export function SpendChart({ report }: SpendChartProps) {
  const maxMonthlySpend = Math.max(...report.byMonth.map((m) => m.spend));
  const maxDeptSpend = Math.max(...report.byDepartment.map((d) => d.spend));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Monthly spend bar chart */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Spend</h3>
        <div className="h-48 flex items-end gap-1.5">
          {report.byMonth.map((month) => {
            const height = (month.spend / maxMonthlySpend) * 100;
            return (
              <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500 hidden sm:block">
                  £{(month.spend / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full rounded-t bg-brand-400 hover:bg-brand-500 transition-colors"
                  style={{ height: `${height}%` }}
                  role="img"
                  aria-label={`${month.month}: £${month.spend.toLocaleString()}`}
                />
                <span className="text-xs text-gray-500">{month.month}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Department spend */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Spend by Department</h3>
        <div className="space-y-4">
          {report.byDepartment.map((dept) => {
            const percentage = (dept.spend / maxDeptSpend) * 100;
            return (
              <div key={dept.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{dept.name}</span>
                  <span className="text-sm font-medium text-gray-900">
                    £{(dept.spend / 1000).toFixed(0)}k
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-brand-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Category breakdown */}
      <div className="card lg:col-span-2">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Spend by Category</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {report.byCategory.map((cat) => {
            const percentage = (cat.spend / report.totalSpend) * 100;
            return (
              <div key={cat.category} className="text-center">
                <div className="relative mx-auto h-20 w-20">
                  <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="3"
                    />
                    <path
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeDasharray={`${percentage}, 100`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                    {percentage.toFixed(0)}%
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-700">{cat.category}</p>
                <p className="text-xs text-gray-500">£{(cat.spend / 1000).toFixed(0)}k</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
