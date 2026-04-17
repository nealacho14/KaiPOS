import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
  type BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import type { TokenPayload, WSChannel } from '@kaipos/shared/types';

// TTL refreshed on every write. Orphans from abrupt disconnects (no $disconnect) die here.
export const CONNECTION_TTL_SECONDS = 2 * 60 * 60;

// DDB BatchWrite caps at 25 requests per call.
const BATCH_WRITE_LIMIT = 25;

// Retry budget for UnprocessedItems (throttling / partial failure). Small and
// exponentially backed off so we don't stall the Lambda.
const BATCH_WRITE_MAX_RETRIES = 3;
const BATCH_WRITE_BASE_DELAY_MS = 50;

export interface ConnectionItem {
  connectionId: string;
  channel: WSChannel;
  userId: string;
  businessId: string;
  role: TokenPayload['role'];
  ttl: number;
}

export type ChannelProjection = Pick<ConnectionItem, 'connectionId' | 'userId'>;

let cachedDocClient: DynamoDBDocumentClient | null = null;

function getTableName(): string {
  const name = process.env.CONNECTIONS_TABLE_NAME;
  if (!name) {
    throw new Error('CONNECTIONS_TABLE_NAME env var is not set');
  }
  return name;
}

function getDocClient(): DynamoDBDocumentClient {
  if (cachedDocClient) return cachedDocClient;
  const base = new DynamoDBClient({});
  cachedDocClient = DynamoDBDocumentClient.from(base, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return cachedDocClient;
}

// Test-only hook for unit tests to inject a mocked client.
export function __setDocClientForTests(client: DynamoDBDocumentClient | null): void {
  cachedDocClient = client;
}

function nextTtl(): number {
  return Math.floor(Date.now() / 1000) + CONNECTION_TTL_SECONDS;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sends a BatchWrite and retries `UnprocessedItems` with exponential backoff.
 * Throws if any items remain unprocessed after the retry budget is exhausted so
 * the caller can decide whether to abort the connection rather than silently
 * operating with a partial subscription set.
 */
async function sendBatchWithRetry(
  client: DynamoDBDocumentClient,
  table: string,
  requests: NonNullable<BatchWriteCommandInput['RequestItems']>[string],
): Promise<void> {
  let pending = requests;
  for (let attempt = 0; attempt <= BATCH_WRITE_MAX_RETRIES; attempt += 1) {
    const res = await client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
    const unprocessed = res.UnprocessedItems?.[table];
    if (!unprocessed || unprocessed.length === 0) return;
    pending = unprocessed;
    if (attempt < BATCH_WRITE_MAX_RETRIES) {
      await sleep(BATCH_WRITE_BASE_DELAY_MS * 2 ** attempt);
    }
  }
  throw new Error(
    `DynamoDB BatchWrite left ${pending.length} unprocessed item(s) after ${
      BATCH_WRITE_MAX_RETRIES + 1
    } attempts`,
  );
}

/**
 * Writes one row per channel for a freshly connected client. Batched to respect
 * the 25-item cap. Under throttling, `UnprocessedItems` are retried with
 * exponential backoff; if the retry budget is exhausted this throws so the
 * caller can tear down the connection rather than operate with a partial
 * subscription set.
 */
export async function addConnection(
  connectionId: string,
  token: TokenPayload,
  channels: WSChannel[],
): Promise<void> {
  if (channels.length === 0) return;

  const ttl = nextTtl();
  const items = channels.map((channel) => ({
    connectionId,
    channel,
    userId: token.userId,
    businessId: token.businessId,
    role: token.role,
    ttl,
  }));

  const table = getTableName();
  const client = getDocClient();

  for (const batch of chunk(items, BATCH_WRITE_LIMIT)) {
    await sendBatchWithRetry(
      client,
      table,
      batch.map((Item) => ({ PutRequest: { Item } })),
    );
  }
}

export async function addChannel(
  connectionId: string,
  channel: WSChannel,
  token: TokenPayload,
): Promise<void> {
  await getDocClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        connectionId,
        channel,
        userId: token.userId,
        businessId: token.businessId,
        role: token.role,
        ttl: nextTtl(),
      } satisfies ConnectionItem,
    }),
  );
}

export async function removeChannel(connectionId: string, channel: WSChannel): Promise<void> {
  await getDocClient().send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: { connectionId, channel },
    }),
  );
}

/** Fetches every channel row attached to a connection (used on $disconnect). */
export async function getChannelsForConnection(connectionId: string): Promise<WSChannel[]> {
  const out: WSChannel[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await getDocClient().send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'connectionId = :cid',
        ExpressionAttributeValues: { ':cid': connectionId },
        ProjectionExpression: 'channel',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      out.push(item.channel as WSChannel);
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return out;
}

/**
 * Reconstructs the token-like context for a live connection by scanning its
 * rows. `$default` needs this to re-run `canSubscribeTo` without re-validating
 * the JWT on every frame.
 *
 * `branchIds` is derived from the `branch:` rows written at `$connect` — those
 * rows only exist if the original token carried those branch IDs (subscribe to
 * a foreign branch is rejected before a row is written), so this stays faithful
 * to the original token's scope.
 */
export interface ConnectionContext {
  userId: string;
  businessId: string;
  role: TokenPayload['role'];
  branchIds: string[];
}

export async function getConnectionContext(
  connectionId: string,
): Promise<ConnectionContext | null> {
  const out: Array<{
    channel: string;
    userId?: string;
    businessId?: string;
    role?: string;
  }> = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await getDocClient().send(
      new QueryCommand({
        TableName: getTableName(),
        KeyConditionExpression: 'connectionId = :cid',
        ExpressionAttributeValues: { ':cid': connectionId },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      out.push({
        channel: item.channel as string,
        userId: item.userId as string | undefined,
        businessId: item.businessId as string | undefined,
        role: item.role as string | undefined,
      });
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  if (out.length === 0) return null;

  // Any row carries the same identity fields; pick the first that has them populated.
  const identity = out.find((row) => row.userId && row.businessId && row.role);
  if (!identity?.userId || !identity.businessId || !identity.role) return null;

  const branchIds: string[] = [];
  for (const row of out) {
    if (row.channel.startsWith('branch:')) {
      branchIds.push(row.channel.slice('branch:'.length));
    }
  }

  return {
    userId: identity.userId,
    businessId: identity.businessId,
    role: identity.role as TokenPayload['role'],
    branchIds,
  };
}

/**
 * Fan-out lookup: every connection subscribed to `channel`. Uses the GSI
 * (channel-index) so a broadcast is one query + one PostToConnection per row.
 */
export async function getConnectionsForChannel(channel: WSChannel): Promise<ChannelProjection[]> {
  const out: ChannelProjection[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const res = await getDocClient().send(
      new QueryCommand({
        TableName: getTableName(),
        IndexName: 'channel-index',
        KeyConditionExpression: 'channel = :ch',
        ExpressionAttributeValues: { ':ch': channel },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of res.Items ?? []) {
      out.push({
        connectionId: item.connectionId as string,
        userId: item.userId as string,
      });
    }
    exclusiveStartKey = res.LastEvaluatedKey;
  } while (exclusiveStartKey);

  return out;
}

/**
 * Full cleanup for `$disconnect`: looks up every channel row and deletes them
 * in batches of 25. Silent if the connection has no rows (e.g. auth-rejected
 * handshake that never called addConnection).
 */
export async function removeConnection(connectionId: string): Promise<void> {
  const channels = await getChannelsForConnection(connectionId);
  if (channels.length === 0) return;

  const table = getTableName();
  const client = getDocClient();

  for (const batch of chunk(channels, BATCH_WRITE_LIMIT)) {
    await sendBatchWithRetry(
      client,
      table,
      batch.map((channel) => ({
        DeleteRequest: { Key: { connectionId, channel } },
      })),
    );
  }
}
