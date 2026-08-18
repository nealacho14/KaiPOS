import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useWebSocket, type UseWebSocketResult } from '../hooks/useWebSocket.js';

export interface WebSocketContextValue extends UseWebSocketResult {
  endpoint: string;
  hasEndpoint: boolean;
  setEndpoint: (endpoint: string) => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export interface WebSocketProviderProps {
  initialEndpoint: string;
  children: ReactNode;
}

export function WebSocketProvider({ initialEndpoint, children }: WebSocketProviderProps) {
  const [endpoint, setEndpoint] = useState(initialEndpoint);
  const ws = useWebSocket({ endpoint });

  const value = useMemo<WebSocketContextValue>(
    () => ({
      ...ws,
      endpoint,
      hasEndpoint: endpoint.length > 0,
      setEndpoint,
    }),
    [ws, endpoint],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error('useWebSocketContext must be used within <WebSocketProvider>');
  }
  return ctx;
}
