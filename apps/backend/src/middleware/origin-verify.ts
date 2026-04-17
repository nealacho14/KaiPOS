import type { MiddlewareHandler } from 'hono';
import { verifyCloudfrontOriginHeader } from '../lib/cloudfront-origin.js';
import type { AppEnv } from '../types.js';

/**
 * Verifies requests originate from CloudFront by checking a shared-secret header.
 * Policy lives in `lib/cloudfront-origin.ts` — skipped when CLOUDFRONT_SECRET is
 * not set (local dev).
 */
export function originVerify(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (verifyCloudfrontOriginHeader(c.req.header('x-origin-verify'))) {
      return next();
    }

    return c.json({ success: false, error: 'Forbidden', code: 'FORBIDDEN' }, 403);
  };
}
