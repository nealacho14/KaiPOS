import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, resetAuthFailureHandlerForTests, setAuthFailureHandler } from './api.js';
import { clearSession, setSession } from './auth-storage.js';

const ORIGINAL_LOCATION = window.location;

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
  resetAuthFailureHandlerForTests();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...ORIGINAL_LOCATION, assign: vi.fn() },
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: ORIGINAL_LOCATION,
    writable: true,
  });
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('api()', () => {
  it('injects Bearer token from session', async () => {
    setSession({ accessToken: 'tok-1', refreshToken: 'rfr-1' });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { success: true, data: {} }));

    await api('/api/anything');

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Headers).get('authorization')).toBe('Bearer tok-1');
  });

  it('refreshes once on TOKEN_EXPIRED and retries the original request', async () => {
    setSession({ accessToken: 'old', refreshToken: 'rfr-1' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, _init) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/refresh') {
        return jsonResponse(200, {
          success: true,
          data: { accessToken: 'new', refreshToken: 'rfr-2' },
        });
      }
      // First call returns TOKEN_EXPIRED; subsequent calls succeed.
      const auth = (_init?.headers as Headers | undefined)?.get('authorization');
      if (auth === 'Bearer old') {
        return jsonResponse(401, { success: false, error: 'expired', code: 'TOKEN_EXPIRED' });
      }
      return jsonResponse(200, { success: true, data: { ok: true } });
    });

    const [resA, resB] = await Promise.all([api('/api/users'), api('/api/products')]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const refreshCalls = fetchSpy.mock.calls.filter(
      ([input]) =>
        (typeof input === 'string' ? input : (input as URL).toString()) === '/api/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(1);

    // Both retried calls used the new token
    const retried = fetchSpy.mock.calls.filter(([input, init]) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      return (
        url !== '/api/auth/refresh' &&
        (init?.headers as Headers | undefined)?.get('authorization') === 'Bearer new'
      );
    });
    expect(retried.length).toBeGreaterThanOrEqual(2);
  });

  it('clears session and redirects when refresh fails', async () => {
    setSession({ accessToken: 'old', refreshToken: 'rfr-1' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/refresh') {
        return jsonResponse(401, { success: false, error: 'invalid', code: 'INVALID_TOKEN' });
      }
      return jsonResponse(401, { success: false, error: 'expired', code: 'TOKEN_EXPIRED' });
    });

    await api('/api/users');
    expect(window.location.assign).toHaveBeenCalledWith('/login');
    expect(window.localStorage.getItem('kaipos:accessToken')).toBeNull();
    expect(window.localStorage.getItem('kaipos:refreshToken')).toBeNull();
  });

  it('routes auth failures through a registered handler instead of window.location', async () => {
    setSession({ accessToken: 'old', refreshToken: 'rfr-1' });
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/refresh') {
        return jsonResponse(401, { success: false, error: 'invalid', code: 'INVALID_TOKEN' });
      }
      return jsonResponse(401, { success: false, error: 'expired', code: 'TOKEN_EXPIRED' });
    });

    await api('/api/users');
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('does not refresh on a non-TOKEN_EXPIRED 401', async () => {
    setSession({ accessToken: 'tok', refreshToken: 'rfr-1' });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/refresh') {
        return jsonResponse(200, {
          success: true,
          data: { accessToken: 'new', refreshToken: 'rfr-2' },
        });
      }
      return jsonResponse(401, { success: false, error: 'invalid', code: 'UNAUTHORIZED' });
    });

    const res = await api('/api/users');
    expect(res.status).toBe(401);

    const refreshCalls = fetchSpy.mock.calls.filter(
      ([input]) =>
        (typeof input === 'string' ? input : (input as URL).toString()) === '/api/auth/refresh',
    );
    expect(refreshCalls).toHaveLength(0);
  });
});
