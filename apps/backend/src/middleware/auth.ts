import type { MiddlewareHandler } from 'hono';
import { verifyAccessToken } from '../lib/jwt.js';
import { UnauthorizedError } from '../lib/errors.js';
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
      c.set('user', payload);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    await next();
  };
}
