import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { UserRole } from '@kaipos/shared/types';
import { ROLE_PERMISSIONS, type Permission } from '@kaipos/shared/permissions';
import type { AppEnv } from '../types.js';
import { requirePermission } from './authorize.js';

const mockLogAuditEvent = vi.fn();

vi.mock('../services/audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

const ALL_PERMISSIONS: Permission[] = [
  'products:read',
  'products:write',
  'products:delete',
  'orders:create',
  'orders:read',
  'orders:update',
  'orders:cancel',
  'users:read',
  'users:write',
  'users:delete',
  'reports:view',
  'business:manage',
  'branches:manage',
  'platform:manage',
];

const ALL_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'manager',
  'supervisor',
  'cashier',
  'waiter',
  'kitchen',
];

function createApp(permission: Permission) {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware by injecting user from a custom header
  app.use('/protected/*', async (c, next) => {
    const userJson = c.req.header('X-Test-User');
    if (userJson) {
      c.set('user', JSON.parse(userJson));
    }
    await next();
  });

  app.use('/protected/*', requirePermission(permission));

  app.get('/protected/resource', (c) => c.json({ ok: true }));
  app.post('/protected/resource', (c) => c.json({ ok: true }));

  app.onError((err, c) => {
    const status = 'statusCode' in err ? (err.statusCode as number) : 500;
    return c.json({ error: err.message }, status as 200);
  });

  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requirePermission middleware', () => {
  describe('precondition — user not on context', () => {
    it('returns 401 Unauthorized when c.get("user") is missing', async () => {
      const app = createApp('orders:read');

      const res = await app.request('/protected/resource');

      expect(res.status).toBe(401);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain('Authentication');
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });
  });

  describe('role × permission matrix', () => {
    const cases: Array<[UserRole, Permission]> = ALL_ROLES.flatMap((role) =>
      ALL_PERMISSIONS.map((perm): [UserRole, Permission] => [role, perm]),
    );

    it.each(cases)('role=%s, permission=%s', async (role, permission) => {
      const expectedAllowed =
        role === 'super_admin' ? true : ROLE_PERMISSIONS[role].includes(permission);

      const app = createApp(permission);
      const user = JSON.stringify({ userId: 'u-1', businessId: 'biz-1', role });

      const res = await app.request('/protected/resource', {
        headers: { 'X-Test-User': user },
      });

      if (expectedAllowed) {
        expect(res.status).toBe(200);
        expect(mockLogAuditEvent).not.toHaveBeenCalled();
      } else {
        expect(res.status).toBe(403);
        expect(mockLogAuditEvent).toHaveBeenCalledOnce();
        expect(mockLogAuditEvent).toHaveBeenCalledWith({
          action: 'authorization_failed',
          target: 'u-1',
          userId: 'u-1',
          businessId: 'biz-1',
          metadata: {
            permission,
            route: '/protected/resource',
            method: 'GET',
          },
        });
      }
    });
  });

  describe('denial — audit payload shape', () => {
    it('captures the HTTP method on the audit event metadata', async () => {
      const app = createApp('users:delete');
      const user = JSON.stringify({
        userId: 'u-cash',
        businessId: 'biz-42',
        role: 'cashier' as UserRole,
      });

      const res = await app.request('/protected/resource', {
        method: 'POST',
        headers: { 'X-Test-User': user },
      });

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          userId: 'u-cash',
          businessId: 'biz-42',
          target: 'u-cash',
          metadata: {
            permission: 'users:delete',
            route: '/protected/resource',
            method: 'POST',
          },
        }),
      );
    });

    it('returns the generic "Insufficient permissions" message (no permission leak)', async () => {
      const app = createApp('platform:manage');
      const user = JSON.stringify({
        userId: 'u-1',
        businessId: 'biz-1',
        role: 'cashier' as UserRole,
      });

      const res = await app.request('/protected/resource', {
        headers: { 'X-Test-User': user },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe('Insufficient permissions');
    });
  });

  describe('super_admin bypass', () => {
    it('passes for a permission not listed in ROLE_PERMISSIONS[super_admin]', async () => {
      const madeUpPermission = 'some:future:permission' as Permission;
      const app = createApp(madeUpPermission);
      const user = JSON.stringify({
        userId: 'u-sa',
        businessId: '*',
        role: 'super_admin' as UserRole,
      });

      const res = await app.request('/protected/resource', {
        headers: { 'X-Test-User': user },
      });

      expect(res.status).toBe(200);
      expect(mockLogAuditEvent).not.toHaveBeenCalled();
    });
  });
});
