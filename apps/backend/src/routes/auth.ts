import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../schemas/auth.js';
import * as authService from '../services/auth.js';

const auth = new Hono<AppEnv>();

auth.post('/api/auth/login', validate({ body: loginSchema }), async (c) => {
  const { email, password } = await c.req.json();
  const result = await authService.login(email, password);
  return c.json({ success: true, data: result });
});

auth.get('/api/auth/me', requireAuth(), async (c) => {
  const token = c.get('user')!;
  const result = await authService.me(token);
  return c.json({ success: true, data: result });
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

auth.post('/api/auth/forgot-password', validate({ body: forgotPasswordSchema }), async (c) => {
  const { email } = await c.req.json();
  await authService.forgotPassword(email);
  return c.json({ success: true, data: { message: 'If the email exists, a reset link was sent' } });
});

auth.post('/api/auth/reset-password', validate({ body: resetPasswordSchema }), async (c) => {
  const { token, password } = await c.req.json();
  await authService.resetPassword(token, password);
  return c.json({ success: true, data: { message: 'Password reset successfully' } });
});

export default auth;
