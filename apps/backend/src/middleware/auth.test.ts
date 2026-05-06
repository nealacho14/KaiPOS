import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import * as jose from 'jose';
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
    const code = 'code' in err ? (err.code as string) : undefined;
    return c.json({ error: err.message, code }, status as 200);
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

  it('returns 401 UNAUTHORIZED when token verification fails (generic / invalid)', async () => {
    mockVerifyAccessToken.mockRejectedValue(new Error('bogus'));

    const app = createApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error).toContain('Invalid token');
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 TOKEN_EXPIRED when jose throws JWTExpired', async () => {
    mockVerifyAccessToken.mockRejectedValue(
      new jose.errors.JWTExpired('"exp" claim timestamp check failed', {}),
    );

    const app = createApp();
    const res = await app.request('/protected/resource', {
      headers: { Authorization: 'Bearer expired-token' },
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe('TOKEN_EXPIRED');
    expect(body.error).toContain('expired');
  });

  describe('super_admin x-business-id narrowing', () => {
    it('narrows businessId for super_admin when x-business-id header is set', async () => {
      mockVerifyAccessToken.mockResolvedValue({
        userId: 'sa-1',
        businessId: '*',
        role: 'super_admin',
      });

      const app = createApp();
      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer t', 'x-business-id': 'biz-77' },
      });

      const body = (await res.json()) as { user: { businessId: string; role: string } };
      expect(body.user.businessId).toBe('biz-77');
      expect(body.user.role).toBe('super_admin');
    });

    it('leaves businessId untouched when super_admin omits the header', async () => {
      mockVerifyAccessToken.mockResolvedValue({
        userId: 'sa-1',
        businessId: '*',
        role: 'super_admin',
      });

      const app = createApp();
      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer t' },
      });

      const body = (await res.json()) as { user: { businessId: string } };
      expect(body.user.businessId).toBe('*');
    });

    it('ignores x-business-id from non-super_admin actors', async () => {
      mockVerifyAccessToken.mockResolvedValue({
        userId: 'a-1',
        businessId: 'biz-1',
        role: 'admin',
      });

      const app = createApp();
      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer t', 'x-business-id': 'biz-other' },
      });

      const body = (await res.json()) as { user: { businessId: string } };
      expect(body.user.businessId).toBe('biz-1');
    });

    it('ignores x-business-id when it points back at the super_admin sentinel', async () => {
      mockVerifyAccessToken.mockResolvedValue({
        userId: 'sa-1',
        businessId: '*',
        role: 'super_admin',
      });

      const app = createApp();
      const res = await app.request('/protected/resource', {
        headers: { Authorization: 'Bearer t', 'x-business-id': '*' },
      });

      const body = (await res.json()) as { user: { businessId: string } };
      expect(body.user.businessId).toBe('*');
    });
  });
});
