import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from './auth.js';

const mockVerifyAccessToken = vi.fn();

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

function createApp() {
  const app = new Hono<AppEnv>();
  app.use('/protected/*', requireAuth());
  app.get('/protected/resource', (c) => {
    const user = c.get('user');
    return c.json({ user });
  });
  // Error handler to convert thrown errors to responses
  app.onError((err, c) => {
    const status = 'statusCode' in err ? (err.statusCode as number) : 500;
    return c.json({ error: err.message }, status as 200);
  });
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireAuth middleware', () => {
  it('sets user on context with valid token', async () => {
    const payload = { userId: 'u1', businessId: 'b1', role: 'admin' };
    mockVerifyAccessToken.mockResolvedValue(payload);

    const app = createApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: unknown };
    expect(body.user).toEqual(payload);
  });

  it('returns 401 without Authorization header', async () => {
    const app = createApp();
    const res = await app.request('/protected/resource');

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Missing or malformed');
  });

  it('returns 401 with non-Bearer scheme', async () => {
    const app = createApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Basic abc123' },
    });

    expect(res.status).toBe(401);
  });

  it('returns 401 when token verification fails', async () => {
    mockVerifyAccessToken.mockRejectedValue(new Error('expired'));

    const app = createApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer expired-token' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Invalid or expired');
  });
});
