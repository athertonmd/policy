'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import type { PolicyRule } from '@/lib/api-client';

// Mock data for development
const MOCK_POLICIES: PolicyRule[] = [
  {
    id: 'rule-001',
    name: 'International Flight Cap',
    description: 'Cap international economy flights at £2,000',
    dsl: 'when trip.type == "international" and trip.amount > 2000 then reject',
    version: 3,
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-03-01T14:30:00Z',
    createdBy: 'admin@company.com',
  },
  {
    id: 'rule-002',
    name: 'Advance Booking Requirement',
    description: 'Require 14-day advance booking for domestic flights',
    dsl: 'when trip.type == "domestic" and trip.advance_days < 14 then flag',
    version: 1,
    status: 'active',
    createdAt: '2024-02-01T09:00:00Z',
    updatedAt: '2024-02-01T09:00:00Z',
    createdBy: 'admin@company.com',
  },
  {
    id: 'rule-003',
    name: 'Business Class Restriction',
    description: 'Restrict business class to flights over 6 hours',
    dsl: 'when trip.cabin_class == "business" and trip.duration < 6 then reject',
    version: 2,
    status: 'draft',
    createdAt: '2024-02-20T11:00:00Z',
    updatedAt: '2024-03-05T16:00:00Z',
    createdBy: 'policy.admin@company.com',
  },
];

function PoliciesContent() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredPolicies = MOCK_POLICIES.filter((policy) => {
    const matchesSearch =
      policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      policy.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || policy.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<PolicyRule>[] = [
    {
      key: 'name',
      header: 'Policy Name',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500">{item.description}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'version',
      header: 'Version',
      render: (item) => <span className="text-gray-600">v{item.version}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Last Updated',
      render: (item) => (
        <span className="text-gray-500">
          {new Date(item.updatedAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policies</h1>
          <p className="mt-1 text-sm text-gray-500">Manage travel policy rules</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => router.push('/policies/simulate')}
            className="btn-secondary"
            type="button"
          >
            Simulate
          </button>
          <button
            onClick={() => router.push('/policies/builder')}
            className="btn-primary"
            type="button"
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            New Policy
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search policies..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9"
            aria-label="Search policies"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-full sm:w-40"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      <div className="mt-6">
        {filteredPolicies.length === 0 && searchQuery === '' ? (
          <EmptyState
            title="No policies yet"
            description="Create your first policy rule to get started."
            action={{ label: 'Create Policy', onClick: () => router.push('/policies/builder') }}
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredPolicies}
            keyExtractor={(item) => item.id}
            onRowClick={(item) => router.push(`/policies/${item.id}/versions`)}
          />
        )}
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <ProtectedRoute requiredCapability="view_policies">
      <PoliciesContent />
    </ProtectedRoute>
  );
}
