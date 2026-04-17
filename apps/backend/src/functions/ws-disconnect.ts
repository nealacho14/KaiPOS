import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { createWsRequestLogger } from '../lib/lambda-runtime.js';
import { removeConnection } from '../lib/ws-connections.js';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const log = createWsRequestLogger(event, 'ws-disconnect');
  const connectionId = event.requestContext.connectionId;

  try {
    await removeConnection(connectionId);
  } catch (err) {
    // Swallow — $disconnect is best-effort from API Gateway's perspective, and
    // the TTL will garbage-collect stale rows within 2h regardless.
    log.error({ err }, 'ws-disconnect: cleanup failed');
    return { statusCode: 200, body: 'ok' };
  }

  log.info('ws-disconnect: cleaned up');
  return { statusCode: 200, body: 'ok' };
};
