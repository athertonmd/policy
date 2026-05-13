'use client';

import { useState } from 'react';
import { Play, Calendar } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SimulationReport } from '@/components/policies/SimulationReport';
import { DSLEditor } from '@/components/policies/DSLEditor';
import type { SimulationResult } from '@/lib/api-client';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

// Mock simulation result
const MOCK_RESULT: SimulationResult = {
  id: 'sim-001',
  tripsEvaluated: 1250,
  tripsAffected: 87,
  approvalRateChange: -3.2,
  costImpact: -15400,
  comparisonDetails: [
    { tripId: 'TRIP-001', currentDecision: 'Approve', proposedDecision: 'Reject', reason: 'Exceeds new cap of £2,000' },
    { tripId: 'TRIP-015', currentDecision: 'Approve', proposedDecision: 'Flag', reason: 'Advance booking < 14 days' },
    { tripId: 'TRIP-042', currentDecision: 'Approve', proposedDecision: 'Reject', reason: 'Business class on short-haul' },
  ],
};

function SimulateContent() {
  const [dsl, setDsl] = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [compareWithActive, setCompareWithActive] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);

  const handleRunSimulation = async () => {
    setIsRunning(true);
    // In production, this calls apiClient.simulatePolicy()
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setResult(MOCK_RESULT);
    setIsRunning(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Simulation</h1>
          <p className="mt-1 text-sm text-gray-500">
            Test policy changes against historical trip data before activating
          </p>
        </div>
      </div>

      {/* Configuration */}
      <div className="mt-6 card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Simulation Configuration</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-4">
          <div>
            <label htmlFor="sim-start" className="block text-sm font-medium text-gray-700">
              Start Date
            </label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="sim-start"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="input-field pl-9"
              />
            </div>
          </div>
          <div>
            <label htmlFor="sim-end" className="block text-sm font-medium text-gray-700">
              End Date
            </label>
            <div className="relative mt-1">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                id="sim-end"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="input-field pl-9"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <input
            id="compare-active"
            type="checkbox"
            checked={compareWithActive}
            onChange={(e) => setCompareWithActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          <label htmlFor="compare-active" className="text-sm text-gray-700">
            Compare with currently active rules
          </label>
        </div>

        <DSLEditor value={dsl} onChange={setDsl} />

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleRunSimulation}
            disabled={isRunning || !dsl}
            className="btn-primary"
            type="button"
          >
            <Play className="mr-1 h-4 w-4" aria-hidden="true" />
            {isRunning ? 'Running Simulation...' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {/* Results */}
      {isRunning && (
        <div className="mt-6 card flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner size="lg" label="Running simulation..." />
            <p className="mt-4 text-sm text-gray-500">Evaluating policy against historical trips...</p>
          </div>
        </div>
      )}

      {result && !isRunning && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Simulation Results</h2>
          <SimulationReport result={result} />
        </div>
      )}
    </div>
  );
}

export default function SimulatePage() {
  return (
    <ProtectedRoute requiredCapability="simulate_policies">
      <SimulateContent />
    </ProtectedRoute>
  );
}
