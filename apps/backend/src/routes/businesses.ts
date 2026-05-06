import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import * as businessesService from '../services/businesses.js';

const businesses = new Hono<AppEnv>();

businesses.get('/api/businesses', requireAuth(), async (c) => {
  const user = c.get('user')!;
  const result = await businessesService.listBusinessesForSuperAdmin(user);
  return c.json({ success: true, data: result });
});

export default businesses;
