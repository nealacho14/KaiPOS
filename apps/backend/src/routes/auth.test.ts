import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { Hono } from 'hono';
import * as jose from 'jose';
import type { MeResponse, TokenPayload, User } from '@kaipos/shared/types';
import type { AppEnv } from '../types.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError } from '../lib/errors.js';
import authRoutes from './auth.js';

const TEST_JWT_SECRET = 'test-jwt-secret-for-me-route-12345678';
const TEST_SECRET_BYTES = new TextEncoder().encode(TEST_JWT_SECRET);

const { mockAuthService } = vi.hoisted(() => ({
  mockAuthService: {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    me: vi.fn(),
  },
}));

vi.mock('../services/auth.js', () => mockAuthService);

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const adminPayload: TokenPayload = {
  userId: 'admin-1',
  businessId: 'biz-1',
  role: 'admin',
  branchIds: ['br-1'],
};

const superAdminPayload: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

const sampleUser: Omit<User, 'passwordHash'> = {
  _id: 'admin-1',
  businessId: 'biz-1',
  email: 'admin@lacocinadekai.com',
  name: 'Admin',
  role: 'admin',
  branchIds: ['br-1'],
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  createdBy: 'seed',
};

const sampleBusiness = {
  _id: 'biz-1',
  name: 'La Cocina de Kai',
  slug: 'la-cocina-de-kai',
};

async function signToken(
  payload: TokenPayload,
  opts: { secret?: Uint8Array; expirationTime?: string | number | Date } = {},
): Promise<string> {
  const secret = opts.secret ?? TEST_SECRET_BYTES;
  return new jose.SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(opts.expirationTime ?? '15m')
    .sign(secret);
}

function createApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', authRoutes);
  return app;
}

beforeAll(() => {
  process.env.JWT_SECRET = TEST_JWT_SECRET;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth routes', () => {
  describe('GET /api/auth/me', () => {
    it('returns 401 without an Authorization header', async () => {
      const res = await createApp().request('/api/auth/me');

      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mockAuthService.me).not.toHaveBeenCalled();
    });

    it('admin: returns SafeUser + business', async () => {
      const token = await signToken(adminPayload);
      const meResponse: MeResponse = { user: sampleUser, business: sampleBusiness };
      mockAuthService.me.mockResolvedValue(meResponse);

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: MeResponse };
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe('admin@lacocinadekai.com');
      expect(body.data.business).toEqual(sampleBusiness);
      expect(mockAuthService.me).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'admin-1', businessId: 'biz-1', role: 'admin' }),
      );
    });

    it('super_admin: returns SafeUser + business: null', async () => {
      const token = await signToken(superAdminPayload);
      const saUser: Omit<User, 'passwordHash'> = {
        ...sampleUser,
        _id: 'sa-1',
        email: 'root@kaipos.io',
        name: 'Root',
        role: 'super_admin',
        businessId: '*',
        branchIds: undefined,
      };
      mockAuthService.me.mockResolvedValue({ user: saUser, business: null });

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: MeResponse };
      expect(body.data.user.role).toBe('super_admin');
      expect(body.data.business).toBeNull();
    });

    it('401 with a forged-secret token → UNAUTHORIZED (invalid, not TOKEN_EXPIRED)', async () => {
      const forgedSecret = new TextEncoder().encode('a-different-secret-entirely-00000000');
      const token = await signToken(adminPayload, { secret: forgedSecret });

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mockAuthService.me).not.toHaveBeenCalled();
    });

    it('401 with an expired token → TOKEN_EXPIRED', async () => {
      const token = await signToken(adminPayload, { expirationTime: '0s' });

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(401);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('TOKEN_EXPIRED');
      expect(mockAuthService.me).not.toHaveBeenCalled();
    });

    it('404 when the user row is missing → USER_NOT_FOUND', async () => {
      const token = await signToken(adminPayload);
      mockAuthService.me.mockRejectedValue(new AppError('User not found', 404, 'USER_NOT_FOUND'));

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('USER_NOT_FOUND');
    });

    it('404 when the business row is missing → BUSINESS_NOT_FOUND', async () => {
      const token = await signToken(adminPayload);
      mockAuthService.me.mockRejectedValue(
        new AppError('Business not found', 404, 'BUSINESS_NOT_FOUND'),
      );

      const res = await createApp().request('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('BUSINESS_NOT_FOUND');
    });
  });
});
