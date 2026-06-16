import { searchScenarios, createSearchMessage } from '../lib/search-scenarios';

interface MockControlPanelProps {
  onLoadFares: () => void;
  onClearFares: () => void;
}

function simulateInit() {
  window.postMessage(
    {
      type: 'INIT',
      payload: { tenantId: 'tenant-001', agentId: 'agent-042' },
      correlationId: 'mock-init-001',
      timestamp: Date.now(),
    },
    '*'
  );
}

function simulateScenario(index: number) {
  const scenario = searchScenarios[index];
  window.postMessage(createSearchMessage(scenario), '*');
}

function clearSearch() {
  window.postMessage(
    {
      type: 'SEARCH_RESULTS',
      payload: {
        travellerId: 'trav-001',
        origin: '',
        destination: '',
        departureDate: '',
        fares: [],
      },
      correlationId: 'mock-clear-search',
      timestamp: Date.now(),
    },
    '*'
  );
}

function simulateEndTxnProceed() {
  window.postMessage(
    {
      type: 'END_TRANSACTION',
      payload: {
        pnrLocator: 'ABC123',
        totalCost: { amount: 1500, currency: 'GBP' },
        travellerId: 'trav-001',
      },
      correlationId: 'mock-end-txn-proceed',
      timestamp: Date.now(),
    },
    '*'
  );
}

function simulateEndTxnHold() {
  window.postMessage(
    {
      type: 'END_TRANSACTION',
      payload: {
        pnrLocator: 'DEF456',
        totalCost: { amount: 3000, currency: 'GBP' },
        travellerId: 'trav-001',
      },
      correlationId: 'mock-end-txn-hold',
      timestamp: Date.now(),
    },
    '*'
  );
}

function simulateEndTxnBlock() {
  window.postMessage(
    {
      type: 'END_TRANSACTION',
      payload: {
        pnrLocator: 'GHI789',
        totalCost: { amount: 6000, currency: 'GBP' },
        travellerId: 'trav-001',
      },
      correlationId: 'mock-end-txn-block',
      timestamp: Date.now(),
    },
    '*'
  );
}

export function MockControlPanel({ onLoadFares, onClearFares }: MockControlPanelProps) {
  return (
    <div className="border-t border-gray-200 bg-gray-100 px-3 py-2" data-testid="mock-control-panel">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
        Mock Controls
      </p>

      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Search Scenarios
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {searchScenarios.map((scenario, index) => (
          <button
            key={scenario.label}
            onClick={() => simulateScenario(index)}
            className="px-2 py-1 text-xs font-medium rounded bg-teal-600 text-white hover:bg-teal-700"
            type="button"
          >
            {scenario.label}
          </button>
        ))}
        <button
          onClick={clearSearch}
          className="px-2 py-1 text-xs font-medium rounded bg-gray-300 text-gray-700 hover:bg-gray-400"
          type="button"
        >
          Clear Search
        </button>
      </div>

      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Pre-Ticket
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={simulateEndTxnProceed}
          className="px-2 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700"
          type="button"
        >
          End Txn: Proceed
        </button>
        <button
          onClick={simulateEndTxnHold}
          className="px-2 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700"
          type="button"
        >
          End Txn: Hold
        </button>
        <button
          onClick={simulateEndTxnBlock}
          className="px-2 py-1 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700"
          type="button"
        >
          End Txn: Block
        </button>
      </div>

      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
        Other
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onLoadFares}
          className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
          type="button"
        >
          Load Sample Fares
        </button>
        <button
          onClick={onClearFares}
          className="px-2 py-1 text-xs font-medium rounded bg-gray-300 text-gray-700 hover:bg-gray-400"
          type="button"
        >
          Clear
        </button>
        <button
          onClick={simulateInit}
          className="px-2 py-1 text-xs font-medium rounded bg-purple-600 text-white hover:bg-purple-700"
          type="button"
        >
          Simulate INIT
        </button>
      </div>
    </div>
  );
}
