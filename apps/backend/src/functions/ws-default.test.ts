import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  APIGatewayProxyWebsocketEventV2,
  APIGatewayProxyResultV2,
  Callback,
  Context,
} from 'aws-lambda';
import { handler, __setManagementClientForTests } from './ws-default.js';

const { mockGetConnectionContext, mockAddChannel, mockRemoveChannel, mockManagementSend } =
  vi.hoisted(() => ({
    mockGetConnectionContext: vi.fn(),
    mockAddChannel: vi.fn(),
    mockRemoveChannel: vi.fn(),
    mockManagementSend: vi.fn(),
  }));

vi.mock('../lib/ws-connections.js', () => ({
  getConnectionContext: mockGetConnectionContext,
  addChannel: mockAddChannel,
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
  return { ApiGatewayManagementApiClient, PostToConnectionCommand };
});

vi.mock('../lib/logger.js', () => ({
  createLogger: () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: () => logger,
    };
    return logger;
  },
}));

function makeEvent(body: unknown): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      connectionId: 'conn-1',
      eventType: 'MESSAGE',
      routeKey: '$default',
    },
    headers: {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
    isBase64Encoded: false,
    // Minimal shape — the handler only reads body + requestContext.connectionId.
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

async function run(event: APIGatewayProxyWebsocketEventV2): Promise<{ statusCode: number }> {
  const ctx = {} as Context;
  const cb = (() => undefined) as unknown as Callback<APIGatewayProxyResultV2>;
  const res = await handler(event, ctx, cb);
  if (!res || typeof res === 'string' || !('statusCode' in res)) {
    throw new Error('handler returned unexpected shape');
  }
  return { statusCode: res.statusCode ?? 0 };
}

function decodeSentMessage(callIndex = 0): { type: string; channel: unknown; payload: unknown } {
  const cmd = mockManagementSend.mock.calls[callIndex][0] as { input: { Data: Buffer } };
  return JSON.parse(cmd.input.Data.toString('utf8'));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.WS_API_ENDPOINT = 'https://example.execute-api.us-east-1.amazonaws.com/prod';
  mockManagementSend.mockResolvedValue({});
  mockAddChannel.mockResolvedValue(undefined);
  mockRemoveChannel.mockResolvedValue(undefined);
  __setManagementClientForTests({
    send: mockManagementSend,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe('ws-default handler', () => {
  describe('malformed input', () => {
    it('returns 400 and notifies client when body is not JSON', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent('not-json'));

      expect(res.statusCode).toBe(400);
      const sent = decodeSentMessage();
      expect(sent.type).toBe('error');
    });

    it('returns 400 for unknown message type', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'nonsense' }));

      expect(res.statusCode).toBe(400);
    });
  });

  describe('no context', () => {
    it('returns 403 when connection has no DDB rows (auth-rejected)', async () => {
      mockGetConnectionContext.mockResolvedValue(null);

      const res = await run(makeEvent({ type: 'subscribe', channel: 'branch:br-1' }));

      expect(res.statusCode).toBe(403);
      expect(mockAddChannel).not.toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('responds with pong DM', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'ping' }));

      expect(res.statusCode).toBe(200);
      const sent = decodeSentMessage();
      expect(sent.type).toBe('pong');
    });
  });

  describe('subscribe', () => {
    it('writes the channel and sends an ack when the policy allows it', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'table:t-1' }));

      expect(res.statusCode).toBe(200);
      expect(mockAddChannel).toHaveBeenCalledWith(
        'conn-1',
        'table:t-1',
        expect.objectContaining({ userId: 'u-1' }),
      );

      const ack = decodeSentMessage();
      expect(ack.type).toBe('subscribe.ack');
      expect(ack.channel).toBe('table:t-1');
    });

    it('denies cross-tenant branch subscribe', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'branch:br-foreign' }));

      expect(res.statusCode).toBe(403);
      expect(mockAddChannel).not.toHaveBeenCalled();
      const denied = decodeSentMessage();
      expect(denied.type).toBe('subscribe.denied');
    });

    it('denies cross-tenant business subscribe for non-super_admin', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'manager',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'business:biz-2' }));

      expect(res.statusCode).toBe(403);
      expect(mockAddChannel).not.toHaveBeenCalled();
    });

    it('allows super_admin to subscribe to any business (opt-in observer)', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'sa-1',
        businessId: '*',
        role: 'super_admin',
        branchIds: [],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'business:biz-x' }));

      expect(res.statusCode).toBe(200);
      expect(mockAddChannel).toHaveBeenCalledWith(
        'conn-1',
        'business:biz-x',
        expect.objectContaining({ role: 'super_admin' }),
      );
    });

    it('rejects super_admin trying to subscribe to the sentinel business', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'sa-1',
        businessId: '*',
        role: 'super_admin',
        branchIds: [],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'business:*' }));

      expect(res.statusCode).toBe(403);
      expect(mockAddChannel).not.toHaveBeenCalled();
    });

    it('allows subscribe to own user:<id>', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'user:u-1' }));

      expect(res.statusCode).toBe(200);
    });

    it('rejects subscribe to another user:<id>', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'subscribe', channel: 'user:u-2' }));

      expect(res.statusCode).toBe(403);
    });
  });

  describe('unsubscribe', () => {
    it('removes the channel and sends an ack', async () => {
      mockGetConnectionContext.mockResolvedValue({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier',
        branchIds: ['br-1'],
      });

      const res = await run(makeEvent({ type: 'unsubscribe', channel: 'table:t-1' }));

      expect(res.statusCode).toBe(200);
      expect(mockRemoveChannel).toHaveBeenCalledWith('conn-1', 'table:t-1');

      const ack = decodeSentMessage();
      expect(ack.type).toBe('unsubscribe.ack');
      expect(ack.channel).toBe('table:t-1');
    });
  });
});
