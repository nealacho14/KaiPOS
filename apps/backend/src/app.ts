import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestLogger } from './middleware/request-logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { originVerify } from './middleware/origin-verify.js';
import { checkHealth } from './services/health.js';
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import kitchenStationsRoutes from './routes/kitchen-stations.js';
import ordersRoutes from './routes/orders.js';
import productsRoutes from './routes/products.js';
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

app.route('/', authRoutes);
app.route('/', usersRoutes);
app.route('/', kitchenStationsRoutes);
app.route('/', ordersRoutes);
app.route('/', productsRoutes);

export default app;
