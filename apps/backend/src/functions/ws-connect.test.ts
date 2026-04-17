import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyWebsocketEventV2,
  Callback,
  Context,
} from 'aws-lambda';
import type { TokenPayload } from '@kaipos/shared/types';
import { handler } from './ws-connect.js';

const { mockAuthenticate, mockAddConnection } = vi.hoisted(() => ({
  mockAuthenticate: vi.fn(),
  mockAddConnection: vi.fn(),
}));

vi.mock('../lib/ws-auth.js', () => ({
  authenticateConnectEvent: mockAuthenticate,
}));

vi.mock('../lib/ws-connections.js', () => ({
  addConnection: mockAddConnection,
}));

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

function makeEvent(): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      connectionId: 'conn-1',
      eventType: 'CONNECT',
      routeKey: '$connect',
    },
    queryStringParameters: { token: 'any' },
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
  mockAddConnection.mockResolvedValue(undefined);
});

describe('ws-connect handler', () => {
  it('rejects with 401 when auth returns null', async () => {
    mockAuthenticate.mockResolvedValueOnce(null);
    const res = await run();
    expect(res.statusCode).toBe(401);
    expect(mockAddConnection).not.toHaveBeenCalled();
  });

  it('writes user + business + branch channels for a single-branch user', async () => {
    const token: TokenPayload = {
      userId: 'u-1',
      businessId: 'biz-1',
      role: 'cashier',
      branchIds: ['br-1'],
    };
    mockAuthenticate.mockResolvedValueOnce(token);

    const res = await run();

    expect(res.statusCode).toBe(200);
    expect(mockAddConnection).toHaveBeenCalledWith('conn-1', token, [
      'user:u-1',
      'business:biz-1',
      'branch:br-1',
    ]);
  });

  it('writes one branch channel per branchIds entry for a multi-branch user', async () => {
    const token: TokenPayload = {
      userId: 'u-1',
      businessId: 'biz-1',
      role: 'manager',
      branchIds: ['br-1', 'br-2', 'br-3'],
    };
    mockAuthenticate.mockResolvedValueOnce(token);

    await run();

    expect(mockAddConnection).toHaveBeenCalledWith('conn-1', token, [
      'user:u-1',
      'business:biz-1',
      'branch:br-1',
      'branch:br-2',
      'branch:br-3',
    ]);
  });

  it('writes only user:<id> for super_admin (opt-in observer)', async () => {
    const token: TokenPayload = {
      userId: 'sa-1',
      businessId: '*',
      role: 'super_admin',
    };
    mockAuthenticate.mockResolvedValueOnce(token);

    await run();

    expect(mockAddConnection).toHaveBeenCalledWith('conn-1', token, ['user:sa-1']);
  });

  it('returns 500 when addConnection throws', async () => {
    mockAuthenticate.mockResolvedValueOnce({
      userId: 'u-1',
      businessId: 'biz-1',
      role: 'cashier',
      branchIds: ['br-1'],
    });
    mockAddConnection.mockRejectedValueOnce(new Error('ddb down'));

    const res = await run();
    expect(res.statusCode).toBe(500);
  });
});
