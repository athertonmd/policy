'use client';

import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
      <div className="text-gray-400" aria-hidden="true">
        {icon || <FileText className="mx-auto h-12 w-12" />}
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">{title}</h3>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="btn-primary mt-6"
          type="button"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
