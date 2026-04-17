import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { channelFor, type WSChannel } from '@kaipos/shared/types';
import { createLogger } from '../lib/logger.js';
import { SUPER_ADMIN_BUSINESS_ID } from '../lib/permissions.js';
import { addConnection } from '../lib/ws-connections.js';
import { authenticateConnectEvent } from '../lib/ws-auth.js';

const log = createLogger({ module: 'ws-connect' });

/**
 * Default channels materialized at `$connect`:
 * - Every user: `user:<id>` (direct messages, multi-device fan-in).
 * - Tenant users: `business:<id>` + one `branch:<biz>:<branchId>` per
 *   `branchIds` entry. Branch channels are tenant-scoped (`<biz>` prefix) so
 *   two businesses with the same branchId never collide on a shared channel.
 * - Super_admin: only `user:<id>` — they must explicitly `subscribe business:<id>`
 *   via `$default` to observe a tenant. This keeps "observer" access opt-in and
 *   auditable even though they have platform-wide permission.
 */
function defaultChannelsFor(payload: {
  userId: string;
  businessId: string;
  role: string;
  branchIds?: string[];
}): WSChannel[] {
  const channels: WSChannel[] = [channelFor.user(payload.userId)];
  if (payload.businessId === SUPER_ADMIN_BUSINESS_ID) return channels;

  channels.push(channelFor.business(payload.businessId));
  for (const branchId of payload.branchIds ?? []) {
    channels.push(channelFor.branch(payload.businessId, branchId));
  }
  return channels;
}

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  const token = await authenticateConnectEvent(event);
  if (!token) {
    log.warn({ connectionId }, 'ws-connect: handshake rejected');
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const reqLog = log.child({
    connectionId,
    userId: token.userId,
    businessId: token.businessId,
    role: token.role,
  });

  const channels = defaultChannelsFor(token);

  try {
    await addConnection(connectionId, token, channels);
  } catch (err) {
    reqLog.error({ err }, 'ws-connect: failed to persist connection');
    return { statusCode: 500, body: 'Internal error' };
  }

  reqLog.info({ channels }, 'ws-connect: handshake accepted');
  return { statusCode: 200, body: 'ok' };
};
