import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';
import { createWsRequestLogger } from './lambda-runtime.js';

const { mockCreateLogger } = vi.hoisted(() => ({
  mockCreateLogger: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  createLogger: mockCreateLogger,
}));

function makeEvent(
  overrides: Partial<APIGatewayProxyWebsocketEventV2['requestContext']> = {},
): APIGatewayProxyWebsocketEventV2 {
  return {
    requestContext: {
      requestId: 'req-1',
      connectionId: 'conn-1',
      routeKey: '$connect',
      ...overrides,
    },
    headers: {},
    body: null,
    isBase64Encoded: false,
  } as unknown as APIGatewayProxyWebsocketEventV2;
}

describe('createWsRequestLogger', () => {
  it('binds module, requestId, connectionId, and routeKey from the event', () => {
    mockCreateLogger.mockClear();
    createWsRequestLogger(makeEvent(), 'ws-connect');
    expect(mockCreateLogger).toHaveBeenCalledWith({
      module: 'ws-connect',
      requestId: 'req-1',
      connectionId: 'conn-1',
      routeKey: '$connect',
    });
  });

  it('omits undefined fields from requestContext', () => {
    mockCreateLogger.mockClear();
    createWsRequestLogger(
      makeEvent({ requestId: undefined, connectionId: 'conn-2', routeKey: undefined }),
      'ws-default',
    );
    expect(mockCreateLogger).toHaveBeenCalledWith({
      module: 'ws-default',
      connectionId: 'conn-2',
    });
  });

  it('binds only module when requestContext is missing', () => {
    mockCreateLogger.mockClear();
    const event = {
      headers: {},
      body: null,
      isBase64Encoded: false,
    } as unknown as APIGatewayProxyWebsocketEventV2;
    createWsRequestLogger(event, 'ws-disconnect');
    expect(mockCreateLogger).toHaveBeenCalledWith({ module: 'ws-disconnect' });
  });

  it('returns the logger instance that createLogger produced', () => {
    const fakeLogger = { info: vi.fn() };
    mockCreateLogger.mockReturnValueOnce(fakeLogger);
    expect(createWsRequestLogger(makeEvent(), 'ws-connect')).toBe(fakeLogger);
  });
});
