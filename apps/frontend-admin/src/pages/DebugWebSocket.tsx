import type { ApiResponse, Order, WSChannel, WSMessage } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
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
import { useCallback, useEffect, useMemo, useState } from 'react';
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

type WsStatus = ReturnType<typeof useWebSocket>['status'];

function statusColor(status: WsStatus): 'default' | 'success' | 'warning' {
  switch (status) {
    case 'open':
      return 'success';
    case 'connecting':
    case 'reconnecting':
      return 'warning';
    default:
      return 'default';
  }
}

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

  const onDisconnect = () => ws.disconnect();

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

  const onUnsubscribe = (channel: WSChannel) => ws.unsubscribe(channel);

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

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Debug · WebSocket
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Connect with a JWT access token and observe messages fanned out to your channels. The
        endpoint defaults to <code>VITE_WS_ENDPOINT</code>.
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Connection
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Endpoint"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
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
              <Button variant="text" onClick={onForget}>
                Forget token
              </Button>
              <Box sx={{ flexGrow: 1 }} />
              <Chip
                label={`status: ${ws.status}`}
                size="small"
                color={statusColor(ws.status)}
                variant="outlined"
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
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
              sx={{ minWidth: 280 }}
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

      <Card sx={{ mb: 2 }}>
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
              sx={{ minWidth: 220 }}
            />
            <TextField
              label="product"
              size="small"
              value={orderForm.productName}
              onChange={(e) => setOrderForm({ ...orderForm, productName: e.target.value })}
              sx={{ minWidth: 200 }}
            />
            <TextField
              label="unitPrice"
              size="small"
              value={orderForm.unitPrice}
              onChange={(e) => setOrderForm({ ...orderForm, unitPrice: e.target.value })}
              sx={{ width: 120 }}
            />
            <TextField
              label="qty"
              size="small"
              value={orderForm.quantity}
              onChange={(e) => setOrderForm({ ...orderForm, quantity: e.target.value })}
              sx={{ width: 90 }}
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
    </Container>
  );
}
