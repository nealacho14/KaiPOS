import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  userIdParamSchema,
} from '../schemas/users.js';
import * as usersService from '../services/users.js';

const users = new Hono<AppEnv>();

users.get(
  '/api/users',
  requireAuth(),
  requirePermission('users:read'),
  validate({ query: listUsersQuerySchema }),
  async (c) => {
    const user = c.get('user')!;
    const query = c.req.query();
    const result = await usersService.listUsers(user, {
      businessId: query.businessId,
    });
    return c.json({ success: true, data: result });
  },
);

users.get(
  '/api/users/:id',
  requireAuth(),
  requirePermission('users:read'),
  validate({ params: userIdParamSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const result = await usersService.getUserById(user, id);
    return c.json({ success: true, data: result });
  },
);

users.post(
  '/api/users',
  requireAuth(),
  requirePermission('users:write'),
  validate({ body: createUserSchema }),
  async (c) => {
    const user = c.get('user')!;
    const body = await c.req.json();
    const result = await usersService.createUser(user, body, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result }, 201);
  },
);

users.patch(
  '/api/users/:id',
  requireAuth(),
  requirePermission('users:write'),
  validate({ params: userIdParamSchema, body: updateUserSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await usersService.updateUser(user, id, body, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result });
  },
);

users.delete(
  '/api/users/:id',
  requireAuth(),
  requirePermission('users:delete'),
  validate({ params: userIdParamSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const result = await usersService.deactivateUser(user, id, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result });
  },
);

export default users;
