import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiResponse, Order, WSChannel, WSMessage } from '@kaipos/shared';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { clearToken, getToken, setToken } from '../lib/auth-storage.js';

const MAX_MESSAGES = 50;

function getDefaultEndpoint(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  return env?.VITE_WS_ENDPOINT ?? '';
}

interface TimestampedMessage {
  receivedAt: string;
  message: WSMessage;
}

interface DebugOrderForm {
  branchId: string;
  productName: string;
  unitPrice: string;
  quantity: string;
}

const defaultOrderForm: DebugOrderForm = {
  branchId: '',
  productName: 'Café americano',
  unitPrice: '3.50',
  quantity: '1',
};

export function DebugWebSocket() {
  const defaultEndpoint = useMemo(() => getDefaultEndpoint(), []);
  const [endpoint, setEndpoint] = useState<string>(defaultEndpoint);
  const [tokenInput, setTokenInput] = useState<string>(() => getToken() ?? '');
  const [subscribeInput, setSubscribeInput] = useState<string>('');
  const [messages, setMessages] = useState<TimestampedMessage[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState<DebugOrderForm>(defaultOrderForm);

  const ws = useWebSocket({ endpoint });

  const pushMessage = useCallback((message: WSMessage) => {
    setMessages((prev) => {
      const next: TimestampedMessage[] = [
        { receivedAt: new Date().toISOString(), message },
        ...prev,
      ];
      return next.slice(0, MAX_MESSAGES);
    });
  }, []);

  useEffect(() => ws.onMessage(pushMessage), [ws, pushMessage]);

  const onConnect = () => {
    setApiError(null);
    if (!endpoint) {
      setApiError('Endpoint is required (wss://...)');
      return;
    }
    if (!tokenInput) {
      setApiError('Token is required');
      return;
    }
    setToken(tokenInput);
    ws.connect(tokenInput);
  };

  const onDisconnect = () => {
    ws.disconnect();
  };

  const onForget = () => {
    clearToken();
    setTokenInput('');
  };

  const onSubscribe = () => {
    const trimmed = subscribeInput.trim();
    if (!trimmed) return;
    ws.subscribe(trimmed as WSChannel);
    setSubscribeInput('');
  };

  const onUnsubscribe = (channel: WSChannel) => {
    ws.unsubscribe(channel);
  };

  const authHeaders = useMemo<HeadersInit>(
    () => ({
      'Content-Type': 'application/json',
      ...(tokenInput ? { Authorization: `Bearer ${tokenInput}` } : {}),
    }),
    [tokenInput],
  );

  const onCreateOrder = async () => {
    setApiError(null);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          branchId: orderForm.branchId,
          paymentMethod: 'cash',
          items: [
            {
              productId: 'debug-product',
              productName: orderForm.productName,
              quantity: Number(orderForm.quantity) || 1,
              unitPrice: Number(orderForm.unitPrice) || 0,
            },
          ],
        }),
      });
      const json = (await res.json()) as ApiResponse<Order>;
      if (!res.ok || !json.success || !json.data) {
        setApiError(`Create order failed: ${res.status} ${JSON.stringify(json)}`);
        return;
      }
      setLastOrder(json.data);
    } catch (err) {
      setApiError(`Create order error: ${String(err)}`);
    }
  };

  const onMarkCompleted = async () => {
    if (!lastOrder) {
      setApiError('Create an order first');
      return;
    }
    setApiError(null);
    try {
      const res = await fetch(`/api/orders/${lastOrder._id}/status`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status: 'completed' }),
      });
      const json = (await res.json()) as ApiResponse<Order>;
      if (!res.ok || !json.success || !json.data) {
        setApiError(`Update status failed: ${res.status} ${JSON.stringify(json)}`);
        return;
      }
      setLastOrder(json.data);
    } catch (err) {
      setApiError(`Update status error: ${String(err)}`);
    }
  };

  const containerStyle: React.CSSProperties = {
    padding: '1.5rem',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: 960,
  };
  const sectionStyle: React.CSSProperties = {
    border: '1px solid #ddd',
    borderRadius: 4,
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
    marginBottom: '0.5rem',
    flexWrap: 'wrap',
  };
  const inputStyle: React.CSSProperties = { padding: '0.3rem 0.5rem', minWidth: 240 };
  const badgeStyle: React.CSSProperties = {
    padding: '0.1rem 0.5rem',
    borderRadius: 12,
    fontSize: 12,
    background: '#eee',
  };

  return (
    <div style={containerStyle}>
      <h1>Debug · WebSocket</h1>
      <p style={{ color: '#666' }}>
        Connect with a JWT access token and observe messages fanned out to your channels. The
        endpoint defaults to <code>VITE_WS_ENDPOINT</code>.
      </p>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Connection</h2>
        <div style={rowStyle}>
          <label>
            Endpoint{' '}
            <input
              style={{ ...inputStyle, minWidth: 360 }}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="wss://<api-id>.execute-api.us-east-1.amazonaws.com/prod"
            />
          </label>
        </div>
        <div style={rowStyle}>
          <label>
            Token{' '}
            <input
              style={{ ...inputStyle, minWidth: 360 }}
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="eyJhbGciOi..."
              type="password"
            />
          </label>
          <button onClick={onConnect}>Connect</button>
          <button onClick={onDisconnect}>Disconnect</button>
          <button onClick={onForget}>Forget token</button>
        </div>
        <div style={rowStyle}>
          <span style={badgeStyle}>status: {ws.status}</span>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Subscriptions</h2>
        <div style={rowStyle}>
          <input
            style={inputStyle}
            value={subscribeInput}
            onChange={(e) => setSubscribeInput(e.target.value)}
            placeholder="branch:<id> or business:<id>"
          />
          <button onClick={onSubscribe}>Subscribe</button>
          <button onClick={() => ws.ping()}>Ping</button>
        </div>
        {ws.subscribedChannels.length === 0 ? (
          <p style={{ color: '#666' }}>
            No active subscriptions (default channels are server-side).
          </p>
        ) : (
          <ul>
            {ws.subscribedChannels.map((channel) => (
              <li key={channel}>
                <code>{channel}</code>{' '}
                <button onClick={() => onUnsubscribe(channel)}>Unsubscribe</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.5rem' }}>Order demo</h2>
        <div style={rowStyle}>
          <label>
            branchId{' '}
            <input
              style={inputStyle}
              value={orderForm.branchId}
              onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })}
              placeholder="branch id"
            />
          </label>
          <label>
            product{' '}
            <input
              style={inputStyle}
              value={orderForm.productName}
              onChange={(e) => setOrderForm({ ...orderForm, productName: e.target.value })}
            />
          </label>
          <label>
            unitPrice{' '}
            <input
              style={{ ...inputStyle, minWidth: 100 }}
              value={orderForm.unitPrice}
              onChange={(e) => setOrderForm({ ...orderForm, unitPrice: e.target.value })}
            />
          </label>
          <label>
            qty{' '}
            <input
              style={{ ...inputStyle, minWidth: 60 }}
              value={orderForm.quantity}
              onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
            />
          </label>
        </div>
        <div style={rowStyle}>
          <button onClick={onCreateOrder}>Create order</button>
          <button onClick={onMarkCompleted} disabled={!lastOrder}>
            PATCH status → completed
          </button>
        </div>
        {lastOrder && (
          <p>
            Last order: <code>{lastOrder._id}</code> · {lastOrder.orderNumber} · status{' '}
            {lastOrder.status}
          </p>
        )}
        {apiError && <p style={{ color: 'crimson' }}>{apiError}</p>}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 0.5rem' }}>
          Messages <span style={{ fontWeight: 'normal', color: '#666' }}>(latest 50)</span>
        </h2>
        {messages.length === 0 ? (
          <p style={{ color: '#666' }}>No messages yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', background: '#fafafa' }}>
                <th style={{ padding: '0.35rem', borderBottom: '1px solid #eee' }}>Received</th>
                <th style={{ padding: '0.35rem', borderBottom: '1px solid #eee' }}>Type</th>
                <th style={{ padding: '0.35rem', borderBottom: '1px solid #eee' }}>Channel</th>
                <th style={{ padding: '0.35rem', borderBottom: '1px solid #eee' }}>Payload</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((entry, idx) => (
                <tr key={`${entry.receivedAt}-${idx}`}>
                  <td style={{ padding: '0.35rem', borderBottom: '1px solid #f2f2f2' }}>
                    {entry.receivedAt}
                  </td>
                  <td style={{ padding: '0.35rem', borderBottom: '1px solid #f2f2f2' }}>
                    <code>{entry.message.type}</code>
                  </td>
                  <td style={{ padding: '0.35rem', borderBottom: '1px solid #f2f2f2' }}>
                    <code>{entry.message.channel ?? '-'}</code>
                  </td>
                  <td style={{ padding: '0.35rem', borderBottom: '1px solid #f2f2f2' }}>
                    <code>{JSON.stringify(entry.message.payload)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
