'use client';

import { useState } from 'react';
import { RefreshCw, Wifi } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ApprovalQueue } from '@/components/approvals/ApprovalQueue';
import type { ApprovalItem } from '@/lib/api-client';

// Mock data
const MOCK_APPROVALS: ApprovalItem[] = [
  {
    id: 'wf-001',
    workflowId: 'wf-001',
    type: 'booking',
    status: 'pending',
    traveller: { id: 'u-001', name: 'James Smith', department: 'Engineering' },
    trip: { destination: 'New York, USA', dates: '15-18 Mar 2024', amount: 2450, currency: 'GBP' },
    policyViolations: ['Exceeds international flight cap of £2,000'],
    submittedAt: '2024-03-10T09:30:00Z',
    dueBy: '2024-03-12T09:30:00Z',
  },
  {
    id: 'wf-002',
    workflowId: 'wf-002',
    type: 'booking',
    status: 'pending',
    traveller: { id: 'u-002', name: 'Sarah Johnson', department: 'Sales' },
    trip: { destination: 'Paris, France', dates: '20-22 Mar 2024', amount: 890, currency: 'GBP' },
    policyViolations: ['Advance booking less than 14 days'],
    submittedAt: '2024-03-10T11:00:00Z',
    dueBy: '2024-03-13T11:00:00Z',
  },
  {
    id: 'wf-003',
    workflowId: 'wf-003',
    type: 'override',
    status: 'pending',
    traveller: { id: 'u-003', name: 'Michael Brown', department: 'Executive' },
    trip: { destination: 'Tokyo, Japan', dates: '1-5 Apr 2024', amount: 5200, currency: 'GBP' },
    policyViolations: ['Business class on route < 6 hours segment'],
    submittedAt: '2024-03-09T14:00:00Z',
    dueBy: '2024-03-11T14:00:00Z',
  },
  {
    id: 'wf-004',
    workflowId: 'wf-004',
    type: 'booking',
    status: 'approved',
    traveller: { id: 'u-004', name: 'Emily Davis', department: 'Marketing' },
    trip: { destination: 'Berlin, Germany', dates: '25-27 Mar 2024', amount: 650, currency: 'GBP' },
    policyViolations: [],
    submittedAt: '2024-03-08T10:00:00Z',
  },
];

function ApprovalsContent() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connected, setConnected] = useState(true);

  const handleApprove = (id: string) => {
    // In production, calls apiClient.submitApprovalAction()
    console.log('Approve:', id);
  };

  const handleReject = (id: string) => {
    console.log('Reject:', id);
  };

  const handleBulkApprove = (ids: string[]) => {
    console.log('Bulk approve:', ids);
  };

  const handleBulkReject = (ids: string[]) => {
    console.log('Bulk reject:', ids);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="mt-1 text-sm text-gray-500">
            Review and action pending travel approval requests
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Real-time indicator */}
          <div className="flex items-center gap-1.5">
            <Wifi className={`h-4 w-4 ${connected ? 'text-green-500' : 'text-gray-400'}`} aria-hidden="true" />
            <span className="text-xs text-gray-500">
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary"
            type="button"
            aria-label="Refresh approvals"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-6">
        <ApprovalQueue
          items={MOCK_APPROVALS}
          onApprove={handleApprove}
          onReject={handleReject}
          onBulkApprove={handleBulkApprove}
          onBulkReject={handleBulkReject}
        />
      </div>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <ProtectedRoute requiredCapability="view_approvals">
      <ApprovalsContent />
    </ProtectedRoute>
  );
}
