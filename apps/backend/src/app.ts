import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { originVerify } from './middleware/origin-verify.js';
import { checkHealth } from './services/health.js';
import type { AppEnv } from './types.js';

const app = new Hono<AppEnv>();

app.use('/*', cors());
app.use('/*', originVerify());
app.use('/*', requestLogger());
app.onError(errorHandler);

app.get('/api/health', async (c) => {
  const data = await checkHealth();
  return c.json({ success: true, data });
});

export default app;
