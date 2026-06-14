'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Filter, RefreshCw, Edit2, Trash2, Archive } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import type { PolicyRule } from '@/lib/api-client';
import { getAccessToken } from '@/lib/auth';

const POLICY_API_URL = process.env.NEXT_PUBLIC_POLICY_API_URL || '';

interface ApiPolicyRule {
  ruleId: string;
  name: string;
  description?: string;
  dslSource: string;
  status: string;
  version: number;
  priority: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

function PoliciesContent() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPolicies = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const response = await fetch(`${POLICY_API_URL}/v1/policies/rules`, {
        headers: {
          'Authorization': token || '',
          'x-tenant-id': 'tenant-001',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to load policies (${response.status})`);
      }

      const data = await response.json();
      // API returns { data: { items: [...] }, metadata: {...} }
      const responseData = data.data || data;
      const rules: ApiPolicyRule[] = responseData.items || (Array.isArray(responseData) ? responseData : []);

      setPolicies(rules.map((r) => ({
        id: r.ruleId,
        name: r.name,
        description: r.description || '',
        dsl: r.dslSource,
        version: r.version,
        status: r.status as PolicyRule['status'],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        createdBy: r.createdBy,
      })));
    } catch (err: any) {
      console.error('Failed to fetch policies:', err);
      setError(err.message || 'Failed to load policies');
      // Fall back to empty list
      setPolicies([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchive = async (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Archive this policy? It will no longer be evaluated.')) return;
    try {
      const token = getAccessToken();
      const response = await fetch(`${POLICY_API_URL}/v1/policies/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Authorization': token || '', 'x-tenant-id': 'tenant-001', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived' }),
      });
      if (!response.ok) throw new Error('Failed to archive');
      fetchPolicies();
    } catch (err: any) {
      alert(err.message || 'Failed to archive policy');
    }
  };

  const handleDelete = async (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Permanently delete this policy? This cannot be undone.')) return;
    try {
      const token = getAccessToken();
      const response = await fetch(`${POLICY_API_URL}/v1/policies/rules/${ruleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': token || '', 'x-tenant-id': 'tenant-001' },
      });
      if (!response.ok) throw new Error('Failed to delete');
      fetchPolicies();
    } catch (err: any) {
      alert(err.message || 'Failed to delete policy');
    }
  };

  const handleActivate = async (ruleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const token = getAccessToken();
      const response = await fetch(`${POLICY_API_URL}/v1/policies/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Authorization': token || '', 'x-tenant-id': 'tenant-001', 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active' }),
      });
      if (!response.ok) throw new Error('Failed to activate');
      fetchPolicies();
    } catch (err: any) {
      alert(err.message || 'Failed to activate policy');
    }
  };

  useEffect(() => {
    fetchPolicies();
  }, []);

  const filteredPolicies = policies.filter((policy) => {
    const matchesSearch =
      policy.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (policy.description || '').toLowerCase().includes(searchQuery.toLowerCase());
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
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/policies/builder?edit=${item.id}`); }}
            className="rounded p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
            title="Edit"
            type="button"
          >
            <Edit2 className="h-4 w-4" aria-hidden="true" />
          </button>
          {item.status === 'draft' && (
            <button
              onClick={(e) => handleActivate(item.id, e)}
              className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50"
              title="Activate"
              type="button"
            >
              Activate
            </button>
          )}
          {item.status !== 'archived' && (
            <button
              onClick={(e) => handleArchive(item.id, e)}
              className="rounded p-1.5 text-gray-400 hover:bg-amber-50 hover:text-amber-600"
              title="Archive"
              type="button"
            >
              <Archive className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={(e) => handleDelete(item.id, e)}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            type="button"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
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
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <div className="card text-center py-8">
            <p className="text-red-600 text-sm">{error}</p>
            <button onClick={fetchPolicies} className="btn-secondary mt-3" type="button">
              <RefreshCw className="mr-1 h-4 w-4" aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : filteredPolicies.length === 0 && searchQuery === '' ? (
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
