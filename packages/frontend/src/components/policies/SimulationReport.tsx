'use client';

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { SimulationResult, SimulationComparison } from '@/lib/api-client';
import { StatusBadge } from '@/components/shared/StatusBadge';

interface SimulationReportProps {
  result: SimulationResult;
}

export function SimulationReport({ result }: SimulationReportProps) {
  const impactPercentage = result.tripsEvaluated > 0
    ? ((result.tripsAffected / result.tripsEvaluated) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Trips Evaluated"
          value={result.tripsEvaluated.toLocaleString()}
        />
        <MetricCard
          label="Trips Affected"
          value={result.tripsAffected.toLocaleString()}
          subtitle={`${impactPercentage}% of total`}
        />
        <MetricCard
          label="Approval Rate Change"
          value={`${result.approvalRateChange > 0 ? '+' : ''}${result.approvalRateChange.toFixed(1)}%`}
          trend={result.approvalRateChange}
        />
        <MetricCard
          label="Cost Impact"
          value={`£${Math.abs(result.costImpact).toLocaleString()}`}
          subtitle={result.costImpact >= 0 ? 'Increase' : 'Savings'}
          trend={-result.costImpact}
        />
      </div>

      {/* Comparison details */}
      {result.comparisonDetails.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Affected Trips</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200" role="table">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Trip</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Current</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Proposed</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {result.comparisonDetails.map((item) => (
                  <ComparisonRow key={item.tripId} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  trend,
}: {
  label: string;
  value: string;
  subtitle?: string;
  trend?: number;
}) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="text-xl font-semibold text-gray-900">{value}</p>
        {trend !== undefined && trend !== 0 && (
          <span className={trend > 0 ? 'text-green-600' : 'text-red-600'}>
            {trend > 0 ? (
              <ArrowUp className="h-4 w-4" aria-label="Increase" />
            ) : (
              <ArrowDown className="h-4 w-4" aria-label="Decrease" />
            )}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
    </div>
  );
}

function ComparisonRow({ item }: { item: SimulationComparison }) {
  const decisionToStatus = (decision: string) => {
    switch (decision.toLowerCase()) {
      case 'approve': return 'approved' as const;
      case 'reject': return 'rejected' as const;
      default: return 'pending' as const;
    }
  };

  return (
    <tr>
      <td className="px-4 py-3 text-sm text-gray-900 font-mono">{item.tripId}</td>
      <td className="px-4 py-3">
        <StatusBadge status={decisionToStatus(item.currentDecision)} label={item.currentDecision} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={decisionToStatus(item.proposedDecision)} label={item.proposedDecision} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{item.reason}</td>
    </tr>
  );
}
