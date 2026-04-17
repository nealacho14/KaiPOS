import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { createLogger } from '../lib/logger.js';
import { removeConnection } from '../lib/ws-connections.js';

const log = createLogger({ module: 'ws-disconnect' });

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  try {
    await removeConnection(connectionId);
  } catch (err) {
    // Swallow — $disconnect is best-effort from API Gateway's perspective, and
    // the TTL will garbage-collect stale rows within 2h regardless.
    log.error({ connectionId, err }, 'ws-disconnect: cleanup failed');
    return { statusCode: 200, body: 'ok' };
  }

  log.info({ connectionId }, 'ws-disconnect: cleaned up');
  return { statusCode: 200, body: 'ok' };
};
