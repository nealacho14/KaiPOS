import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WSChannel, WSMessage } from '@kaipos/shared';
import { WSClient, type WSClientOptions, type WSClientStatus } from '../lib/ws-client.js';

export interface UseWebSocketResult {
  status: WSClientStatus;
  subscribedChannels: WSChannel[];
  connect: (token: string) => void;
  disconnect: () => void;
  subscribe: (channel: WSChannel) => void;
  unsubscribe: (channel: WSChannel) => void;
  ping: () => void;
  onMessage: (handler: (message: WSMessage) => void) => () => void;
}

export function useWebSocket(options: WSClientOptions): UseWebSocketResult {
  // The client instance is created exactly once via lazy initial state — its
  // internal socket and backoff counters must survive across renders.
  const [client] = useState(() => new WSClient(options));

  const [status, setStatus] = useState<WSClientStatus>(client.status);
  const [subscribedChannels, setSubscribedChannels] = useState<WSChannel[]>(
    client.subscribedChannels,
  );

  // Keep the WSClient's endpoint in sync with the prop so that an interactive
  // override (e.g. typing a new wss:// URL into the debug page) takes effect
  // on the next connect. Without this, the endpoint captured at first render
  // is frozen and silently overrides the input.
  useEffect(() => {
    client.setEndpoint(options.endpoint);
  }, [client, options.endpoint]);

  useEffect(() => {
    const offStatus = client.on('status', (next) => {
      setStatus(next);
      setSubscribedChannels(client.subscribedChannels);
    });
    return () => {
      offStatus();
      client.disconnect();
    };
  }, [client]);

  const connect = useCallback(
    (token: string) => {
      client.connect(token);
    },
    [client],
  );

  const disconnect = useCallback(() => {
    client.disconnect();
  }, [client]);

  const subscribe = useCallback(
    (channel: WSChannel) => {
      client.subscribe(channel);
      setSubscribedChannels(client.subscribedChannels);
    },
    [client],
  );

  const unsubscribe = useCallback(
    (channel: WSChannel) => {
      client.unsubscribe(channel);
      setSubscribedChannels(client.subscribedChannels);
    },
    [client],
  );

  const ping = useCallback(() => {
    client.ping();
  }, [client]);

  // Expose a raw message subscription so consumers can push to their own state
  // without round-tripping through React (avoids setState-in-effect warnings
  // and lets callers debounce / drop messages as they see fit).
  const onMessage = useCallback(
    (handler: (message: WSMessage) => void) => client.on('message', handler),
    [client],
  );

  return useMemo(
    () => ({
      status,
      subscribedChannels,
      connect,
      disconnect,
      subscribe,
      unsubscribe,
      ping,
      onMessage,
    }),
    [status, subscribedChannels, connect, disconnect, subscribe, unsubscribe, ping, onMessage],
  );
}
