import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
  DeleteConnectionCommand,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  canSubscribeTo,
  parseChannel,
  WS_MESSAGE_VERSION,
  type TokenPayload,
  type WSChannel,
  type WSClientRequest,
  type WSMessage,
} from '@kaipos/shared/types';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared/permissions';
import { createWsRequestLogger } from '../lib/lambda-runtime.js';
import {
  addChannel,
  getConnectionContext,
  removeChannel,
  type ConnectionContext,
} from '../lib/ws-connections.js';

let cachedManagementClient: ApiGatewayManagementApiClient | null = null;

function getManagementClient(): ApiGatewayManagementApiClient {
  if (cachedManagementClient) return cachedManagementClient;
  const endpoint = process.env.WS_API_ENDPOINT;
  if (!endpoint) {
    throw new Error('WS_API_ENDPOINT env var is not set');
  }
  cachedManagementClient = new ApiGatewayManagementApiClient({ endpoint });
  return cachedManagementClient;
}

// Test-only hook.
export function __setManagementClientForTests(client: ApiGatewayManagementApiClient | null): void {
  cachedManagementClient = client;
}

// Per-connection message rate limit. In-memory per warm container: with the
// stage throttle capping global rate at ~20 rps, effective concurrency is 1-3
// containers, so a runaway client (like the 2026-05-06 subscribe loop, ~100
// msgs/s from one tab) overwhelmingly lands on the same counter. A DDB
// counter would cost 1 write per message and pollute the connections table
// with a sentinel row — not worth it at this scale; the stage throttle stays
// the authoritative global cap.
const RATE_LIMIT_WINDOW_MS = 60_000;
// Legit clients send <10 msgs/min (a few subscribes per navigation plus the
// odd manual ping); 60 leaves generous headroom while a render-speed loop
// blows through it within the first second.
const RATE_LIMIT_MAX_MESSAGES = 60;

const messageCounters = new Map<string, { windowStart: number; count: number }>();

// Test-only hook.
export function __resetRateLimitForTests(): void {
  messageCounters.clear();
}

function isRateLimited(connectionId: string, now: number): boolean {
  // Opportunistic prune so abandoned connections don't accumulate. The map
  // holds at most one entry per connection this container has seen in the
  // last window — tiny at this scale, but unbounded without this.
  for (const [id, entry] of messageCounters) {
    if (now - entry.windowStart >= 2 * RATE_LIMIT_WINDOW_MS) {
      messageCounters.delete(id);
    }
  }

  const entry = messageCounters.get(connectionId);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    messageCounters.set(connectionId, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX_MESSAGES;
}

function parseBody(body: string | undefined | null): WSClientRequest | null {
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const type = (parsed as { type?: unknown }).type;
    if (type === 'subscribe' || type === 'unsubscribe') {
      const channel = (parsed as { channel?: unknown }).channel;
      if (typeof channel !== 'string') return null;
      return { type, channel: channel as WSChannel };
    }
    if (type === 'ping') return { type };
    return null;
  } catch {
    return null;
  }
}

async function sendToSelf(connectionId: string, message: WSMessage): Promise<void> {
  await getManagementClient().send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    }),
  );
}

/**
 * Token-shaped view of the connection context — `canSubscribeTo` operates on
 * `TokenPayload`, but the context rebuilt from DDB is functionally equivalent
 * (same userId / businessId / role / branchIds) so we reuse the shared policy.
 */
function contextAsToken(ctx: ConnectionContext): TokenPayload {
  return {
    userId: ctx.userId,
    businessId: ctx.businessId,
    role: ctx.role,
    branchIds: ctx.branchIds,
  };
}

/**
 * Super_admin is allowed to subscribe to any `business:<id>` (opt-in observer).
 * `canSubscribeTo` already encodes that, but we still reject the sentinel `*`
 * to avoid accidental fan-out to a non-existent tenant.
 */
function canSubscribe(ctx: ConnectionContext, channel: string): boolean {
  const parsed = parseChannel(channel);
  if (!parsed) return false;

  if (ctx.role === 'super_admin' && parsed.kind === 'business') {
    return parsed.id !== SUPER_ADMIN_BUSINESS_ID;
  }

  return canSubscribeTo(channel, contextAsToken(ctx));
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (
  event: APIGatewayProxyWebsocketEventV2,
) => {
  const reqLog = createWsRequestLogger(event, 'ws-default');
  const connectionId = event.requestContext.connectionId;

  // Checked before any parsing/DDB work so an abusive connection costs as
  // little as possible. On breach the connection is force-closed: API Gateway
  // then fires $disconnect, whose handler removes the DDB rows (and the 2h
  // TTL sweeps anything that slips through).
  if (isRateLimited(connectionId, Date.now())) {
    reqLog.warn(
      { limit: RATE_LIMIT_MAX_MESSAGES, windowMs: RATE_LIMIT_WINDOW_MS },
      'ws-default: rate limit exceeded, disconnecting client',
    );
    try {
      await sendToSelf(connectionId, {
        type: 'error',
        channel: null,
        payload: { message: 'Rate limit exceeded' },
        v: WS_MESSAGE_VERSION,
      });
    } catch {
      // best-effort — the connection may already be gone
    }
    try {
      await getManagementClient().send(new DeleteConnectionCommand({ ConnectionId: connectionId }));
    } catch (err) {
      reqLog.warn({ err }, 'ws-default: failed to force-close rate-limited connection');
    }
    return { statusCode: 429, body: 'Too many requests' };
  }

  const parsed = parseBody(event.body);
  if (!parsed) {
    reqLog.warn('ws-default: malformed payload');
    try {
      await sendToSelf(connectionId, {
        type: 'error',
        channel: null,
        payload: { message: 'Invalid message format' },
        v: WS_MESSAGE_VERSION,
      });
    } catch (err) {
      reqLog.warn({ err }, 'ws-default: failed to notify client of bad payload');
    }
    return { statusCode: 400, body: 'Bad request' };
  }

  const ctx = await getConnectionContext(connectionId);
  if (!ctx) {
    reqLog.warn('ws-default: no context for connection');
    return { statusCode: 403, body: 'Forbidden' };
  }

  const identifiedLog = reqLog.child({
    userId: ctx.userId,
    businessId: ctx.businessId,
    role: ctx.role,
  });

  try {
    if (parsed.type === 'ping') {
      await sendToSelf(connectionId, {
        type: 'pong',
        channel: null,
        payload: { ts: Date.now() },
        v: WS_MESSAGE_VERSION,
      });
      return { statusCode: 200, body: 'ok' };
    }

    if (parsed.type === 'subscribe') {
      if (!canSubscribe(ctx, parsed.channel)) {
        identifiedLog.warn({ channel: parsed.channel }, 'ws-default: subscribe denied');
        await sendToSelf(connectionId, {
          type: 'subscribe.denied',
          channel: parsed.channel,
          payload: { reason: 'forbidden' },
          v: WS_MESSAGE_VERSION,
        });
        return { statusCode: 403, body: 'Forbidden' };
      }

      await addChannel(connectionId, parsed.channel, contextAsToken(ctx));
      identifiedLog.info({ channel: parsed.channel }, 'ws-default: subscribed');
      await sendToSelf(connectionId, {
        type: 'subscribe.ack',
        channel: parsed.channel,
        payload: {},
        v: WS_MESSAGE_VERSION,
      });
      return { statusCode: 200, body: 'ok' };
    }

    // unsubscribe
    await removeChannel(connectionId, parsed.channel);
    identifiedLog.info({ channel: parsed.channel }, 'ws-default: unsubscribed');
    await sendToSelf(connectionId, {
      type: 'unsubscribe.ack',
      channel: parsed.channel,
      payload: {},
      v: WS_MESSAGE_VERSION,
    });
    return { statusCode: 200, body: 'ok' };
  } catch (err) {
    identifiedLog.error({ err, type: parsed.type }, 'ws-default: handler error');
    return { statusCode: 500, body: 'Internal error' };
  }
};
