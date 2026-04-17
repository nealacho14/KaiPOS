import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import type { Logger } from 'pino';
import { createLogger } from './logger.js';

/**
 * Builds a request-scoped child logger for a WebSocket Lambda invocation.
 *
 * Mirrors the HTTP-side `requestLogger` middleware so every WS log line is
 * correlatable by `requestId` / `connectionId` / `routeKey`, replacing the
 * previous static `createLogger({ module: 'ws-xxx' })` pattern in each
 * handler.
 *
 * Undefined fields from `event.requestContext` are omitted so logs stay
 * clean when API Gateway shapes change or tests build partial events.
 */
export function createWsRequestLogger(
  event: APIGatewayProxyWebsocketEventV2,
  module: string,
): Logger {
  const { requestId, connectionId, routeKey } = event.requestContext ?? {};
  const bindings: Record<string, unknown> = { module };
  if (requestId !== undefined) bindings.requestId = requestId;
  if (connectionId !== undefined) bindings.connectionId = connectionId;
  if (routeKey !== undefined) bindings.routeKey = routeKey;
  return createLogger(bindings);
}
