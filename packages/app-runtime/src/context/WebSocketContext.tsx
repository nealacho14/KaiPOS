import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { WSChannel, WSMessage } from '@kaipos/shared';
import type { WSClientStatus } from '../lib/ws-client.js';
import { getFreshAccessToken } from '../lib/api.js';
import { useWebSocket } from '../hooks/useWebSocket.js';

/**
 * The WS context is split in two on purpose. The 2026-05-06 production
 * incident was a `useEffect(..., [ws])` around subscribe/unsubscribe: the
 * merged context object changed identity on every subscribe (it carries
 * `subscribedChannels`), so the effect re-ran, re-subscribed, changed the
 * identity again — an infinite loop that drove ~6,000 Lambda invocations/min
 * from one tab. Actions are identity-stable and safe in dependency arrays;
 * reactive state lives in its own context and never needs to be a dep of an
 * effect that calls the actions.
 */
export interface WebSocketActions {
  connect: (token: string) => void;
  disconnect: () => void;
  subscribe: (channel: WSChannel) => void;
  unsubscribe: (channel: WSChannel) => void;
  ping: () => void;
  onMessage: (handler: (message: WSMessage) => void) => () => void;
  setEndpoint: (endpoint: string) => void;
}

export interface WebSocketState {
  status: WSClientStatus;
  subscribedChannels: WSChannel[];
  endpoint: string;
  hasEndpoint: boolean;
}

/** @deprecated Use `useWebSocketActions()` / `useWebSocketState()` instead. */
export interface WebSocketContextValue extends WebSocketActions, WebSocketState {}

const WebSocketActionsContext = createContext<WebSocketActions | null>(null);
const WebSocketStateContext = createContext<WebSocketState | null>(null);

export interface WebSocketProviderProps {
  initialEndpoint: string;
  children: ReactNode;
}

export function WebSocketProvider({ initialEndpoint, children }: WebSocketProviderProps) {
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const ws = useWebSocket({ endpoint, getToken: getFreshAccessToken });

  // Every value here is a stable useCallback (or a setState dispatch), so
  // this memo's identity never changes for the lifetime of the provider.
  const actions = useMemo<WebSocketActions>(
    () => ({
      connect: ws.connect,
      disconnect: ws.disconnect,
      subscribe: ws.subscribe,
      unsubscribe: ws.unsubscribe,
      ping: ws.ping,
      onMessage: ws.onMessage,
      setEndpoint,
    }),
    [ws.connect, ws.disconnect, ws.subscribe, ws.unsubscribe, ws.ping, ws.onMessage],
  );

  const state = useMemo<WebSocketState>(
    () => ({
      status: ws.status,
      subscribedChannels: ws.subscribedChannels,
      endpoint,
      hasEndpoint: endpoint.length > 0,
    }),
    [ws.status, ws.subscribedChannels, endpoint],
  );

  return (
    <WebSocketActionsContext.Provider value={actions}>
      <WebSocketStateContext.Provider value={state}>{children}</WebSocketStateContext.Provider>
    </WebSocketActionsContext.Provider>
  );
}

/**
 * Identity-stable action set — safe to put in `useEffect` dependency arrays.
 */
export function useWebSocketActions(): WebSocketActions {
  const ctx = useContext(WebSocketActionsContext);
  if (!ctx) {
    throw new Error('useWebSocketActions must be used within <WebSocketProvider>');
  }
  return ctx;
}

/**
 * Reactive connection state. Changes on every status/subscription update —
 * never spread it into an effect that calls the actions; depend on the
 * primitive fields you actually read (e.g. `state.status`).
 */
export function useWebSocketState(): WebSocketState {
  const ctx = useContext(WebSocketStateContext);
  if (!ctx) {
    throw new Error('useWebSocketState must be used within <WebSocketProvider>');
  }
  return ctx;
}

/**
 * @deprecated The merged object changes identity on every subscribe — using
 * it in a `useEffect` dependency array reproduces the 2026-05-06 subscribe
 * loop incident. Use `useWebSocketActions()` for effects and
 * `useWebSocketState()` for rendering.
 */
export function useWebSocketContext(): WebSocketContextValue {
  const actions = useWebSocketActions();
  const state = useWebSocketState();
  return useMemo(() => ({ ...actions, ...state }), [actions, state]);
}
