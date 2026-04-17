import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  Callback,
  Context,
} from 'aws-lambda';
import { handler } from './ws-disconnect.js';

const { mockRemoveConnection } = vi.hoisted(() => ({
  mockRemoveConnection: vi.fn(),
}));

vi.mock('../lib/ws-connections.js', () => ({
  removeConnection: mockRemoveConnection,
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function makeEvent(): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      connectionId: 'conn-1',
      eventType: 'DISCONNECT',
      routeKey: '$disconnect',
    },
    headers: {},
    body: null,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

async function run(): Promise<{ statusCode: number }> {
  const ctx = {} as Context;
  const cb = (() => undefined) as unknown as Callback<APIGatewayProxyResultV2>;
  const res = await handler(makeEvent(), ctx, cb);
  if (!res || typeof res === 'string' || !('statusCode' in res)) {
    throw new Error('handler returned unexpected shape');
  }
  return { statusCode: res.statusCode ?? 0 };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ws-disconnect handler', () => {
  it('calls removeConnection with the connectionId', async () => {
    mockRemoveConnection.mockResolvedValueOnce(undefined);

    const res = await run();

    expect(res.statusCode).toBe(200);
    expect(mockRemoveConnection).toHaveBeenCalledWith('conn-1');
  });

  it('swallows errors — API Gateway cannot retry $disconnect', async () => {
    mockRemoveConnection.mockRejectedValueOnce(new Error('ddb down'));

    const res = await run();

    expect(res.statusCode).toBe(200);
  });
});
