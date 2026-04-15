import type { MiddlewareHandler } from 'hono';
import { createLogger } from '../lib/logger.js';
import type { AppEnv } from '../types.js';

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const requestId = crypto.randomUUID();
    const log = createLogger({ requestId });
    c.set('logger', log);

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
      log.info(data, 'request completed');
    }
  };
}
