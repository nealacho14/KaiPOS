import { serve } from '@hono/node-server';
import app from './app.js';
import { logger } from './lib/logger.js';

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  logger.info({ port }, 'KaiPOS Backend running');
});
