'use client';

import { useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DataTable, type Column } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import type { OverrideRequest, CreateOverrideRequest } from '@/lib/api-client';

const MOCK_OVERRIDES: OverrideRequest[] = [
  {
    id: 'ovr-001',
    travellerId: 'u-003',
    travellerName: 'Michael Brown',
    ruleId: 'rule-003',
    ruleName: 'Business Class Restriction',
    reasonCategory: 'client_meeting',
    justification: 'Meeting with key client requires business class for overnight flight to Tokyo. Client is covering accommodation.',
    status: 'approved',
    requestedAt: '2024-03-05T10:00:00Z',
    resolvedAt: '2024-03-05T14:30:00Z',
    resolvedBy: 'director@company.com',
  },
  {
    id: 'ovr-002',
    travellerId: 'u-001',
    travellerName: 'James Smith',
    ruleId: 'rule-001',
    ruleName: 'International Flight Cap',
    reasonCategory: 'business_critical',
    justification: 'Critical production incident requires immediate travel to NYC data centre. No cheaper flights available at short notice.',
    status: 'pending',
    requestedAt: '2024-03-10T08:00:00Z',
  },
  {
    id: 'ovr-003',
    travellerId: 'u-002',
    travellerName: 'Sarah Johnson',
    ruleId: 'rule-002',
    ruleName: 'Advance Booking Requirement',
    reasonCategory: 'emergency',
    justification: 'Emergency client escalation requires travel within 48 hours.',
    status: 'pending',
    requestedAt: '2024-03-09T16:00:00Z',
  },
  {
    id: 'ovr-004',
    travellerId: 'u-004',
    travellerName: 'Emily Davis',
    ruleId: 'rule-001',
    ruleName: 'International Flight Cap',
    reasonCategory: 'other',
    justification: 'Conference attendance approved by department head. Only premium economy available.',
    status: 'rejected',
    requestedAt: '2024-03-01T09:00:00Z',
    resolvedAt: '2024-03-02T11:00:00Z',
    resolvedBy: 'finance@company.com',
  },
];

const REASON_LABELS: Record<string, string> = {
  business_critical: 'Business Critical',
  client_meeting: 'Client Meeting',
  emergency: 'Emergency',
  vip: 'VIP Travel',
  other: 'Other',
};

function OverridesContent() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<Partial<CreateOverrideRequest>>({
    reasonCategory: 'business_critical',
    justification: '',
  });

  const filteredOverrides = MOCK_OVERRIDES.filter((override) => {
    const matchesSearch =
      override.travellerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      override.ruleName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || override.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const columns: Column<OverrideRequest>[] = [
    {
      key: 'traveller',
      header: 'Traveller',
      render: (item) => (
        <div>
          <p className="font-medium text-gray-900">{item.travellerName}</p>
          <p className="text-xs text-gray-500">{item.ruleName}</p>
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (item) => (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {REASON_LABELS[item.reasonCategory]}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => <StatusBadge status={item.status} />,
    },
    {
      key: 'requestedAt',
      header: 'Requested',
      render: (item) => (
        <span className="text-gray-500">
          {new Date(item.requestedAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'resolvedBy',
      header: 'Resolved By',
      render: (item) => (
        <span className="text-gray-500">
          {item.resolvedBy ? item.resolvedBy.split('@')[0] : '—'}
        </span>
      ),
    },
  ];

  const handleSubmitOverride = async () => {
    // In production, calls apiClient.createOverride()
    setShowForm(false);
    setFormData({ reasonCategory: 'business_critical', justification: '' });
  };

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Overrides</h1>
          <p className="mt-1 text-sm text-gray-500">
            Request and manage policy override exceptions
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="btn-primary"
          type="button"
        >
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
          Request Override
        </button>
      </div>

      {/* Override request form */}
      {showForm && (
        <div className="mt-6 card border-brand-200 bg-brand-50">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Override Request</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="override-rule" className="block text-sm font-medium text-gray-700">
                Policy Rule
              </label>
              <select
                id="override-rule"
                value={formData.ruleId || ''}
                onChange={(e) => setFormData({ ...formData, ruleId: e.target.value })}
                className="input-field mt-1"
              >
                <option value="">Select a rule...</option>
                <option value="rule-001">International Flight Cap</option>
                <option value="rule-002">Advance Booking Requirement</option>
                <option value="rule-003">Business Class Restriction</option>
              </select>
            </div>
            <div>
              <label htmlFor="override-reason" className="block text-sm font-medium text-gray-700">
                Reason Category
              </label>
              <select
                id="override-reason"
                value={formData.reasonCategory || ''}
                onChange={(e) => setFormData({ ...formData, reasonCategory: e.target.value as CreateOverrideRequest['reasonCategory'] })}
                className="input-field mt-1"
              >
                <option value="business_critical">Business Critical</option>
                <option value="client_meeting">Client Meeting</option>
                <option value="emergency">Emergency</option>
                <option value="vip">VIP Travel</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="override-justification" className="block text-sm font-medium text-gray-700">
                Justification
              </label>
              <textarea
                id="override-justification"
                value={formData.justification || ''}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                rows={3}
                className="input-field mt-1"
                placeholder="Provide a detailed justification for this override request..."
                required
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum 20 characters. Include business context and why the standard policy cannot be followed.
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={handleSubmitOverride}
              disabled={!formData.ruleId || !formData.justification || (formData.justification?.length || 0) < 20}
              className="btn-primary"
              type="button"
            >
              Submit Request
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="btn-secondary"
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search overrides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-9"
            aria-label="Search overrides"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-field w-full sm:w-40"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Override history table */}
      <div className="mt-6">
        {filteredOverrides.length === 0 ? (
          <EmptyState
            title="No overrides found"
            description="No override requests match your search criteria."
          />
        ) : (
          <DataTable
            columns={columns}
            data={filteredOverrides}
            keyExtractor={(item) => item.id}
          />
        )}
      </div>

      {/* Summary stats */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="card text-center">
          <p className="text-2xl font-semibold text-gray-900">
            {MOCK_OVERRIDES.length}
          </p>
          <p className="text-xs text-gray-500">Total Requests</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-semibold text-amber-600">
            {MOCK_OVERRIDES.filter((o) => o.status === 'pending').length}
          </p>
          <p className="text-xs text-gray-500">Pending</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-semibold text-green-600">
            {MOCK_OVERRIDES.filter((o) => o.status === 'approved').length}
          </p>
          <p className="text-xs text-gray-500">Approved</p>
        </div>
        <div className="card text-center">
          <p className="text-2xl font-semibold text-red-600">
            {MOCK_OVERRIDES.filter((o) => o.status === 'rejected').length}
          </p>
          <p className="text-xs text-gray-500">Rejected</p>
        </div>
      </div>
    </div>
  );
}

export default function OverridesPage() {
  return (
    <ProtectedRoute requiredCapability="manage_overrides">
      <OverridesContent />
    </ProtectedRoute>
  );
}
