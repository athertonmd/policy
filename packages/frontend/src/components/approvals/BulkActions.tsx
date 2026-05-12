'use client';

import { CheckCircle, XCircle, X } from 'lucide-react';

interface BulkActionsProps {
  selectedCount: number;
  onApprove: () => void;
  onReject: () => void;
  onClear: () => void;
}

export function BulkActions({ selectedCount, onApprove, onReject, onClear }: BulkActionsProps) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg bg-brand-50 border border-brand-200 px-4 py-2"
      role="toolbar"
      aria-label="Bulk actions"
    >
      <span className="text-sm font-medium text-brand-700">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onApprove}
          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
          type="button"
          aria-label={`Approve ${selectedCount} selected items`}
        >
          <CheckCircle className="h-3 w-3" aria-hidden="true" />
          Approve All
        </button>
        <button
          onClick={onReject}
          className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
          type="button"
          aria-label={`Reject ${selectedCount} selected items`}
        >
          <XCircle className="h-3 w-3" aria-hidden="true" />
          Reject All
        </button>
        <button
          onClick={onClear}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-200 transition-colors"
          type="button"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
