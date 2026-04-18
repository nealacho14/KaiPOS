import type { MiddlewareHandler } from 'hono';
import * as jose from 'jose';
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
      c.set('user', payload);
    } catch (err) {
      if (err instanceof jose.errors.JWTExpired) {
        throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
      }
      throw new UnauthorizedError('Invalid token');
    }

    await next();
  };
}
