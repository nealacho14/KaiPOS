import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { WSChannel } from '@kaipos/shared';
import { useWebSocketActions, useWebSocketState, WebSocketProvider } from './WebSocketContext.js';

function wrapper({ children }: { children: ReactNode }) {
  return <WebSocketProvider initialEndpoint="">{children}</WebSocketProvider>;
}

describe('WebSocketContext', () => {
  it('keeps the actions object referentially stable across state changes', () => {
    // This is the invariant that prevents the 2026-05-06 subscribe loop:
    // effects that depend on the actions object never re-fire when
    // subscribedChannels (or status) changes.
    const { result } = renderHook(
      () => ({ actions: useWebSocketActions(), state: useWebSocketState() }),
      { wrapper },
    );

    const firstActions = result.current.actions;
    expect(result.current.state.subscribedChannels).toEqual([]);

    act(() => {
      result.current.actions.subscribe('branch:biz-1:br-1' as WSChannel);
    });

    expect(result.current.state.subscribedChannels).toEqual(['branch:biz-1:br-1']);
    expect(result.current.actions).toBe(firstActions);

    act(() => {
      result.current.actions.unsubscribe('branch:biz-1:br-1' as WSChannel);
    });
    expect(result.current.state.subscribedChannels).toEqual([]);
    expect(result.current.actions).toBe(firstActions);
  });

  it('exposes endpoint changes through the state context', () => {
    const { result } = renderHook(
      () => ({ actions: useWebSocketActions(), state: useWebSocketState() }),
      { wrapper },
    );

    expect(result.current.state.hasEndpoint).toBe(false);
    const firstActions = result.current.actions;

    act(() => {
      result.current.actions.setEndpoint('wss://example/prod');
    });

    expect(result.current.state.endpoint).toBe('wss://example/prod');
    expect(result.current.state.hasEndpoint).toBe(true);
    expect(result.current.actions).toBe(firstActions);
  });
});
