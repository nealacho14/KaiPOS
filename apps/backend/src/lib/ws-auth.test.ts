import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import type { TokenPayload } from '@kaipos/shared/types';
import { signAccessToken } from './jwt.js';
import { authenticateConnectEvent } from './ws-auth.js';

const validToken: TokenPayload = {
  userId: 'u-1',
  businessId: 'biz-1',
  role: 'cashier',
  branchIds: ['br-1'],
};

function makeEvent(overrides: { token?: string } = {}): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      connectionId: 'conn-1',
      eventType: 'CONNECT',
      routeKey: '$connect',
    },
    queryStringParameters: overrides.token ? { token: overrides.token } : null,
    headers: {},
    body: null,
    isBase64Encoded: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret';
  vi.restoreAllMocks();
});

describe('authenticateConnectEvent', () => {
  it('returns the TokenPayload when a valid token is provided', async () => {
    const token = await signAccessToken(validToken);
    const result = await authenticateConnectEvent(makeEvent({ token }));

    expect(result).not.toBeNull();
    expect(result?.userId).toBe('u-1');
    expect(result?.businessId).toBe('biz-1');
    expect(result?.role).toBe('cashier');
    expect(result?.branchIds).toEqual(['br-1']);
  });

  it('returns null when the token query param is missing', async () => {
    const result = await authenticateConnectEvent(makeEvent());
    expect(result).toBeNull();
  });

  it('returns null when the token is invalid', async () => {
    const result = await authenticateConnectEvent(makeEvent({ token: 'not-a-jwt' }));
    expect(result).toBeNull();
  });
});
