import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validation.js';
import {
  categoryIdParamSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '../schemas/categories.js';
import * as categoriesService from '../services/categories.js';
import { toPaginatedResponse } from '../lib/paginate.js';

const categories = new Hono<AppEnv>();

categories.get(
  '/api/categories',
  requireAuth(),
  requirePermission('categories:read'),
  validate({ query: listCategoriesQuerySchema }),
  async (c) => {
    const user = c.get('user')!;
    const parsed = listCategoriesQuerySchema.parse(c.req.query());
    const result = await categoriesService.listCategories(user, parsed);
    return c.json(toPaginatedResponse(result));
  },
);

categories.post(
  '/api/categories',
  requireAuth(),
  requirePermission('categories:write'),
  validate({ body: createCategorySchema }),
  async (c) => {
    const user = c.get('user')!;
    const body = await c.req.json();
    const result = await categoriesService.createCategory(user, body);
    return c.json({ success: true, data: result }, 201);
  },
);

categories.patch(
  '/api/categories/:id',
  requireAuth(),
  requirePermission('categories:write'),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await categoriesService.updateCategory(user, id, body);
    return c.json({ success: true, data: result });
  },
);

categories.delete(
  '/api/categories/:id',
  requireAuth(),
  requirePermission('categories:delete'),
  validate({ params: categoryIdParamSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const result = await categoriesService.deactivateCategory(user, id);
    return c.json({ success: true, data: result });
  },
);

export default categories;
