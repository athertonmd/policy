'use client';

import type { CarbonReport } from '@/lib/api-client';

interface CarbonChartProps {
  report: CarbonReport;
}

export function CarbonChart({ report }: CarbonChartProps) {
  const maxMonthlyEmissions = Math.max(...report.byMonth.map((m) => m.emissions));
  const maxDeptEmissions = Math.max(...report.byDepartment.map((d) => d.emissions));
  const maxModeEmissions = Math.max(...report.byTransportMode.map((m) => m.emissions));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Monthly emissions */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Emissions</h3>
        <div className="h-48 flex items-end gap-1.5">
          {report.byMonth.map((month) => {
            const height = (month.emissions / maxMonthlyEmissions) * 100;
            const monthlyTarget = report.target / 12;
            const isOverTarget = month.emissions > monthlyTarget;
            return (
              <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500 hidden sm:block">
                  {month.emissions}
                </span>
                <div
                  className={`w-full rounded-t transition-colors ${isOverTarget ? 'bg-red-400 hover:bg-red-500' : 'bg-green-400 hover:bg-green-500'}`}
                  style={{ height: `${height}%` }}
                  role="img"
                  aria-label={`${month.month}: ${month.emissions} tonnes CO₂e`}
                />
                <span className="text-xs text-gray-500">{month.month}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-400" aria-hidden="true" />
            Under monthly target
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-400" aria-hidden="true" />
            Over monthly target
          </span>
        </div>
      </div>

      {/* By transport mode */}
      <div className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emissions by Transport Mode</h3>
        <div className="space-y-4">
          {report.byTransportMode.map((mode) => {
            const percentage = (mode.emissions / maxModeEmissions) * 100;
            const sharePercentage = (mode.emissions / report.totalEmissions) * 100;
            return (
              <div key={mode.mode}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{mode.mode}</span>
                  <span className="text-sm font-medium text-gray-900">
                    {mode.emissions}t ({sharePercentage.toFixed(0)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className="bg-green-500 h-2.5 rounded-full transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* By department */}
      <div className="card lg:col-span-2">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emissions by Department</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {report.byDepartment.map((dept) => {
            const percentage = (dept.emissions / report.totalEmissions) * 100;
            return (
              <div key={dept.name} className="text-center">
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
                      stroke="#22c55e"
                      strokeWidth="3"
                      strokeDasharray={`${percentage}, 100`}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-900">
                    {percentage.toFixed(0)}%
                  </span>
                </div>
                <p className="mt-2 text-xs font-medium text-gray-700">{dept.name}</p>
                <p className="text-xs text-gray-500">{dept.emissions}t CO₂e</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
