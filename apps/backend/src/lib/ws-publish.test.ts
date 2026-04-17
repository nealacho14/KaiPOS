import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishToChannel, publishToUser, __setManagementClientForTests } from './ws-publish.js';

const { mockGetConnectionsForChannel, mockRemoveChannel, mockManagementSend } = vi.hoisted(() => ({
  mockGetConnectionsForChannel: vi.fn(),
  mockRemoveChannel: vi.fn(),
  mockManagementSend: vi.fn(),
}));

vi.mock('./ws-connections.js', () => ({
  getConnectionsForChannel: mockGetConnectionsForChannel,
  removeChannel: mockRemoveChannel,
}));

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => {
  class ApiGatewayManagementApiClient {
    send = mockManagementSend;
  }
  class PostToConnectionCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GoneException extends Error {
    name = 'GoneException';
    constructor() {
      super('Gone');
    }
  }
  return { ApiGatewayManagementApiClient, PostToConnectionCommand, GoneException };
});

vi.mock('./logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
  }),
}));

function decodeSent(callIndex: number): { type: string; channel: unknown; payload: unknown } {
  const cmd = mockManagementSend.mock.calls[callIndex][0] as { input: { Data: Buffer } };
  return JSON.parse(cmd.input.Data.toString('utf8'));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WS_API_ENDPOINT = 'https://example.execute-api.us-east-1.amazonaws.com/prod';
  __setManagementClientForTests({
    send: mockManagementSend,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe('ws-publish', () => {
  describe('publishToChannel', () => {
    it('returns zeros when no connections are subscribed', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([]);

      const result = await publishToChannel('branch:br-1', {
        type: 'order.status-changed',
        payload: { orderId: 'o-1' },
      });

      expect(result).toEqual({ targets: 0, delivered: 0, stale: 0, failed: 0 });
      expect(mockManagementSend).not.toHaveBeenCalled();
    });

    it('fans out a message to every subscribed connection with the envelope shape', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([
        { connectionId: 'c-1', userId: 'u-1' },
        { connectionId: 'c-2', userId: 'u-2' },
      ]);
      mockManagementSend.mockResolvedValue({});

      const result = await publishToChannel('branch:br-1', {
        type: 'order.status-changed',
        payload: { orderId: 'o-1', status: 'completed' },
      });

      expect(result).toEqual({ targets: 2, delivered: 2, stale: 0, failed: 0 });
      expect(mockManagementSend).toHaveBeenCalledTimes(2);

      const sent = decodeSent(0);
      expect(sent).toEqual({
        type: 'order.status-changed',
        channel: 'branch:br-1',
        payload: { orderId: 'o-1', status: 'completed' },
        v: 1,
      });
    });

    it('cleans up stale DDB rows when PostToConnection throws GoneException', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([
        { connectionId: 'c-alive', userId: 'u-1' },
        { connectionId: 'c-gone', userId: 'u-2' },
      ]);
      const goneErr = Object.assign(new Error('gone'), { name: 'GoneException' });
      mockManagementSend.mockImplementation((cmd: { input: { ConnectionId: string } }) => {
        if (cmd.input.ConnectionId === 'c-gone') {
          return Promise.reject(goneErr);
        }
        return Promise.resolve({});
      });

      const result = await publishToChannel('branch:br-1', {
        type: 'order.status-changed',
        payload: {},
      });

      expect(result).toEqual({ targets: 2, delivered: 1, stale: 1, failed: 0 });
      expect(mockRemoveChannel).toHaveBeenCalledWith('c-gone', 'branch:br-1');
      expect(mockRemoveChannel).not.toHaveBeenCalledWith('c-alive', expect.anything());
    });

    it('counts non-Gone errors as failed and does not clean them up', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([{ connectionId: 'c-err', userId: 'u-1' }]);
      mockManagementSend.mockRejectedValue(new Error('boom'));

      const result = await publishToChannel('branch:br-1', {
        type: 'noop',
        payload: {},
      });

      expect(result).toEqual({ targets: 1, delivered: 0, stale: 0, failed: 1 });
      expect(mockRemoveChannel).not.toHaveBeenCalled();
    });

    it('still reports stale even if the cleanup delete fails', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([{ connectionId: 'c-gone', userId: 'u-1' }]);
      mockManagementSend.mockRejectedValue(
        Object.assign(new Error('gone'), { name: 'GoneException' }),
      );
      mockRemoveChannel.mockRejectedValue(new Error('ddb down'));

      const result = await publishToChannel('branch:br-1', {
        type: 'noop',
        payload: {},
      });

      expect(result.stale).toBe(1);
      expect(result.delivered).toBe(0);
    });
  });

  describe('publishToUser', () => {
    it('delegates to the user:<id> channel', async () => {
      mockGetConnectionsForChannel.mockResolvedValue([{ connectionId: 'c-a', userId: 'u-42' }]);
      mockManagementSend.mockResolvedValue({});

      const result = await publishToUser('u-42', { type: 'notify', payload: { n: 1 } });

      expect(mockGetConnectionsForChannel).toHaveBeenCalledWith('user:u-42');
      expect(result.delivered).toBe(1);

      const sent = decodeSent(0);
      expect(sent.channel).toBe('user:u-42');
      expect(sent.type).toBe('notify');
    });
  });
});
