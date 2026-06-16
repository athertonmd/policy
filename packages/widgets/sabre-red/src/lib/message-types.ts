// Re-export all message bridge types for convenience
export type {
  InboundMessageType,
  InboundMessage,
  InitPayload,
  SearchResultsPayload,
  EndTransactionPayload,
  OutboundMessageType,
  OutboundMessage,
  BridgeConfig,
} from './message-bridge';

export {
  validateOrigin,
  isValidMessage,
  listen,
  send,
  createReadyMessage,
} from './message-bridge';
