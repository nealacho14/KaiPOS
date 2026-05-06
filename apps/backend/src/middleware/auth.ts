import type { MiddlewareHandler } from 'hono';
import * as jose from 'jose';
import { SUPER_ADMIN_BUSINESS_ID } from '@kaipos/shared';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError, UnauthorizedError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

export function requireAuth(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = header.slice(7);

    try {
      const payload = await verifyAccessToken(token);

      // Super_admin business scoping. When a super_admin client picks a
      // business from the header business picker, the SPA attaches an
      // `x-business-id` header on subsequent requests. Narrow the in-request
      // user payload to that business so all downstream services (which
      // already key off `actor.businessId`) scope correctly. The JWT itself
      // is unchanged — this is request-lifecycle only.
      const requested = c.req.header('x-business-id');
      if (
        payload.businessId === SUPER_ADMIN_BUSINESS_ID &&
        requested &&
        requested !== SUPER_ADMIN_BUSINESS_ID
      ) {
        c.set('user', { ...payload, businessId: requested });
      } else {
        c.set('user', payload);
      }
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid token');
    }

    await next();
  };
}
