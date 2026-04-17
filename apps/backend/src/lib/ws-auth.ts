import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import type { TokenPayload } from '@kaipos/shared/types';
import { verifyAccessToken } from './jwt.js';
import { createLogger } from './logger.js';

const log = createLogger({ module: 'ws-auth' });

type ConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string | undefined> | null;
};

/**
 * Validates a WebSocket `$connect` event by verifying the JWT passed as
 * `?token=<access_token>`. WS traffic bypasses CloudFront (clients connect
 * directly to API Gateway) and browsers cannot set custom headers on
 * `new WebSocket(...)`, so the `x-origin-verify` shared-secret check used
 * on the HTTP API has no delivery path here. Handshake security relies on
 * the signed JWT + mandatory TLS — the standard pattern for browser-facing
 * WebSocket endpoints (Slack, Discord, Linear, etc.).
 *
 * Returns the decoded `TokenPayload` on success, or `null` on any failure.
 * The handler MUST reject the handshake with a non-2xx status when this
 * returns `null` — API Gateway then drops the connection before
 * `$disconnect` is invoked.
 */
export async function authenticateConnectEvent(event: ConnectEvent): Promise<TokenPayload | null> {
  const token = event.queryStringParameters?.token;
  if (!token) {
    log.warn('ws-auth: missing token query param');
    return null;
  }

  try {
    return await verifyAccessToken(token);
  } catch (err) {
    log.warn({ err }, 'ws-auth: token verification failed');
    return null;
  }
}
