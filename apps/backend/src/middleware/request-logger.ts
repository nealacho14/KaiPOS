import type { MiddlewareHandler } from 'hono';
import { createLogger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

// Health checks are pinged frequently by external monitors and CloudFront and
// would otherwise dominate the Lambda log group. The API Gateway access log
// still records every hit for auditability.
const SKIPPED_PATHS = new Set(['/api/health']);

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const log = createLogger({ requestId });
    c.set('logger', log);

    if (SKIPPED_PATHS.has(c.req.path)) {
      await next();
      return;
    }

    const start = performance.now();
    await next();
    const durationMs = Math.round(performance.now() - start);

    const statusCode = c.res.status;
    const data = {
      requestId,
      method: c.req.method,
      path: c.req.path,
      statusCode,
      durationMs,
    };

    if (statusCode >= 500) {
      log.error(data, 'request completed');
    } else if (statusCode >= 400) {
      log.warn(data, 'request completed');
    } else {
      // 2xx/3xx are the bulk of traffic and duplicate the API Gateway access
      // log. Demote to debug so prod (LOG_LEVEL=info) drops them while local
      // dev (LOG_LEVEL=debug) still sees them.
      log.debug(data, 'request completed');
    }
  };
}
