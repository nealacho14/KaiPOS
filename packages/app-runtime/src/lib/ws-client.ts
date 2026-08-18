import type { WSChannel, WSClientRequest, WSMessage } from '@kaipos/shared';

export type WSClientStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'reconnecting' | 'failed';

export interface WSClientOptions {
  endpoint: string;
  initialBackoffMs?: number;
  maxBackoffMs?: number;
  /**
   * Consecutive reconnect attempts before giving up with status `'failed'`.
   * `'failed'` is terminal until a fresh `connect()` — without a ceiling an
   * abandoned tab with a dead session retries every `maxBackoffMs` forever,
   * one $connect Lambda invocation at a time.
   */
  maxReconnectAttempts?: number;
  /**
   * Called before each *re*connect attempt to obtain a fresh token. The token
   * passed to `connect()` is used as-is for the first dial. A 401 handshake
   * rejection reaches the browser as a generic 1006 close (indistinguishable
   * from a network drop), so instead of special-casing close codes every
   * retry re-reads the token; returning `null` (no session) fails terminally
   * instead of dialing with a token known to be dead.
   */
  getToken?: () => string | null | Promise<string | null>;
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
// 10 attempts at 1s→30s backoff ≈ 3.5 min of trying — enough to ride out a
// deploy or a WiFi blip, short enough that dead sessions stop billing us.
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 10;

/**
 * Tracks subscriptions client-side so that after a reconnect we can re-emit
 * them automatically (the server only remembers them in DDB against the old
 * connectionId, which is gone).
 */
export class WSClient {
  private endpoint: string;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly getTokenFn: WSClientOptions['getToken'];

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
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    this.getTokenFn = options.getToken;
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
    // A fresh explicit connect always starts with a clean slate, including
    // recovery from a terminal 'failed' state.
    this.reconnectAttempts = 0;
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

    // Reconnects re-read the token so a session refreshed since connect()
    // (or expired mid-outage) doesn't hammer $connect with a dead JWT. The
    // first dial keeps the token passed to connect() verbatim, so explicit
    // tokens (debug page) keep working.
    if (this.getTokenFn && this.reconnectAttempts > 0) {
      void this.refreshTokenAndDial();
      return;
    }
    this.dial();
  }

  private async refreshTokenAndDial(): Promise<void> {
    let token: string | null = null;
    try {
      token = await this.getTokenFn!();
    } catch (err) {
      this.emit('error', err);
    }
    // A manual disconnect() while the token fetch was in flight wins.
    if (this.manualClose) return;
    if (!token) {
      this.setStatus('failed');
      return;
    }
    this.token = token;
    this.dial();
  }

  private dial(): void {
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
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus('failed');
      return;
    }
    this.setStatus('reconnecting');
    const base = Math.min(this.initialBackoffMs * 2 ** this.reconnectAttempts, this.maxBackoffMs);
    // ±20% jitter (mirrors the HTTP client's throttle retry) so a fleet-wide
    // socket drop doesn't reconnect in lockstep against $connect.
    const jitter = (Math.random() - 0.5) * 0.4 * base;
    const delay = Math.round(base + jitter);
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
