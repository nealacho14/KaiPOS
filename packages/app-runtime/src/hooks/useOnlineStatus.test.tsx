import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus.js';

function setOnLine(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value);
}

/** Fires the real window events the hook subscribes to. */
function emit(event: 'online' | 'offline') {
  act(() => {
    window.dispatchEvent(new Event(event));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOnlineStatus', () => {
  it('reports the connection state at mount', () => {
    setOnLine(false);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(false);
  });

  it('reports online when connected', () => {
    setOnLine(true);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current).toBe(true);
  });

  it('flips to offline when the connection drops', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());

    setOnLine(false);
    emit('offline');

    expect(result.current).toBe(false);
  });

  it('recovers when the connection returns', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());

    setOnLine(true);
    emit('online');

    expect(result.current).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    setOnLine(true);

    renderHook(() => useOnlineStatus()).unmount();

    expect(remove).toHaveBeenCalledWith('online', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
