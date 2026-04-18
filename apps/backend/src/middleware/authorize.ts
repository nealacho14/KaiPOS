import type { MiddlewareHandler } from 'hono';
import { hasPermission, type Permission } from '@kaipos/shared/permissions';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';
import { logAuditEvent } from '../services/audit.js';
import type { AppEnv } from '../types.js';

export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }

    if (hasPermission(user.role, permission)) {
      await next();
      return;
    }

    logAuditEvent({
      action: 'authorization_failed',
      target: user.userId,
      userId: user.userId,
      businessId: user.businessId,
      metadata: {
        permission,
        route: c.req.path,
        method: c.req.method,
      },
    });

    throw new ForbiddenError('Insufficient permissions');
  };
}
