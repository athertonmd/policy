'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Wifi, AlertTriangle, Clock, Filter } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ApprovalCard } from '@/components/approvals/ApprovalCard';
import { BulkActions } from '@/components/approvals/BulkActions';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { EmptyState } from '@/components/shared/EmptyState';
import type { TmcQueueItem } from '@/lib/api-client';

// Mock TMC queue data
const MOCK_TMC_QUEUE: TmcQueueItem[] = [
  {
    id: 'tmc-001',
    workflowId: 'wf-010',
    type: 'booking',
    status: 'pending',
    traveller: { id: 'u-010', name: 'Alice Walker', department: 'Engineering' },
    trip: { destination: 'San Francisco, USA', dates: '20-24 Mar 2024', amount: 3200, currency: 'GBP' },
    policyViolations: ['Exceeds international flight cap'],
    submittedAt: '2024-03-10T08:00:00Z',
    dueBy: '2024-03-11T08:00:00Z',
    priority: 'high',
    slaBreached: true,
    category: 'sla_breach',
    assignedTo: 'tmc-agent-1',
  },
  {
    id: 'tmc-002',
    workflowId: 'wf-011',
    type: 'override',
    status: 'pending',
    traveller: { id: 'u-011', name: 'Robert Chen', department: 'Sales' },
    trip: { destination: 'Singapore', dates: '1-4 Apr 2024', amount: 4800, currency: 'GBP' },
    policyViolations: ['Business class on economy-only route'],
    submittedAt: '2024-03-10T10:30:00Z',
    dueBy: '2024-03-12T10:30:00Z',
    priority: 'high',
    slaBreached: false,
    category: 'override',
    assignedTo: 'tmc-agent-1',
  },
  {
    id: 'tmc-003',
    workflowId: 'wf-012',
    type: 'budget_exception',
    status: 'pending',
    traveller: { id: 'u-012', name: 'Maria Garcia', department: 'Marketing' },
    trip: { destination: 'Dubai, UAE', dates: '10-14 Apr 2024', amount: 6100, currency: 'GBP' },
    policyViolations: ['Department budget exceeded'],
    submittedAt: '2024-03-09T15:00:00Z',
    dueBy: '2024-03-11T15:00:00Z',
    priority: 'medium',
    slaBreached: false,
    category: 'exception',
  },
  {
    id: 'tmc-004',
    workflowId: 'wf-013',
    type: 'booking',
    status: 'pending',
    traveller: { id: 'u-013', name: 'David Kim', department: 'Finance' },
    trip: { destination: 'Frankfurt, Germany', dates: '5-7 Apr 2024', amount: 780, currency: 'GBP' },
    policyViolations: ['Advance booking less than 7 days'],
    submittedAt: '2024-03-10T12:00:00Z',
    dueBy: '2024-03-13T12:00:00Z',
    priority: 'low',
    slaBreached: false,
    category: 'approval',
  },
];

type CategoryFilter = 'all' | 'approval' | 'exception' | 'override' | 'sla_breach';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

function TmcDashboardContent() {
  const [queue, setQueue] = useState<TmcQueueItem[]>(MOCK_TMC_QUEUE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connected, setConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Polling for real-time updates (WebSocket placeholder)
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredQueue = queue.filter((item) => {
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesPriority = priorityFilter === 'all' || item.priority === priorityFilter;
    return matchesCategory && matchesPriority;
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setLastUpdated(new Date());
    setIsRefreshing(false);
  };

  const handleApprove = (id: string) => {
    setQueue((prev) => prev.map((item) =>
      item.id === id ? { ...item, status: 'approved' as const } : item
    ));
  };

  const handleReject = (id: string) => {
    setQueue((prev) => prev.map((item) =>
      item.id === id ? { ...item, status: 'rejected' as const } : item
    ));
  };

  const handleBulkApprove = (ids: string[]) => {
    setQueue((prev) => prev.map((item) =>
      ids.includes(item.id) ? { ...item, status: 'approved' as const } : item
    ));
    setSelectedIds(new Set());
  };

  const handleBulkReject = (ids: string[]) => {
    setQueue((prev) => prev.map((item) =>
      ids.includes(item.id) ? { ...item, status: 'rejected' as const } : item
    ));
    setSelectedIds(new Set());
  };

  const handleSelect = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) newSelected.add(id);
    else newSelected.delete(id);
    setSelectedIds(newSelected);
  };

  const slaBreachedCount = queue.filter((item) => item.slaBreached).length;
  const pendingCount = queue.filter((item) => item.status === 'pending').length;
  const highPriorityCount = queue.filter((item) => item.priority === 'high' && item.status === 'pending').length;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TMC Operations Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Unified queue for approvals, exceptions, overrides, and SLA breaches
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Wifi className={`h-4 w-4 ${connected ? 'text-green-500' : 'text-gray-400'}`} aria-hidden="true" />
            <span className="text-xs text-gray-500">
              {connected ? 'Live' : 'Disconnected'}
            </span>
          </div>
          <span className="text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="btn-secondary"
            type="button"
            aria-label="Refresh queue"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card flex items-center gap-3">
          <div className="rounded-full bg-amber-50 p-2">
            <Clock className="h-5 w-5 text-amber-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending Items</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-full bg-red-50 p-2">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{slaBreachedCount}</p>
            <p className="text-xs text-gray-500">SLA Breaches</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <div className="rounded-full bg-orange-50 p-2">
            <Filter className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div>
            <p className="text-2xl font-semibold text-gray-900">{highPriorityCount}</p>
            <p className="text-xs text-gray-500">High Priority</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            className="input-field w-40"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            <option value="approval">Approvals</option>
            <option value="exception">Exceptions</option>
            <option value="override">Overrides</option>
            <option value="sla_breach">SLA Breaches</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            className="input-field w-36"
            aria-label="Filter by priority"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <span className="text-sm text-gray-500">
            {filteredQueue.length} item{filteredQueue.length !== 1 ? 's' : ''}
          </span>
        </div>

        {selectedIds.size > 0 && (
          <BulkActions
            selectedCount={selectedIds.size}
            onApprove={() => handleBulkApprove(Array.from(selectedIds))}
            onReject={() => handleBulkReject(Array.from(selectedIds))}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
      </div>

      {/* Queue items */}
      <div className="mt-4 space-y-3">
        {filteredQueue.length === 0 ? (
          <EmptyState
            title="Queue is empty"
            description="No items match your current filters."
          />
        ) : (
          filteredQueue.map((item) => (
            <div key={item.id} className="relative">
              {/* Priority indicator */}
              <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${
                item.priority === 'high' ? 'bg-red-500' :
                item.priority === 'medium' ? 'bg-amber-500' : 'bg-gray-300'
              }`} />
              <div className="ml-2">
                <div className="flex items-center gap-2 mb-1">
                  {item.slaBreached && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                      SLA Breached
                    </span>
                  )}
                  <StatusBadge status="info" label={item.category.replace('_', ' ')} />
                </div>
                <ApprovalCard
                  item={item}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  selected={selectedIds.has(item.id)}
                  onSelect={handleSelect}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TmcDashboardPage() {
  return (
    <ProtectedRoute requiredCapability="view_tmc_dashboard">
      <TmcDashboardContent />
    </ProtectedRoute>
  );
}
