'use client';

type Status = 'approved' | 'rejected' | 'pending' | 'escalated' | 'active' | 'draft' | 'archived' | 'info';

interface StatusBadgeProps {
  status: Status;
  label?: string;
}

const statusStyles: Record<Status, string> = {
  approved: 'bg-green-100 text-green-800',
  active: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  escalated: 'bg-orange-100 text-orange-800',
  draft: 'bg-gray-100 text-gray-800',
  archived: 'bg-gray-100 text-gray-600',
  info: 'bg-blue-100 text-blue-800',
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
      aria-label={`Status: ${displayLabel}`}
    >
      {displayLabel}
    </span>
  );
}
