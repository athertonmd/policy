'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, Clock, User } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { DSLEditor } from '@/components/policies/DSLEditor';
import type { PolicyVersion } from '@/lib/api-client';

// Mock version history
const MOCK_VERSIONS: PolicyVersion[] = [
  {
    version: 3,
    dsl: 'rule "International Flight Cap" {\n  when trip.type == "international" and trip.amount > 2000\n  then reject\n}',
    status: 'active',
    createdAt: '2024-03-01T14:30:00Z',
    createdBy: 'admin@company.com',
    changeDescription: 'Reduced cap from £3,000 to £2,000',
  },
  {
    version: 2,
    dsl: 'rule "International Flight Cap" {\n  when trip.type == "international" and trip.amount > 3000\n  then reject\n}',
    status: 'archived',
    createdAt: '2024-02-15T10:00:00Z',
    createdBy: 'admin@company.com',
    changeDescription: 'Changed action from flag to reject',
  },
  {
    version: 1,
    dsl: 'rule "International Flight Cap" {\n  when trip.type == "international" and trip.amount > 3000\n  then flag\n}',
    status: 'archived',
    createdAt: '2024-01-15T10:00:00Z',
    createdBy: 'policy.admin@company.com',
    changeDescription: 'Initial version',
  },
];

function VersionsContent() {
  const router = useRouter();
  const [selectedVersion, setSelectedVersion] = useState<PolicyVersion>(MOCK_VERSIONS[0]);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const handleRollback = async (version: number) => {
    setIsRollingBack(true);
    // In production, this calls apiClient.rollbackPolicy()
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsRollingBack(false);
    router.refresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Version History</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage policy rule versions
          </p>
        </div>
        <button
          onClick={() => router.push('/policies')}
          className="btn-secondary"
          type="button"
        >
          Back to Policies
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Version list */}
        <div className="lg:col-span-1">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Versions</h2>
          <div className="space-y-2">
            {MOCK_VERSIONS.map((version) => (
              <button
                key={version.version}
                type="button"
                onClick={() => setSelectedVersion(version)}
                className={`w-full rounded-lg border p-3 text-left transition-colors ${
                  selectedVersion.version === version.version
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                aria-pressed={selectedVersion.version === version.version}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    Version {version.version}
                  </span>
                  <StatusBadge status={version.status} />
                </div>
                <p className="mt-1 text-xs text-gray-500">{version.changeDescription}</p>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {new Date(version.createdAt).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" aria-hidden="true" />
                    {version.createdBy.split('@')[0]}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Version detail */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">
              Version {selectedVersion.version} — {selectedVersion.changeDescription}
            </h2>
            {selectedVersion.status !== 'active' && (
              <button
                onClick={() => handleRollback(selectedVersion.version)}
                disabled={isRollingBack}
                className="btn-secondary text-sm"
                type="button"
              >
                <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />
                {isRollingBack ? 'Rolling back...' : 'Rollback to this version'}
              </button>
            )}
          </div>
          <DSLEditor value={selectedVersion.dsl} onChange={() => {}} readOnly />
        </div>
      </div>
    </div>
  );
}

export default function PolicyVersionsPage() {
  return (
    <ProtectedRoute requiredCapability="view_policies">
      <VersionsContent />
    </ProtectedRoute>
  );
}
