import type { MiddlewareHandler } from 'hono';
import type { TokenPayload } from '@kaipos/shared/types';
import { ForbiddenError } from '../lib/errors.js';
import { hasPermission } from '../lib/permissions.js';
import type { AppEnv } from '../types.js';

/**
 * Returns true when the actor may access `branchId`. Roles with
 * `branches:manage` (admin, super_admin) bypass; others must have the
 * branch in their token's `branchIds` cache.
 */
export function canAccessBranch(actor: TokenPayload, branchId: string): boolean {
  if (hasPermission(actor.role, 'branches:manage')) return true;
  return actor.branchIds?.includes(branchId) ?? false;
}

export function assertBranchAccess(actor: TokenPayload, branchId: string): void {
  if (!canAccessBranch(actor, branchId)) {
    throw new ForbiddenError('Access denied to this branch');
  }
}

export function requireBranchAccess(paramName: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    const branchId = c.req.param(paramName) ?? c.req.query(paramName);
    if (!branchId) {
      throw new ForbiddenError('Branch ID is required');
    }

    assertBranchAccess(user, branchId);
    await next();
  };
}
