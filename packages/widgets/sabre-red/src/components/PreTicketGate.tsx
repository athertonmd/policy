import { PreTicketResult } from '../lib/pre-ticket-evaluator';

interface PreTicketGateProps {
  result: PreTicketResult;
  pnrLocator: string;
  onDismiss: () => void;
}

export function PreTicketGate({ result, pnrLocator, onDismiss }: PreTicketGateProps) {
  const { action, reasons, violatedRules, workflowId } = result;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      data-testid="pre-ticket-gate"
    >
      <div className="bg-white rounded-lg shadow-xl mx-4 w-full max-w-sm overflow-hidden">
        {action === 'proceed' && (
          <div className="bg-green-50 border-l-4 border-green-500 p-4">
            <p className="font-semibold text-green-800" data-testid="pre-ticket-action" data-action="proceed">
              ✓ Proceed with ticketing
            </p>
            <p className="text-sm text-green-700 mt-1">PNR: {pnrLocator}</p>
          </div>
        )}

        {action === 'hold' && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4">
            <p className="font-semibold text-amber-800" data-testid="pre-ticket-action" data-action="hold">
              ⚠ Held for approval
            </p>
            <ul className="text-sm text-amber-700 mt-2 space-y-1">
              {reasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
            {workflowId && (
              <p className="text-xs text-amber-600 mt-2">Workflow ID: {workflowId}</p>
            )}
            <p className="text-xs text-amber-600 mt-1">Awaiting manager approval</p>
          </div>
        )}

        {action === 'block' && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4">
            <p className="font-semibold text-red-800" data-testid="pre-ticket-action" data-action="block">
              ✗ Ticketing blocked
            </p>
            <ul className="text-sm text-red-700 mt-2 space-y-1">
              {reasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
            {violatedRules.length > 0 && (
              <p className="text-xs text-red-600 mt-2">
                Rules: {violatedRules.join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="p-3 border-t border-gray-200 flex justify-end">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-xs font-medium rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
            type="button"
            data-testid="pre-ticket-dismiss"
          >
            {action === 'proceed' ? 'Dismiss' : 'Acknowledged'}
          </button>
        </div>
      </div>
    </div>
  );
}
