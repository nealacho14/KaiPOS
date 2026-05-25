import type { WSChannel, WSClientRequest, WSMessage } from '@kaipos/shared';

export type WSClientStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface WSClientOptions {
  endpoint: string;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
}

export interface WSClientEventMap {
  open: () => void;
  close: (event: { code: number; reason: string; wasClean: boolean }) => void;
  error: (err: unknown) => void;
  message: (message: WSMessage) => void;
  status: (status: WSClientStatus) => void;
}

type Listener<K extends keyof WSClientEventMap> = WSClientEventMap[K];

const DEFAULT_INITIAL_BACKOFF_MS = 1000;
const DEFAULT_MAX_BACKOFF_MS = 30_000;

/**
 * Tracks subscriptions client-side so that after a reconnect we can re-emit
 * them automatically (the server only remembers them in DDB against the old
 * connectionId, which is gone).
 */
export class WSClient {
  private endpoint: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;

  private ws: WebSocket | null = null;
  private token: string | null = null;
  private statusValue: WSClientStatus = 'idle';
  private readonly subscriptions = new Set<WSChannel>();
  private readonly listeners: {
    [K in keyof WSClientEventMap]: Set<Listener<K>>;
  } = {
    open: new Set(),
    close: new Set(),
    error: new Set(),
    message: new Set(),
    status: new Set(),
  };

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;

  constructor(options: WSClientOptions) {
    this.endpoint = options.endpoint;
    this.initialBackoffMs = options.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS;
    this.maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  }

  get status(): WSClientStatus {
    return this.statusValue;
  }

  get subscribedChannels(): WSChannel[] {
    return Array.from(this.subscriptions);
  }

  /**
   * Updates the endpoint for the next `connect()` / reconnect attempt. Does
   * not disturb an already-open socket — callers who want the change to take
   * effect immediately should `disconnect()` and `connect()` again.
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }

  on<K extends keyof WSClientEventMap>(event: K, handler: Listener<K>): () => void {
    this.listeners[event].add(handler);
    return () => {
      this.listeners[event].delete(handler);
    };
  }

  connect(token: string): void {
    this.token = token;
    this.manualClose = false;
    this.openSocket();
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    if (this.ws) {
      try {
        this.ws.close(1000, 'client disconnect');
      } catch {
        // ignore — the close handler will clean up
      }
      this.ws = null;
    }
    this.setStatus('closed');
  }

  subscribe(channel: WSChannel): void {
    this.subscriptions.add(channel);
    this.sendRequest({ type: 'subscribe', channel });
  }

  unsubscribe(channel: WSChannel): void {
    this.subscriptions.delete(channel);
    this.sendRequest({ type: 'unsubscribe', channel });
  }

  ping(): void {
    this.sendRequest({ type: 'ping' });
  }

  private sendRequest(req: WSClientRequest): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(req));
    } catch (err) {
      this.emit('error', err);
    }
  }

  private buildUrl(): string {
    if (!this.token) {
      throw new Error('WSClient: connect(token) must be called with a token');
    }
    const sep = this.endpoint.includes('?') ? '&' : '?';
    const params = new URLSearchParams({ token: this.token });
    return `${this.endpoint}${sep}${params.toString()}`;
  }

  private openSocket(): void {
    if (!this.token) return;
    this.clearReconnectTimer();
    this.setStatus(this.reconnectAttempts === 0 ? 'connecting' : 'reconnecting');

    let ws: WebSocket;
    try {
      ws = new WebSocket(this.buildUrl());
    } catch (err) {
      this.emit('error', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.setStatus('open');
      // Re-emit all tracked subscriptions so a reconnect is invisible to callers.
      for (const channel of this.subscriptions) {
        this.sendRequest({ type: 'subscribe', channel });
      }
      this.emit('open');
    };

    ws.onmessage = (event: MessageEvent) => {
      const data = typeof event.data === 'string' ? event.data : null;
      if (data === null) return;
      try {
        const parsed = JSON.parse(data) as WSMessage;
        this.emit('message', parsed);
      } catch (err) {
        this.emit('error', err);
      }
    };

    ws.onerror = (err) => {
      this.emit('error', err);
    };

    ws.onclose = (event: CloseEvent) => {
      this.ws = null;
      this.emit('close', { code: event.code, reason: event.reason, wasClean: event.wasClean });
      if (this.manualClose) {
        this.setStatus('closed');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;
    this.setStatus('reconnecting');
    const delay = Math.min(this.initialBackoffMs * 2 ** this.reconnectAttempts, this.maxBackoffMs);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: WSClientStatus): void {
    if (this.statusValue === status) return;
    this.statusValue = status;
    this.emit('status', status);
  }

  private emit<K extends keyof WSClientEventMap>(event: K, ...args: Parameters<Listener<K>>): void {
    for (const handler of this.listeners[event]) {
      try {
        (handler as (...a: Parameters<Listener<K>>) => void)(...args);
      } catch (err) {
        // Swallow listener errors so one bad listener can't break the client.
        // eslint-disable-next-line no-console
        console.error('WSClient listener threw', err);
      }
    }
  }
}
