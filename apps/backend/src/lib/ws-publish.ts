import {
  ApiGatewayManagementApiClient,
  GoneException,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';
import {
  channelFor,
  WS_MESSAGE_VERSION,
  type WSChannel,
  type WSMessage,
} from '@kaipos/shared/types';
import { createLogger } from './logger.js';
import {
  getConnectionsForChannel,
  removeChannel,
  type ChannelProjection,
} from './ws-connections.js';

const log = createLogger({ module: 'ws-publish' });

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

// Test-only hook mirroring the pattern used in ws-connections / ws-default.
export function __setManagementClientForTests(client: ApiGatewayManagementApiClient | null): void {
  cachedManagementClient = client;
}

export interface PublishResult {
  targets: number;
  delivered: number;
  stale: number;
  failed: number;
}

async function postOrCleanup(
  connection: ChannelProjection,
  channel: WSChannel,
  body: Uint8Array,
): Promise<'delivered' | 'stale' | 'failed'> {
  try {
    await getManagementClient().send(
      new PostToConnectionCommand({
        ConnectionId: connection.connectionId,
        Data: body,
      }),
    );
    return 'delivered';
  } catch (err) {
    // API GW returns 410 GoneException once the client has disconnected. That's
    // not an error — it means DDB has a stale row, so clean it up and move on.
    if (err instanceof GoneException || (err as { name?: string })?.name === 'GoneException') {
      log.debug(
        { connectionId: connection.connectionId, channel },
        'ws-publish: stale connection, removing row',
      );
      try {
        await removeChannel(connection.connectionId, channel);
      } catch (cleanupErr) {
        log.warn(
          { err: cleanupErr, connectionId: connection.connectionId, channel },
          'ws-publish: failed to remove stale connection row',
        );
      }
      return 'stale';
    }
    log.warn(
      { err, connectionId: connection.connectionId, channel },
      'ws-publish: PostToConnection failed',
    );
    return 'failed';
  }
}

function buildEnvelope<T>(type: string, channel: WSChannel | null, payload: T): WSMessage<T> {
  return { type, channel, payload, v: WS_MESSAGE_VERSION };
}

/**
 * Fan-out a message to every live connection subscribed to `channel`.
 *
 * Uses `Promise.allSettled` so a single slow/broken client cannot delay the
 * others. Stale connections (GoneException / 410) are cleaned up inline so DDB
 * converges without a separate sweeper.
 */
export async function publishToChannel<T>(
  channel: WSChannel,
  message: { type: string; payload: T },
): Promise<PublishResult> {
  const targets = await getConnectionsForChannel(channel);
  if (targets.length === 0) {
    return { targets: 0, delivered: 0, stale: 0, failed: 0 };
  }

  const envelope = buildEnvelope(message.type, channel, message.payload);
  const body = Buffer.from(JSON.stringify(envelope));

  const results = await Promise.allSettled(
    targets.map((conn) => postOrCleanup(conn, channel, body)),
  );

  let delivered = 0;
  let stale = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === 'fulfilled') {
      if (result.value === 'delivered') delivered++;
      else if (result.value === 'stale') stale++;
      else failed++;
    } else {
      failed++;
    }
  }

  log.info(
    { channel, type: message.type, targets: targets.length, delivered, stale, failed },
    'ws-publish: channel fan-out',
  );

  return { targets: targets.length, delivered, stale, failed };
}

/**
 * DM every live connection for a single user (multi-device fan-in). This just
 * delegates to `publishToChannel` on the `user:<id>` default channel, which is
 * materialized for every authenticated connection at `$connect`.
 */
export async function publishToUser<T>(
  userId: string,
  message: { type: string; payload: T },
): Promise<PublishResult> {
  return publishToChannel(channelFor.user(userId), message);
}
