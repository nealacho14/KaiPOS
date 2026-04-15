import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../types.js';

/**
 * Verifies requests originate from CloudFront by checking a shared-secret header.
 * Skipped when CLOUDFRONT_SECRET is not set (local dev).
 */
export function originVerify(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const secret = process.env.CLOUDFRONT_SECRET;

    if (!secret) {
      return next();
    }

    const header = c.req.header('x-origin-verify');
    if (header !== secret) {
      return c.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, 403);
    }

    return next();
  };
}
