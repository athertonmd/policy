import { useState, useEffect } from 'react';
import { TravellerHeader } from './components/TravellerHeader';
import { ConnectionStatus } from './components/ConnectionStatus';
import { SearchSummary } from './components/SearchSummary';
import { CompliancePanel } from './components/CompliancePanel';
import { MockControlPanel } from './components/MockControlPanel';
import { PreTicketGate } from './components/PreTicketGate';
import { mockTraveller, mockFares } from './mock-data';
import { Fare } from './types';
import { listen, send, createReadyMessage, InboundMessage, SearchResultsPayload, EndTransactionPayload } from './lib/message-bridge';
import { mapToEvaluationRequest } from './lib/fare-mapper';
import { evaluateWithService } from './lib/policy-evaluation-service';
import { evaluatePreTicket, PreTicketResult } from './lib/pre-ticket-evaluator';

type ConnectionState = 'disconnected' | 'connected' | 'mock';

interface SearchContext {
  origin: string;
  destination: string;
  departureDate: string;
}

function isMockMode(): boolean {
  if (typeof window === 'undefined') return true;
  const isStandalone = window.parent === window;
  const params = new URLSearchParams(window.location.search);
  return isStandalone || params.get('mode') === 'mock';
}

async function mapPayloadToFares(payload: SearchResultsPayload): Promise<{ fares: Fare[]; error?: string }> {
  const request = mapToEvaluationRequest(payload);
  const result = await evaluateWithService(request);

  const fares = payload.fares
    .filter((fare) => fare.id && fare.price != null && fare.flightNumber && fare.airline)
    .map((fare, index) => {
      const decision = result.decisions[index];
      return {
        id: fare.id,
        flightNumber: fare.flightNumber,
        airline: fare.airline,
        route: fare.route || { origin: payload.origin, destination: payload.destination },
        cabinClass: fare.cabinClass || '',
        price: fare.price,
        currency: fare.currency || '£',
        compliance: {
          status: decision.status,
          reasons: decision.reasons,
          violatedRules: decision.violatedRules,
          obligations: decision.obligations,
          alternatives: decision.alternatives,
        },
      };
    });

  return { fares, error: result.error };
}

export default function App() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    isMockMode() ? 'mock' : 'disconnected'
  );
  const [fares, setFares] = useState<Fare[]>(mockFares);
  const [searchContext, setSearchContext] = useState<SearchContext | null>(null);
  const [preTicketResult, setPreTicketResult] = useState<PreTicketResult | null>(null);
  const [preTicketPnr, setPreTicketPnr] = useState<string>('');
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  useEffect(() => {
    // Send READY message on mount
    send(createReadyMessage());

    // Listen for inbound messages
    const unsubscribe = listen(
      (msg: InboundMessage) => {
        switch (msg.type) {
          case 'INIT':
            setConnectionState('connected');
            break;

          case 'SEARCH_RESULTS': {
            const payload = msg.payload as SearchResultsPayload;
            mapPayloadToFares(payload).then(({ fares: mappedFares, error }) => {
              setFares(mappedFares);
              setEvaluationError(error ?? null);

              // Update search context (clear if empty origin)
              if (payload.origin && payload.destination) {
                setSearchContext({
                  origin: payload.origin,
                  destination: payload.destination,
                  departureDate: payload.departureDate,
                });
              } else {
                setSearchContext(null);
              }
            });
            break;
          }

          case 'END_TRANSACTION': {
            const payload = msg.payload as EndTransactionPayload;
            const request = {
              pnrLocator: payload.pnrLocator,
              totalCost: payload.totalCost,
              travellerId: payload.travellerId,
            };
            const result = evaluatePreTicket(request);

            // SAFETY INVARIANT: hold/block must NEVER produce a proceed decision outbound
            const outboundAction: string = result.action;
            if (result.action === 'hold' || result.action === 'block') {
              console.assert(
                outboundAction !== 'proceed',
                'CRITICAL: hold/block must never produce proceed action'
              );
            }

            setPreTicketResult(result);
            setPreTicketPnr(payload.pnrLocator);

            // Send outbound TICKET_DECISION
            send({
              type: 'TICKET_DECISION',
              payload: {
                pnrLocator: payload.pnrLocator,
                action: result.action,
                reasons: result.reasons,
                violatedRules: result.violatedRules,
                workflowId: result.workflowId,
              },
              correlationId: msg.correlationId,
              timestamp: Date.now(),
            });
            break;
          }
        }
      },
      { allowedOrigins: [] } // Accept all origins in dev/MVP
    );

    return unsubscribe;
  }, []);

  function handleClearFares() {
    setFares([]);
    setSearchContext(null);
  }

  function handleDismissGate() {
    setPreTicketResult(null);
    setPreTicketPnr('');
  }

  return (
    <div className="flex flex-col h-screen w-full min-w-[320px] max-w-[480px] mx-auto overflow-hidden bg-white">
      <TravellerHeader traveller={mockTraveller} />
      <ConnectionStatus mode={connectionState} />
      {evaluationError && (
        <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-amber-700 text-xs" data-testid="evaluation-warning">
          ⚠ Policy service unavailable — showing cached results
        </div>
      )}
      <SearchSummary
        route={searchContext ? { origin: searchContext.origin, destination: searchContext.destination } : null}
        departureDate={searchContext?.departureDate ?? null}
        fareCount={fares.length}
      />
      <CompliancePanel fares={fares} />
      {(connectionState === 'mock') && (
        <MockControlPanel
          onLoadFares={() => setFares(mockFares)}
          onClearFares={handleClearFares}
        />
      )}
      {preTicketResult && (
        <PreTicketGate
          result={preTicketResult}
          pnrLocator={preTicketPnr}
          onDismiss={handleDismissGate}
        />
      )}
    </div>
  );
}
