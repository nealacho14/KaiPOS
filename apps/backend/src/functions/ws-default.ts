import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';

// Stub: Phase 3 replaces this with subscribe/unsubscribe/ping routing.
export const handler: APIGatewayProxyWebsocketHandlerV2 = async () => ({
  statusCode: 200,
  body: 'ok',
});
