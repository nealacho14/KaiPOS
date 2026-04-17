import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TokenPayload, WSChannel } from '@kaipos/shared/types';
import type {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  __setDocClientForTests,
  addChannel,
  addConnection,
  getChannelsForConnection,
  getConnectionContext,
  getConnectionsForChannel,
  removeChannel,
  removeConnection,
  CONNECTION_TTL_SECONDS,
} from './ws-connections.js';

type Command = BatchWriteCommand | DeleteCommand | PutCommand | QueryCommand;

interface StubClient {
  send: ReturnType<typeof vi.fn>;
}

interface BatchWriteSequenceEntry {
  unprocessed: unknown[];
}

interface MakeClientOptions {
  queryResults?: Record<string, unknown[][]>;
  // Responses returned from successive BatchWriteCommand calls. Each entry lists
  // the items to surface back as UnprocessedItems (empty array = all processed).
  batchWriteResponses?: BatchWriteSequenceEntry[];
}

function makeClient(options: MakeClientOptions = {}): StubClient {
  const { queryResults = {}, batchWriteResponses } = options;
  const queryCallsByKey: Record<string, number> = {};
  let batchWriteCallIndex = 0;

  const send = vi.fn(async (cmd: Command) => {
    const name = cmd.constructor.name;
    if (name === 'QueryCommand') {
      const q = cmd as QueryCommand;
      const key = q.input.IndexName ?? 'primary';
      queryCallsByKey[key] = (queryCallsByKey[key] ?? 0) + 1;
      const results = queryResults[key] ?? [[]];
      const idx = Math.min(queryCallsByKey[key] - 1, results.length - 1);
      return { Items: results[idx] };
    }
    if (name === 'BatchWriteCommand' && batchWriteResponses) {
      const b = cmd as BatchWriteCommand;
      const tableName = Object.keys(b.input.RequestItems ?? {})[0] ?? '';
      const entry =
        batchWriteResponses[Math.min(batchWriteCallIndex, batchWriteResponses.length - 1)];
      batchWriteCallIndex += 1;
      if (entry && entry.unprocessed.length > 0) {
        return { UnprocessedItems: { [tableName]: entry.unprocessed } };
      }
    }
    return {};
  });

  return { send };
}

const token: TokenPayload = {
  userId: 'u-1',
  businessId: 'biz-1',
  role: 'manager',
  branchIds: ['br-1', 'br-2'],
};

beforeEach(() => {
  process.env.CONNECTIONS_TABLE_NAME = 'kaipos-ws-connections-test';
  __setDocClientForTests(null);
});

describe('ws-connections', () => {
  describe('addConnection', () => {
    it('writes one item per channel with ttl and user fields', async () => {
      const client = makeClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const channels: WSChannel[] = ['user:u-1', 'business:biz-1', 'branch:br-1'];
      const before = Math.floor(Date.now() / 1000);
      await addConnection('conn-1', token, channels);
      const after = Math.floor(Date.now() / 1000);

      expect(client.send).toHaveBeenCalledTimes(1);
      const call = client.send.mock.calls[0][0] as BatchWriteCommand;
      const requests = call.input.RequestItems!['kaipos-ws-connections-test'];
      expect(requests).toHaveLength(3);

      for (let i = 0; i < 3; i += 1) {
        const item = requests[i].PutRequest!.Item!;
        expect(item.connectionId).toBe('conn-1');
        expect(item.channel).toBe(channels[i]);
        expect(item.userId).toBe('u-1');
        expect(item.businessId).toBe('biz-1');
        expect(item.role).toBe('manager');
        expect(item.ttl).toBeGreaterThanOrEqual(before + CONNECTION_TTL_SECONDS);
        expect(item.ttl).toBeLessThanOrEqual(after + CONNECTION_TTL_SECONDS);
      }
    });

    it('chunks batches larger than 25 items', async () => {
      const client = makeClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const channels = Array.from({ length: 27 }, (_, i) => `branch:br-${i}` as WSChannel);
      await addConnection('conn-1', { ...token, branchIds: undefined }, channels);

      expect(client.send).toHaveBeenCalledTimes(2);
      const first = client.send.mock.calls[0][0] as BatchWriteCommand;
      const second = client.send.mock.calls[1][0] as BatchWriteCommand;
      expect(first.input.RequestItems!['kaipos-ws-connections-test']).toHaveLength(25);
      expect(second.input.RequestItems!['kaipos-ws-connections-test']).toHaveLength(2);
    });

    it('is a no-op when the channel list is empty', async () => {
      const client = makeClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await addConnection('conn-1', token, []);
      expect(client.send).not.toHaveBeenCalled();
    });

    it('retries UnprocessedItems and succeeds when DDB eventually drains them', async () => {
      const unprocessed = [
        { PutRequest: { Item: { connectionId: 'conn-1', channel: 'user:u-1' } } },
      ];
      const client = makeClient({
        batchWriteResponses: [{ unprocessed }, { unprocessed: [] }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await addConnection('conn-1', token, ['user:u-1']);
      expect(client.send).toHaveBeenCalledTimes(2);
    });

    it('throws when UnprocessedItems persist past the retry budget', async () => {
      const unprocessed = [
        { PutRequest: { Item: { connectionId: 'conn-1', channel: 'user:u-1' } } },
      ];
      // Budget is MAX_RETRIES + 1 = 4 attempts, all returning unprocessed.
      const client = makeClient({
        batchWriteResponses: Array.from({ length: 4 }, () => ({ unprocessed })),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await expect(addConnection('conn-1', token, ['user:u-1'])).rejects.toThrow(
        /unprocessed item/i,
      );
      expect(client.send).toHaveBeenCalledTimes(4);
    });
  });

  describe('addChannel / removeChannel', () => {
    it('addChannel issues a single PutCommand', async () => {
      const client = makeClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await addChannel('conn-1', 'branch:br-1', token);
      expect(client.send).toHaveBeenCalledTimes(1);
      const cmd = client.send.mock.calls[0][0] as PutCommand;
      expect(cmd.constructor.name).toBe('PutCommand');
      expect(cmd.input.Item).toMatchObject({
        connectionId: 'conn-1',
        channel: 'branch:br-1',
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'manager',
      });
    });

    it('removeChannel issues a single DeleteCommand', async () => {
      const client = makeClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await removeChannel('conn-1', 'branch:br-1');
      expect(client.send).toHaveBeenCalledTimes(1);
      const cmd = client.send.mock.calls[0][0] as DeleteCommand;
      expect(cmd.constructor.name).toBe('DeleteCommand');
      expect(cmd.input.Key).toEqual({ connectionId: 'conn-1', channel: 'branch:br-1' });
    });
  });

  describe('getChannelsForConnection', () => {
    it('returns every channel row for the connection', async () => {
      const client = makeClient({
        queryResults: { primary: [[{ channel: 'user:u-1' }, { channel: 'branch:br-1' }]] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const out = await getChannelsForConnection('conn-1');
      expect(out).toEqual(['user:u-1', 'branch:br-1']);
    });
  });

  describe('getConnectionContext', () => {
    it('reconstructs identity and branchIds from rows', async () => {
      const client = makeClient({
        queryResults: {
          primary: [
            [
              {
                channel: 'user:u-1',
                userId: 'u-1',
                businessId: 'biz-1',
                role: 'manager',
              },
              {
                channel: 'business:biz-1',
                userId: 'u-1',
                businessId: 'biz-1',
                role: 'manager',
              },
              {
                channel: 'branch:biz-1:br-1',
                userId: 'u-1',
                businessId: 'biz-1',
                role: 'manager',
              },
              {
                channel: 'branch:biz-1:br-2',
                userId: 'u-1',
                businessId: 'biz-1',
                role: 'manager',
              },
            ],
          ],
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const ctx = await getConnectionContext('conn-1');
      expect(ctx).not.toBeNull();
      expect(ctx?.userId).toBe('u-1');
      expect(ctx?.businessId).toBe('biz-1');
      expect(ctx?.role).toBe('manager');
      expect(ctx?.branchIds.sort()).toEqual(['br-1', 'br-2']);
    });

    it('returns null when no rows exist', async () => {
      const client = makeClient({ queryResults: { primary: [[]] } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const ctx = await getConnectionContext('conn-gone');
      expect(ctx).toBeNull();
    });
  });

  describe('getConnectionsForChannel', () => {
    it('queries the GSI and projects connectionId + userId', async () => {
      const client = makeClient({
        queryResults: {
          'channel-index': [
            [
              { connectionId: 'conn-1', userId: 'u-1' },
              { connectionId: 'conn-2', userId: 'u-2' },
            ],
          ],
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      const out = await getConnectionsForChannel('branch:br-1');
      expect(out).toEqual([
        { connectionId: 'conn-1', userId: 'u-1' },
        { connectionId: 'conn-2', userId: 'u-2' },
      ]);

      const cmd = client.send.mock.calls[0][0] as QueryCommand;
      expect(cmd.input.IndexName).toBe('channel-index');
    });
  });

  describe('removeConnection', () => {
    it('deletes every channel row for the connection', async () => {
      const client = makeClient({
        queryResults: { primary: [[{ channel: 'user:u-1' }, { channel: 'branch:br-1' }]] },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await removeConnection('conn-1');

      // 1 query + 1 batch delete
      expect(client.send).toHaveBeenCalledTimes(2);
      const del = client.send.mock.calls[1][0] as BatchWriteCommand;
      const requests = del.input.RequestItems!['kaipos-ws-connections-test'];
      expect(requests).toHaveLength(2);
      expect(requests[0].DeleteRequest?.Key).toEqual({
        connectionId: 'conn-1',
        channel: 'user:u-1',
      });
      expect(requests[1].DeleteRequest?.Key).toEqual({
        connectionId: 'conn-1',
        channel: 'branch:br-1',
      });
    });

    it('is a no-op when no rows exist', async () => {
      const client = makeClient({ queryResults: { primary: [[]] } });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      __setDocClientForTests(client as any);

      await removeConnection('conn-1');
      // Only the initial query ran.
      expect(client.send).toHaveBeenCalledTimes(1);
    });
  });
});
