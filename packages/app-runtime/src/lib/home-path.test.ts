import type { UserRole } from '@kaipos/shared';
import { ROLE_PERMISSIONS, hasPermission } from '@kaipos/shared';
import { describe, expect, it } from 'vitest';
import { resolveHomePath } from './home-path.js';

const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as UserRole[];

describe('resolveHomePath', () => {
  it('sends admins to the dashboard', () => {
    expect(resolveHomePath('admin')).toBe('/dashboard');
    expect(resolveHomePath('super_admin')).toBe('/dashboard');
  });

  it('sends roles without business:manage to the catalog', () => {
    for (const role of ['manager', 'supervisor', 'cashier', 'waiter'] as UserRole[]) {
      expect(resolveHomePath(role)).toBe('/products');
    }
  });

  it('sends kitchen to the explicit dead end', () => {
    expect(resolveHomePath('kitchen')).toBe('/no-access');
  });

  // The guard fallback is what makes the whole RBAC change safe: if a role's
  // home were itself gated, RequirePermission would bounce it there forever.
  it('never routes a role to a page that role cannot open', () => {
    for (const role of ALL_ROLES) {
      const home = resolveHomePath(role);
      if (home === '/dashboard') {
        expect(hasPermission(role, 'business:manage')).toBe(true);
      } else if (home === '/products') {
        expect(hasPermission(role, 'products:read')).toBe(true);
      } else {
        // /no-access carries no permission requirement.
        expect(home).toBe('/no-access');
      }
    }
  });
});
