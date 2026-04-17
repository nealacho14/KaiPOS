import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';

// Stub: Phase 2 deploys the infrastructure without auth/channel logic.
// Phase 3 replaces this with JWT validation, origin-verify, and DDB writes.
export const handler: APIGatewayProxyWebsocketHandlerV2 = async () => ({
  statusCode: 200,
  body: 'ok',
});
