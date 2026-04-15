import type { MiddlewareHandler } from 'hono';
import { getUsersCollection } from '../db/collections.js';
import { ForbiddenError } from '../lib/errors.js';
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

    // Admins can access all branches in their business
    if (user.role === 'admin') {
      await next();
      return;
    }

    // Look up user's branchIds from the database
    const users = await getUsersCollection();
    const dbUser = await users.findOne({ _id: user.userId });

    if (!dbUser || !dbUser.branchIds?.includes(branchId)) {
      throw new ForbiddenError('Access denied to this branch');
    }

    await next();
  };
}
