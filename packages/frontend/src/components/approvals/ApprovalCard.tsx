'use client';

import { Clock, MapPin, DollarSign, AlertTriangle } from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import type { ApprovalItem } from '@/lib/api-client';

interface ApprovalCardProps {
  item: ApprovalItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
}

export function ApprovalCard({ item, onApprove, onReject, selected, onSelect }: ApprovalCardProps) {
  const isOverdue = item.dueBy && new Date(item.dueBy) < new Date();

  return (
    <article
      className={`card transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-brand-500' : ''}`}
      aria-label={`Approval request from ${item.traveller.name}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {onSelect && (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => onSelect(item.id, e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              aria-label={`Select ${item.traveller.name}'s request`}
            />
          )}
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">{item.traveller.name}</h3>
              <StatusBadge status={item.status} />
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-xs text-red-600">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  Overdue
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500">{item.traveller.department}</p>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          {new Date(item.submittedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Trip details */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1">
          <MapPin className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {item.trip.destination}
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {item.trip.dates}
        </span>
        <span className="flex items-center gap-1">
          <DollarSign className="h-4 w-4 text-gray-400" aria-hidden="true" />
          {item.trip.currency} {item.trip.amount.toLocaleString()}
        </span>
      </div>

      {/* Policy violations */}
      {item.policyViolations.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-red-700">Policy violations:</p>
          <ul className="mt-1 space-y-0.5">
            {item.policyViolations.map((violation, idx) => (
              <li key={idx} className="text-xs text-red-600">• {violation}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action buttons */}
      {item.status === 'pending' && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => onApprove(item.id)}
            className="btn-success text-xs"
            type="button"
            aria-label={`Approve ${item.traveller.name}'s request`}
          >
            Approve
          </button>
          <button
            onClick={() => onReject(item.id)}
            className="btn-danger text-xs"
            type="button"
            aria-label={`Reject ${item.traveller.name}'s request`}
          >
            Reject
          </button>
          <button
            className="btn-secondary text-xs"
            type="button"
          >
            Request Info
          </button>
        </div>
      )}
    </article>
  );
}

function Calendar({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
