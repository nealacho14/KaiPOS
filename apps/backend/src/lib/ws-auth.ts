import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import type { TokenPayload } from '@kaipos/shared/types';
import { verifyAccessToken } from './jwt.js';
import { createLogger } from './logger.js';

const log = createLogger({ module: 'ws-auth' });

type ConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string | undefined> | null;
  headers?: Record<string, string | undefined> | null;
};

function getHeader(
  headers: Record<string, string | undefined> | null | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

/**
 * Validates a WebSocket `$connect` event:
 * - Enforces the CloudFront shared-secret header when `CLOUDFRONT_SECRET` is set (prod).
 * - Extracts the JWT from `?token=...` and verifies it with the same secret/alg as the HTTP API.
 *
 * Returns the decoded `TokenPayload` on success, or `null` on any failure. The handler MUST
 * reject the handshake with a non-2xx status when this returns `null` — API Gateway then
 * drops the connection before `$disconnect` is invoked.
 */
export async function authenticateConnectEvent(event: ConnectEvent): Promise<TokenPayload | null> {
  const cloudfrontSecret = process.env.CLOUDFRONT_SECRET;
  if (cloudfrontSecret) {
    const header = getHeader(event.headers, 'x-origin-verify');
    if (header !== cloudfrontSecret) {
      log.warn('ws-auth: origin verification failed');
      return null;
    }
  }

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
