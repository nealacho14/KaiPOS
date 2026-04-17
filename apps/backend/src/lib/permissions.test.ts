import { describe, it, expect } from 'vitest';
import type { UserRole } from '@kaipos/shared/types';
import {
  ROLE_PERMISSIONS,
  SUPER_ADMIN_BUSINESS_ID,
  hasPermission,
  type Permission,
} from './permissions.js';

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

describe('permissions', () => {
  it('exports the super_admin bypass sentinel', () => {
    expect(SUPER_ADMIN_BUSINESS_ID).toBe('*');
  });

  describe('ROLE_PERMISSIONS', () => {
    it('defines an entry for every known role', () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
      }
    });

    it('grants super_admin the platform:manage permission in addition to admin set', () => {
      expect(ROLE_PERMISSIONS.super_admin).toContain('platform:manage');
      for (const p of ROLE_PERMISSIONS.admin) {
        expect(ROLE_PERMISSIONS.super_admin).toContain(p);
      }
    });

    it('does not grant admin the platform:manage permission', () => {
      expect(ROLE_PERMISSIONS.admin).not.toContain('platform:manage');
    });
  });

  describe('hasPermission — role x permission matrix', () => {
    const cases: Array<[UserRole, Permission]> = ALL_ROLES.flatMap((role) =>
      ALL_PERMISSIONS.map((perm): [UserRole, Permission] => [role, perm]),
    );

    it.each(cases)('role=%s permission=%s matches ROLE_PERMISSIONS', (role, permission) => {
      const expected = role === 'super_admin' ? true : ROLE_PERMISSIONS[role].includes(permission);
      expect(hasPermission(role, permission)).toBe(expected);
    });
  });

  describe('super_admin bypass', () => {
    it('returns true for every declared permission', () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(hasPermission('super_admin', perm)).toBe(true);
      }
    });

    it('returns true even for unknown/hypothetical permissions', () => {
      expect(hasPermission('super_admin', 'some:future:permission' as Permission)).toBe(true);
    });
  });

  describe('unknown roles', () => {
    it('returns false for roles not in the map', () => {
      expect(hasPermission('cliente' as UserRole, 'orders:read')).toBe(false);
      expect(hasPermission('' as UserRole, 'orders:read')).toBe(false);
    });
  });
});
