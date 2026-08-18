import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  api,
  apiJsonPaginated,
  getFreshAccessToken,
  resetAuthFailureHandlerForTests,
  setAuthFailureHandler,
} from './api.js';
import { clearSession, getSession, setSession } from './auth-storage.js';

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

  it('retries transparently on API Gateway throttle 503', async () => {
    let calls = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      // First two return the API GW throttle body; third succeeds.
      if (calls < 3) {
        return new Response('{"message":"Service Unavailable"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return jsonResponse(200, { success: true, data: { ok: true } });
    });

    const res = await api('/api/anything', { skipAuth: true });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('gives up after MAX_THROTTLE_RETRIES (3 total attempts) and returns the 503', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response('{"message":"Service Unavailable"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const res = await api('/api/anything', { skipAuth: true });
    expect(res.status).toBe(503);
    // 1 original + 2 retries = 3
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry on a 503 that is not the API Gateway throttle body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(503, {
        success: false,
        error: 'Assets bucket is not configured',
        code: 'ASSETS_NOT_CONFIGURED',
      }),
    );

    const res = await api('/api/anything', { skipAuth: true });
    expect(res.status).toBe(503);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when refresh fails with a transient 503 (no re-login loop)', async () => {
    setSession({ accessToken: 'old', refreshToken: 'rfr-1' });

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as URL).toString();
      if (url === '/api/auth/refresh') {
        // 503 from API Gateway throttle while the refresh endpoint is being throttled
        return new Response('{"message":"Service Unavailable"}', {
          status: 503,
          headers: { 'content-type': 'application/json' },
        });
      }
      return jsonResponse(401, { success: false, error: 'expired', code: 'TOKEN_EXPIRED' });
    });

    await api('/api/users');
    // Session must NOT be cleared on transient failures — that creates the
    // re-login loop we observed during the AWS quota incident.
    expect(window.localStorage.getItem('kaipos:accessToken')).toBe('old');
    expect(window.localStorage.getItem('kaipos:refreshToken')).toBe('rfr-1');
    expect(window.location.assign).not.toHaveBeenCalled();
  });
});

describe('apiJsonPaginated()', () => {
  it('extracts data and pagination from the envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [{ id: 'a' }, { id: 'b' }],
        pagination: { page: 2, limit: 25, total: 60, totalPages: 3 },
      }),
    );

    const result = await apiJsonPaginated<{ id: string }>('/api/things?page=2&limit=25');
    expect(result.data).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 60, totalPages: 3 });
  });

  it('falls back to a single-page envelope when the server omits pagination', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, { success: true, data: [{ id: 'x' }, { id: 'y' }] }),
    );

    const result = await apiJsonPaginated<{ id: string }>('/api/things');
    expect(result.data).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 1, limit: 2, total: 2, totalPages: 1 });
  });
});

describe('getFreshAccessToken()', () => {
  function makeJwt(exp: number): string {
    const payload = btoa(JSON.stringify({ exp }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `header.${payload}.sig`;
  }

  const FAR_FUTURE = Math.floor(Date.now() / 1000) + 3600;
  const EXPIRED = Math.floor(Date.now() / 1000) - 60;

  it('returns null when there is no session', async () => {
    expect(await getFreshAccessToken()).toBeNull();
  });

  it('returns the current token as-is when it is not near expiry', async () => {
    const token = makeJwt(FAR_FUTURE);
    setSession({ accessToken: token, refreshToken: 'rfr-1' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    expect(await getFreshAccessToken()).toBe(token);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refreshes once when the token is expired and persists the new session', async () => {
    setSession({ accessToken: makeJwt(EXPIRED), refreshToken: 'rfr-1' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: { accessToken: 'new-token', refreshToken: 'rfr-2' },
      }),
    );

    // Concurrent callers share the single in-flight refresh.
    const [a, b] = await Promise.all([getFreshAccessToken(), getFreshAccessToken()]);
    expect(a).toBe('new-token');
    expect(b).toBe('new-token');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(getSession()?.accessToken).toBe('new-token');
    expect(getSession()?.refreshToken).toBe('rfr-2');
  });

  it('clears the session and returns null when the refresh is explicitly rejected', async () => {
    setSession({ accessToken: makeJwt(EXPIRED), refreshToken: 'rfr-dead' });
    const onFailure = vi.fn();
    setAuthFailureHandler(onFailure);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(401, { success: false, error: 'revoked', code: 'INVALID_REFRESH' }),
    );

    expect(await getFreshAccessToken()).toBeNull();
    expect(getSession()).toBeNull();
    expect(onFailure).toHaveBeenCalled();
  });

  it('keeps the session and returns the stale token on a transient refresh failure', async () => {
    const stale = makeJwt(EXPIRED);
    setSession({ accessToken: stale, refreshToken: 'rfr-1' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(503, { success: false, error: 'throttled', code: 'THROTTLED' }),
    );

    expect(await getFreshAccessToken()).toBe(stale);
    expect(getSession()?.refreshToken).toBe('rfr-1');
  });
});
