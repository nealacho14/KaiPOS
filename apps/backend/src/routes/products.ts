import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { validate } from '../middleware/validation.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  createProductSchema,
  listProductsQuerySchema,
  productIdParamSchema,
  updateProductSchema,
  type ListProductsQuery,
} from '../schemas/products.js';
import * as productsService from '../services/products.js';

const products = new Hono<AppEnv>();

products.get(
  '/api/products',
  requireAuth(),
  requirePermission('products:read'),
  validate({ query: listProductsQuerySchema }),
  async (c) => {
    const user = c.get('user')!;
    const query = c.req.query() as ListProductsQuery;
    const result = await productsService.listProducts(user, query);
    return c.json({ success: true, data: result });
  },
);

products.get(
  '/api/products/:id',
  requireAuth(),
  requirePermission('products:read'),
  validate({ params: productIdParamSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const result = await productsService.getProductById(user, id);
    return c.json({ success: true, data: result });
  },
);

products.post(
  '/api/products',
  requireAuth(),
  requirePermission('products:write'),
  validate({ body: createProductSchema }),
  async (c) => {
    const user = c.get('user')!;
    const body = await c.req.json();
    const result = await productsService.createProduct(user, body, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result }, 201);
  },
);

products.patch(
  '/api/products/:id',
  requireAuth(),
  requirePermission('products:write'),
  validate({ params: productIdParamSchema, body: updateProductSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const body = await c.req.json();
    const result = await productsService.updateProduct(user, id, body, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result });
  },
);

products.delete(
  '/api/products/:id',
  requireAuth(),
  requirePermission('products:delete'),
  validate({ params: productIdParamSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const result = await productsService.softDeleteProduct(user, id, {
      route: c.req.path,
      method: c.req.method,
    });
    return c.json({ success: true, data: result });
  },
);

export default products;
