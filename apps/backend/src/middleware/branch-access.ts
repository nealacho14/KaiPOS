import type { MiddlewareHandler } from 'hono';
import { ForbiddenError } from '../lib/errors.js';
import { hasPermission } from '../lib/permissions.js';
import type { AppEnv } from '../types.js';

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

    if (hasPermission(user.role, 'branches:manage')) {
      await next();
      return;
    }

    if (!user.branchIds?.includes(branchId)) {
      throw new ForbiddenError('Access denied to this branch');
    }

    await next();
  };
}
