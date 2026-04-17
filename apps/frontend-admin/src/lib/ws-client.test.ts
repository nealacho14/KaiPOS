import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WSChannel, WSMessage } from '@kaipos/shared';
import { WSClient } from './ws-client.js';

/**
 * Minimal stand-in for the browser WebSocket. Exposes the readyState constants
 * the spec uses, and lets tests drive lifecycle events (open/message/close)
 * without any real network.
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];

  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket not open');
    }
    this.sent.push(data);
  }

  close(code = 1000, reason = ''): void {
    this.simulateClose({ code, reason, wasClean: true });
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(message: WSMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  simulateClose(event: { code: number; reason: string; wasClean: boolean }): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.(event);
  }
}

function installMockWebSocket(): void {
  MockWebSocket.instances = [];
  (globalThis as unknown as { WebSocket: typeof MockWebSocket }).WebSocket = MockWebSocket;
}

const branchChannel: WSChannel = 'branch:br_1';
const tableChannel: WSChannel = 'table:t_1';

describe('WSClient', () => {
  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('appends the token as a query param', () => {
    const client = new WSClient({ endpoint: 'wss://example/prod' });
    client.connect('jwt-token');
    const url = MockWebSocket.instances[0]!.url;
    expect(url).toContain('wss://example/prod?');
    expect(url).toContain('token=jwt-token');
  });

  it('reports status transitions and emits message envelopes', () => {
    const client = new WSClient({ endpoint: 'wss://example/prod' });
    const statusSpy = vi.fn();
    const messageSpy = vi.fn();
    client.on('status', statusSpy);
    client.on('message', messageSpy);

    client.connect('jwt');
    expect(statusSpy).toHaveBeenCalledWith('connecting');

    const sock = MockWebSocket.instances[0]!;
    sock.simulateOpen();
    expect(statusSpy).toHaveBeenCalledWith('open');

    const msg: WSMessage = {
      type: 'order.status-changed',
      channel: branchChannel,
      payload: { foo: 'bar' },
      v: 1,
    };
    sock.simulateMessage(msg);
    expect(messageSpy).toHaveBeenCalledWith(msg);
  });

  it('reconnects with exponential backoff after an unexpected close', () => {
    const client = new WSClient({
      endpoint: 'wss://example/prod',
      initialBackoffMs: 1000,
      maxBackoffMs: 30_000,
    });
    client.connect('jwt');
    MockWebSocket.instances[0]!.simulateOpen();
    MockWebSocket.instances[0]!.simulateClose({ code: 1006, reason: 'net', wasClean: false });
    expect(client.status).toBe('reconnecting');

    // 1s delay → attempt #2
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(2);

    MockWebSocket.instances[1]!.simulateClose({ code: 1006, reason: 'net', wasClean: false });
    // 2s delay → attempt #3
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances).toHaveLength(3);

    MockWebSocket.instances[2]!.simulateClose({ code: 1006, reason: 'net', wasClean: false });
    // 4s delay → attempt #4
    vi.advanceTimersByTime(4000);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('caps backoff at maxBackoffMs', () => {
    const client = new WSClient({
      endpoint: 'wss://example/prod',
      initialBackoffMs: 1000,
      maxBackoffMs: 4000,
    });
    client.connect('jwt');
    // Cycle through several failures; once capped, each subsequent reconnect
    // should wait exactly maxBackoffMs regardless of the attempt counter.
    MockWebSocket.instances[0]!.simulateClose({ code: 1006, reason: '', wasClean: false });
    vi.advanceTimersByTime(1000);
    MockWebSocket.instances[1]!.simulateClose({ code: 1006, reason: '', wasClean: false });
    vi.advanceTimersByTime(2000);
    MockWebSocket.instances[2]!.simulateClose({ code: 1006, reason: '', wasClean: false });
    vi.advanceTimersByTime(4000);
    MockWebSocket.instances[3]!.simulateClose({ code: 1006, reason: '', wasClean: false });
    // 8s would be next — but cap is 4s, so after 4s the 5th socket appears.
    vi.advanceTimersByTime(3999);
    expect(MockWebSocket.instances).toHaveLength(4);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(5);
  });

  it('re-emits tracked subscriptions on reconnect', () => {
    const client = new WSClient({ endpoint: 'wss://example/prod', initialBackoffMs: 10 });
    client.connect('jwt');

    const sock1 = MockWebSocket.instances[0]!;
    sock1.simulateOpen();
    client.subscribe(branchChannel);
    client.subscribe(tableChannel);
    expect(sock1.sent).toEqual([
      JSON.stringify({ type: 'subscribe', channel: branchChannel }),
      JSON.stringify({ type: 'subscribe', channel: tableChannel }),
    ]);

    sock1.simulateClose({ code: 1006, reason: '', wasClean: false });
    vi.advanceTimersByTime(10);

    const sock2 = MockWebSocket.instances[1]!;
    sock2.simulateOpen();
    // Both subscriptions must be re-sent with no caller intervention.
    expect(sock2.sent).toEqual([
      JSON.stringify({ type: 'subscribe', channel: branchChannel }),
      JSON.stringify({ type: 'subscribe', channel: tableChannel }),
    ]);
  });

  it('stops reconnecting on manual disconnect', () => {
    const client = new WSClient({ endpoint: 'wss://example/prod', initialBackoffMs: 10 });
    client.connect('jwt');
    MockWebSocket.instances[0]!.simulateOpen();
    client.disconnect();
    expect(client.status).toBe('closed');
    vi.advanceTimersByTime(10_000);
    // Only the original socket should exist — no reconnect timer fired.
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('forgets a channel on unsubscribe so reconnect does not re-subscribe it', () => {
    const client = new WSClient({ endpoint: 'wss://example/prod', initialBackoffMs: 10 });
    client.connect('jwt');
    const sock1 = MockWebSocket.instances[0]!;
    sock1.simulateOpen();
    client.subscribe(branchChannel);
    client.unsubscribe(branchChannel);
    expect(client.subscribedChannels).toEqual([]);

    sock1.simulateClose({ code: 1006, reason: '', wasClean: false });
    vi.advanceTimersByTime(10);
    const sock2 = MockWebSocket.instances[1]!;
    sock2.simulateOpen();
    expect(sock2.sent).toEqual([]);
  });
});
