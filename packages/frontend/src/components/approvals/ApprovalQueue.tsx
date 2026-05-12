'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import { ApprovalCard } from './ApprovalCard';
import { BulkActions } from './BulkActions';
import { EmptyState } from '@/components/shared/EmptyState';
import type { ApprovalItem } from '@/lib/api-client';

interface ApprovalQueueProps {
  items: ApprovalItem[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onBulkApprove: (ids: string[]) => void;
  onBulkReject: (ids: string[]) => void;
}

export function ApprovalQueue({
  items,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
}: ApprovalQueueProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('pending');

  const filteredItems = items.filter(
    (item) => statusFilter === 'all' || item.status === statusFilter
  );

  const handleSelect = (id: string, selected: boolean) => {
    const newSelected = new Set(selectedIds);
    if (selected) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedIds(new Set(filteredItems.map((item) => item.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  return (
    <div>
      {/* Filters and bulk actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input-field w-40"
            aria-label="Filter by status"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="escalated">Escalated</option>
          </select>
          <span className="text-sm text-gray-500">
            {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
          </span>
        </div>

        {selectedIds.size > 0 && (
          <BulkActions
            selectedCount={selectedIds.size}
            onApprove={() => {
              onBulkApprove(Array.from(selectedIds));
              setSelectedIds(new Set());
            }}
            onReject={() => {
              onBulkReject(Array.from(selectedIds));
              setSelectedIds(new Set());
            }}
            onClear={() => setSelectedIds(new Set())}
          />
        )}
      </div>

      {/* Select all */}
      {filteredItems.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={selectedIds.size === filteredItems.length && filteredItems.length > 0}
            onChange={(e) => handleSelectAll(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            aria-label="Select all items"
          />
          <span className="text-xs text-gray-500">Select all</span>
        </div>
      )}

      {/* Queue items */}
      <div className="mt-4 space-y-3">
        {filteredItems.length === 0 ? (
          <EmptyState
            title="No approvals"
            description="There are no items matching your filter."
          />
        ) : (
          filteredItems.map((item) => (
            <ApprovalCard
              key={item.id}
              item={item}
              onApprove={onApprove}
              onReject={onReject}
              selected={selectedIds.has(item.id)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
