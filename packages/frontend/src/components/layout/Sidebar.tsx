'use client';

import { Shield } from 'lucide-react';
import { Navigation } from './Navigation';
import { useAuth } from '@/components/auth/AuthProvider';

export function Sidebar() {
  const { user } = useAuth();

  return (
    <aside
      className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col"
      aria-label="Sidebar"
    >
      <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
        {/* Logo / Brand */}
        <div className="flex h-16 items-center gap-2 border-b border-gray-200 px-4">
          <Shield className="h-8 w-8 text-brand-600" aria-hidden="true" />
          <span className="text-lg font-semibold text-gray-900">TravelPolicy</span>
        </div>

        {/* Tenant context */}
        {user && (
          <div className="border-b border-gray-200 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Tenant
            </p>
            <p className="mt-0.5 text-sm font-medium text-gray-900 truncate">
              {user.tenantId}
            </p>
          </div>
        )}

        {/* Navigation */}
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-4">
          <Navigation />
        </div>

        {/* User profile */}
        {user && (
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-sm font-medium"
                aria-hidden="true"
              >
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
                <p className="truncate text-xs text-gray-500">{user.roles.join(', ')}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
