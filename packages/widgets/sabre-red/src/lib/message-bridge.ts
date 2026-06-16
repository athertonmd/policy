// Inbound message types (host → widget)
export type InboundMessageType = 'INIT' | 'SEARCH_RESULTS' | 'END_TRANSACTION';

export interface InboundMessage {
  type: InboundMessageType;
  payload: unknown;
  correlationId: string;
  timestamp: number;
}

export interface InitPayload {
  tenantId: string;
  agentId: string;
}

export interface SearchResultsPayload {
  travellerId: string;
  origin: string;
  destination: string;
  departureDate: string;
  fares: Array<{
    id: string;
    flightNumber: string;
    airline: string;
    route: { origin: string; destination: string };
    cabinClass: string;
    price: number;
    currency: string;
  }>;
}

export interface EndTransactionPayload {
  pnrLocator: string;
  totalCost: { amount: number; currency: string };
  travellerId: string;
}

// Outbound message types (widget → host)
export type OutboundMessageType = 'READY' | 'COMPLIANCE_RESULT' | 'TICKET_DECISION';

export interface OutboundMessage {
  type: OutboundMessageType;
  payload: unknown;
  correlationId: string;
  timestamp: number;
}

// Configuration
export interface BridgeConfig {
  allowedOrigins: string[];
}

// Validate origin against allowlist
export function validateOrigin(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.length === 0) return true; // No restriction in dev
  return allowedOrigins.includes(origin);
}

// Validate that a message has the required shape
export function isValidMessage(data: unknown): data is InboundMessage {
  if (!data || typeof data !== 'object') return false;
  const msg = data as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    ['INIT', 'SEARCH_RESULTS', 'END_TRANSACTION'].includes(msg.type as string) &&
    typeof msg.correlationId === 'string' &&
    typeof msg.timestamp === 'number'
  );
}

// Listen for inbound messages
export function listen(
  handler: (msg: InboundMessage) => void,
  config: BridgeConfig
): () => void {
  function onMessage(event: MessageEvent) {
    // Validate origin
    if (!validateOrigin(event.origin, config.allowedOrigins)) {
      console.warn(`[MessageBridge] Rejected message from untrusted origin: ${event.origin}`);
      return;
    }
    // Validate message shape
    if (!isValidMessage(event.data)) {
      return; // Silently ignore malformed messages
    }
    handler(event.data);
  }

  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

// Send outbound message to parent
export function send(msg: OutboundMessage): void {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage(msg, '*');
  }
}

// Create a READY message
export function createReadyMessage(): OutboundMessage {
  return {
    type: 'READY',
    payload: { version: '0.1.0' },
    correlationId: crypto.randomUUID(),
    timestamp: Date.now(),
  };
}
