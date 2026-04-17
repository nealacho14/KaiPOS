import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { TokenPayload, User } from '@kaipos/shared/types';
import type { AppEnv } from '../types.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import usersRoutes from './users.js';

const { mockVerifyAccessToken, mockUsersService, mockLogAuditEvent } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockUsersService: {
    listUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deactivateUser: vi.fn(),
  },
  mockLogAuditEvent: vi.fn(),
}));

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

vi.mock('../services/users.js', () => ({
  listUsers: (...args: unknown[]) => mockUsersService.listUsers(...args),
  getUserById: (...args: unknown[]) => mockUsersService.getUserById(...args),
  createUser: (...args: unknown[]) => mockUsersService.createUser(...args),
  updateUser: (...args: unknown[]) => mockUsersService.updateUser(...args),
  deactivateUser: (...args: unknown[]) => mockUsersService.deactivateUser(...args),
}));

vi.mock('../services/audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const adminPayload: TokenPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' };
const cashierPayload: TokenPayload = { userId: 'cash-1', businessId: 'biz-1', role: 'cashier' };
const superAdminPayload: TokenPayload = { userId: 'sa-1', businessId: '*', role: 'super_admin' };

const sampleUser: Omit<User, 'passwordHash'> = {
  _id: 'u-1',
  businessId: 'biz-1',
  email: 'user@test.com',
  name: 'User',
  role: 'cashier',
  branchIds: ['branch-1'],
  isActive: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  createdBy: 'admin-1',
};

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

function createApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', usersRoutes);
  return app;
}

function withToken(payload: TokenPayload, init?: RequestInit): RequestInit {
  mockVerifyAccessToken.mockResolvedValue(payload);
  return {
    ...init,
    headers: {
      Authorization: 'Bearer fake-token',
      ...(init?.headers as Record<string, string> | undefined),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('users routes', () => {
  describe('GET /api/users', () => {
    it('returns 401 without an Authorization header', async () => {
      const app = createApp();
      const res = await app.request('/api/users');

      expect(res.status).toBe(401);
      expect(mockUsersService.listUsers).not.toHaveBeenCalled();
    });

    it('admin lists users in their business', async () => {
      mockUsersService.listUsers.mockResolvedValue([sampleUser]);

      const app = createApp();
      const res = await app.request('/api/users', withToken(adminPayload));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: unknown[] };
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockUsersService.listUsers).toHaveBeenCalledWith(adminPayload, {
        businessId: undefined,
      });
    });

    it('cashier gets 403 and an authorization_failed audit event', async () => {
      const app = createApp();
      const res = await app.request('/api/users', withToken(cashierPayload));

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          userId: 'cash-1',
          businessId: 'biz-1',
          metadata: expect.objectContaining({
            permission: 'users:read',
            route: '/api/users',
            method: 'GET',
          }),
        }),
      );
      expect(mockUsersService.listUsers).not.toHaveBeenCalled();
    });

    it('super_admin can list across all businesses', async () => {
      mockUsersService.listUsers.mockResolvedValue([sampleUser]);

      const app = createApp();
      const res = await app.request('/api/users', withToken(superAdminPayload));

      expect(res.status).toBe(200);
      expect(mockUsersService.listUsers).toHaveBeenCalledWith(superAdminPayload, {
        businessId: undefined,
      });
    });

    it('super_admin filters with ?businessId=', async () => {
      mockUsersService.listUsers.mockResolvedValue([]);

      const app = createApp();
      const res = await app.request('/api/users?businessId=biz-99', withToken(superAdminPayload));

      expect(res.status).toBe(200);
      expect(mockUsersService.listUsers).toHaveBeenCalledWith(superAdminPayload, {
        businessId: 'biz-99',
      });
    });
  });

  describe('GET /api/users/:id', () => {
    it('admin gets a user in their business', async () => {
      mockUsersService.getUserById.mockResolvedValue(sampleUser);

      const app = createApp();
      const res = await app.request(`/api/users/${VALID_UUID}`, withToken(adminPayload));

      expect(res.status).toBe(200);
      expect(mockUsersService.getUserById).toHaveBeenCalledWith(adminPayload, VALID_UUID);
    });

    it('admin gets 404 (not 403) for a user in another business', async () => {
      mockUsersService.getUserById.mockRejectedValue(new NotFoundError('User'));

      const app = createApp();
      const res = await app.request(`/api/users/${VALID_UUID}`, withToken(adminPayload));

      expect(res.status).toBe(404);
    });

    it('rejects non-uuid id with 400', async () => {
      const app = createApp();
      const res = await app.request('/api/users/not-a-uuid', withToken(adminPayload));

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/users', () => {
    it('admin creates a user → 201', async () => {
      mockUsersService.createUser.mockResolvedValue(sampleUser);

      const app = createApp();
      const res = await app.request(
        '/api/users',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'new@test.com',
            password: 'password123',
            name: 'New',
            role: 'cashier',
          }),
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { success: boolean; data: unknown };
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });

    it('returns 409 on duplicate email', async () => {
      mockUsersService.createUser.mockRejectedValue(
        new AppError('A user with this email already exists', 409, 'DUPLICATE_EMAIL'),
      );

      const app = createApp();
      const res = await app.request(
        '/api/users',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'dup@test.com',
            password: 'password123',
            name: 'Dup',
            role: 'cashier',
          }),
        }),
      );

      expect(res.status).toBe(409);
    });

    it('rejects invalid body with 400', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/users',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'not-email', password: 'short' }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockUsersService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/users/:id', () => {
    it('admin patches a user', async () => {
      mockUsersService.updateUser.mockResolvedValue({ ...sampleUser, name: 'Renamed' });

      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(adminPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed' }),
        }),
      );

      expect(res.status).toBe(200);
      expect(mockUsersService.updateUser).toHaveBeenCalledWith(
        adminPayload,
        VALID_UUID,
        { name: 'Renamed' },
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('rejects empty body with 400', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(adminPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('admin deactivates a user → 200', async () => {
      mockUsersService.deactivateUser.mockResolvedValue({ ...sampleUser, isActive: false });

      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(adminPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: { isActive: boolean } };
      expect(body.data.isActive).toBe(false);
    });

    it('returns 403 when an actor tries to deactivate themselves', async () => {
      mockUsersService.deactivateUser.mockRejectedValue(
        new AppError('You cannot deactivate your own account', 403, 'CANNOT_DEACTIVATE_SELF'),
      );

      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(adminPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('CANNOT_DEACTIVATE_SELF');
    });

    it('cashier gets 403 (lacks users:delete)', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(cashierPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'users:delete' }),
        }),
      );
      expect(mockUsersService.deactivateUser).not.toHaveBeenCalled();
    });

    it('manager forbidden from DELETE (no users:delete grant)', async () => {
      const managerPayload: TokenPayload = {
        userId: 'mgr-1',
        businessId: 'biz-1',
        role: 'manager',
      };

      const app = createApp();
      const res = await app.request(
        `/api/users/${VALID_UUID}`,
        withToken(managerPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      // Manager should NOT bypass this (no users:delete in role).
      expect(mockUsersService.deactivateUser).not.toHaveBeenCalled();
      // Reference unused payload to keep tsc happy (already used above via withToken).
      expect(managerPayload.role).toBe('manager');
    });

    it('manager forbidden from POST role=admin (role-boundary surfaced from service)', async () => {
      const managerPayload: TokenPayload = {
        userId: 'mgr-1',
        businessId: 'biz-1',
        role: 'manager',
      };
      mockUsersService.createUser.mockRejectedValue(
        new ForbiddenError('Managers cannot assign this role'),
      );

      const app = createApp();
      const res = await app.request(
        '/api/users',
        withToken(managerPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'fake-admin@test.com',
            password: 'password123',
            name: 'Nope',
            role: 'admin',
          }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });
});
