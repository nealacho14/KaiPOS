import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { loginSchema, registerSchema, refreshSchema, logoutSchema } from '../schemas/auth.js';
import * as authService from '../services/auth.js';

const auth = new Hono<AppEnv>();

auth.post('/api/auth/login', validate({ body: loginSchema }), async (c) => {
  const { email, password } = await c.req.json();
  const result = await authService.login(email, password);
  return c.json({ success: true, data: result });
});

auth.post('/api/auth/register', requireAuth(), validate({ body: registerSchema }), async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const result = await authService.register(user!, body);
  return c.json({ success: true, data: { user: result } }, 201);
});

auth.post('/api/auth/refresh', validate({ body: refreshSchema }), async (c) => {
  const { refreshToken } = await c.req.json();
  const result = await authService.refresh(refreshToken);
  return c.json({ success: true, data: result });
});

auth.post('/api/auth/logout', validate({ body: logoutSchema }), async (c) => {
  const { refreshToken } = await c.req.json();
  await authService.logout(refreshToken);
  return c.json({ success: true });
});

export default auth;
