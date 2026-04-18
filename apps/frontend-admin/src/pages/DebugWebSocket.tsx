import type { ApiResponse, Order, WSChannel, WSMessage } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@kaipos/ui';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader, WsStatusChip } from '../components/index.js';
import { useWebSocketContext } from '../context/WebSocketContext.js';
import { api } from '../lib/api.js';
import { getSession } from '../lib/auth-storage.js';

const MAX_MESSAGES = 50;

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
  const ws = useWebSocketContext();
  const [endpointInput, setEndpointInput] = useState<string>(ws.endpoint);
  const [tokenInput, setTokenInput] = useState<string>(() => getSession()?.accessToken ?? '');
  const [subscribeInput, setSubscribeInput] = useState<string>('');
  const [messages, setMessages] = useState<TimestampedMessage[]>([]);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [orderForm, setOrderForm] = useState<DebugOrderForm>(defaultOrderForm);

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
    const endpoint = endpointInput.trim();
    if (!endpoint) {
      setApiError('Endpoint is required (wss://...)');
      return;
    }
    if (!tokenInput) {
      setApiError('Token is required');
      return;
    }
    // Per WSClient.setEndpoint's JSDoc, the endpoint change only takes effect
    // on the next connect — if a socket is already live we must tear it down
    // first so we don't leak a dangling WebSocket against the old endpoint.
    const active =
      ws.status === 'open' || ws.status === 'connecting' || ws.status === 'reconnecting';
    if (active) {
      ws.disconnect();
    }
    ws.setEndpoint(endpoint);
    ws.connect(tokenInput);
  };

  const onDisconnect = () => ws.disconnect();

  const onSubscribe = () => {
    const trimmed = subscribeInput.trim();
    if (!trimmed) return;
    ws.subscribe(trimmed as WSChannel);
    setSubscribeInput('');
  };

  const onUnsubscribe = (channel: WSChannel) => ws.unsubscribe(channel);

  const onCreateOrder = async () => {
    setApiError(null);
    try {
      const res = await api('/api/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
      const res = await api(`/api/orders/${lastOrder._id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
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

  const chipStatus = ws.hasEndpoint ? ws.status : 'idle';

  return (
    <>
      <PageHeader
        title="Debug · WebSocket"
        subtitle="Conecta con un JWT y observa los mensajes fanned-out a tus canales."
        actions={<WsStatusChip status={chipStatus} />}
      />

      <Stack spacing={2}>
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Connection
            </Typography>
            <Stack spacing={2}>
              <TextField
                label="Endpoint"
                value={endpointInput}
                onChange={(e) => setEndpointInput(e.target.value)}
                placeholder="wss://<api-id>.execute-api.us-east-1.amazonaws.com/prod"
                fullWidth
              />
              <TextField
                label="Token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="eyJhbGciOi..."
                type="password"
                fullWidth
              />
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Button variant="contained" onClick={onConnect}>
                  Connect
                </Button>
                <Button variant="outlined" onClick={onDisconnect}>
                  Disconnect
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Chip
                  label={`status: ${ws.status}`}
                  size="small"
                  color={ws.status === 'open' ? 'success' : 'default'}
                  variant="outlined"
                />
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Subscriptions
            </Typography>
            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap">
              <TextField
                value={subscribeInput}
                onChange={(e) => setSubscribeInput(e.target.value)}
                placeholder="branch:<id> or business:<id>"
                size="small"
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 280 } }}
              />
              <Button variant="contained" onClick={onSubscribe}>
                Subscribe
              </Button>
              <Button variant="outlined" onClick={() => ws.ping()}>
                Ping
              </Button>
            </Stack>
            {ws.subscribedChannels.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No active subscriptions (default channels are server-side).
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {ws.subscribedChannels.map((channel) => (
                  <Chip
                    key={channel}
                    label={channel}
                    onDelete={() => onUnsubscribe(channel)}
                    size="small"
                  />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Order demo
            </Typography>
            <Stack direction="row" spacing={1} mb={2} flexWrap="wrap" useFlexGap>
              <TextField
                label="branchId"
                size="small"
                value={orderForm.branchId}
                onChange={(e) => setOrderForm({ ...orderForm, branchId: e.target.value })}
                placeholder="branch id"
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 220 } }}
              />
              <TextField
                label="product"
                size="small"
                value={orderForm.productName}
                onChange={(e) => setOrderForm({ ...orderForm, productName: e.target.value })}
                sx={{ flex: 1, minWidth: { xs: '100%', sm: 200 } }}
              />
              <TextField
                label="unitPrice"
                size="small"
                value={orderForm.unitPrice}
                onChange={(e) => setOrderForm({ ...orderForm, unitPrice: e.target.value })}
                sx={{ width: { xs: '48%', sm: 120 } }}
              />
              <TextField
                label="qty"
                size="small"
                value={orderForm.quantity}
                onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
                sx={{ width: { xs: '48%', sm: 90 } }}
              />
            </Stack>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="contained" onClick={onCreateOrder}>
                Create order
              </Button>
              <Button variant="outlined" onClick={onMarkCompleted} disabled={!lastOrder}>
                PATCH status → completed
              </Button>
            </Stack>
            {lastOrder && (
              <Typography variant="body2" sx={{ mt: 2 }}>
                Last order: <code>{lastOrder._id}</code> · {lastOrder.orderNumber} · status{' '}
                <Chip label={lastOrder.status} size="small" variant="outlined" />
              </Typography>
            )}
            {apiError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {apiError}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Messages{' '}
              <Typography component="span" variant="caption" color="text.secondary">
                (latest {MAX_MESSAGES})
              </Typography>
            </Typography>
            {messages.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No messages yet.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Received</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Channel</TableCell>
                      <TableCell>Payload</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {messages.map((entry, idx) => (
                      <TableRow key={`${entry.receivedAt}-${idx}`}>
                        <TableCell>{entry.receivedAt}</TableCell>
                        <TableCell>
                          <code>{entry.message.type}</code>
                        </TableCell>
                        <TableCell>
                          <code>{entry.message.channel ?? '-'}</code>
                        </TableCell>
                        <TableCell>
                          <code>{JSON.stringify(entry.message.payload)}</code>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      </Stack>
    </>
  );
}
