import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { API_VERSION } from '@kaipos/shared';
import { getClient } from './db/client.js';
import { logger } from './lib/logger.js';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.use('/*', cors());
app.use('/*', requestLogger());
app.onError(errorHandler);

app.get('/api/health', async (c) => {
  let dbStatus = 'disconnected';
  let dbError: string | undefined;

  try {
    const client = await getClient();
    await client.db().command({ ping: 1 });
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'error';
    dbError = error instanceof Error ? error.message : String(error);
  }

  return c.json({
    success: true,
    data: {
      service: 'kaipos-api',
      version: API_VERSION,
      database: dbStatus,
      ...(dbError && { databaseError: dbError }),
      timestamp: new Date().toISOString(),
    },
  });
});

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  logger.info({ port }, 'KaiPOS Backend running');
});

export default app;
