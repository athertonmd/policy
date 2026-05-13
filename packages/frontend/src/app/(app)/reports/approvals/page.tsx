'use client';

import { useState } from 'react';
import { Download, Clock, TrendingUp, AlertTriangle, Users } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { ApprovalAnalytics } from '@/lib/api-client';

const MOCK_APPROVAL_ANALYTICS: ApprovalAnalytics = {
  averageApprovalTime: 4.2,
  slaCompliance: 91.5,
  escalationRate: 8.3,
  rejectionRate: 12.1,
  autoApprovalRate: 34.5,
  bottlenecks: [
    { approver: 'John Director', avgTime: 18.5, queueDepth: 8 },
    { approver: 'Sarah VP', avgTime: 12.3, queueDepth: 5 },
    { approver: 'Mike Manager', avgTime: 8.7, queueDepth: 4 },
    { approver: 'Lisa Head', avgTime: 6.2, queueDepth: 3 },
  ],
  byMonth: [
    { month: 'Jan', avgTime: 5.1, volume: 120 },
    { month: 'Feb', avgTime: 4.8, volume: 135 },
    { month: 'Mar', avgTime: 4.5, volume: 142 },
    { month: 'Apr', avgTime: 4.3, volume: 128 },
    { month: 'May', avgTime: 4.6, volume: 138 },
    { month: 'Jun', avgTime: 4.9, volume: 155 },
    { month: 'Jul', avgTime: 4.0, volume: 110 },
    { month: 'Aug', avgTime: 3.8, volume: 95 },
    { month: 'Sep', avgTime: 4.2, volume: 130 },
    { month: 'Oct', avgTime: 4.4, volume: 145 },
    { month: 'Nov', avgTime: 4.1, volume: 132 },
    { month: 'Dec', avgTime: 3.9, volume: 105 },
  ],
};

function ApprovalAnalyticsContent() {
  const [period, setPeriod] = useState('12m');

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Monitor approval times, SLA compliance, and identify bottlenecks
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

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="card">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Avg. Approval Time</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {MOCK_APPROVAL_ANALYTICS.averageApprovalTime}h
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">SLA Compliance</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-green-600">
            {MOCK_APPROVAL_ANALYTICS.slaCompliance}%
          </p>
        </div>
        <div className="card">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            <p className="text-xs font-medium text-gray-500">Escalation Rate</p>
          </div>
          <p className="mt-1 text-2xl font-semibold text-amber-600">
            {MOCK_APPROVAL_ANALYTICS.escalationRate}%
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Rejection Rate</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {MOCK_APPROVAL_ANALYTICS.rejectionRate}%
          </p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-gray-500">Auto-Approval Rate</p>
          <p className="mt-1 text-2xl font-semibold text-brand-600">
            {MOCK_APPROVAL_ANALYTICS.autoApprovalRate}%
          </p>
        </div>
      </div>

      {/* Bottlenecks */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-red-600" aria-hidden="true" />
            <h3 className="text-lg font-semibold text-gray-900">Bottleneck Identification</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">Approvers with highest queue depth and longest response times</p>
          <div className="space-y-3">
            {MOCK_APPROVAL_ANALYTICS.bottlenecks.map((bottleneck, idx) => (
              <div key={idx} className="flex items-center justify-between rounded-md border border-gray-200 p-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white ${
                    idx === 0 ? 'bg-red-500' : idx === 1 ? 'bg-amber-500' : 'bg-gray-400'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{bottleneck.approver}</p>
                    <p className="text-xs text-gray-500">Queue depth: {bottleneck.queueDepth}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">{bottleneck.avgTime}h</p>
                  <p className="text-xs text-gray-500">avg. response</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly trend */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Approval Volume & Time</h3>
          <div className="space-y-3">
            {MOCK_APPROVAL_ANALYTICS.byMonth.map((month) => (
              <div key={month.month} className="flex items-center gap-3">
                <span className="w-8 text-xs text-gray-500">{month.month}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-brand-500 h-2 rounded-full"
                        style={{ width: `${(month.volume / 160) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12">{month.volume}</span>
                  </div>
                </div>
                <span className={`text-xs font-medium w-10 text-right ${month.avgTime > 4.5 ? 'text-red-600' : 'text-green-600'}`}>
                  {month.avgTime}h
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApprovalAnalyticsPage() {
  return (
    <ProtectedRoute requiredCapability="view_reports">
      <ApprovalAnalyticsContent />
    </ProtectedRoute>
  );
}
