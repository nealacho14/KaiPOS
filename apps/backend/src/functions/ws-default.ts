import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyWebsocketHandlerV2,
} from 'aws-lambda';
import {
  ApiGatewayManagementApiClient,
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
import { createWsRequestLogger } from '../lib/lambda-runtime.js';
import { SUPER_ADMIN_BUSINESS_ID } from '../lib/permissions.js';
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
