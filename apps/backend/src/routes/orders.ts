import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { validate } from '../middleware/validation.js';
import {
  createOrderSchema,
  orderParamsSchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type UpdateOrderStatusInput,
} from '../schemas/orders.js';
import * as ordersService from '../services/orders.js';

const orders = new Hono<AppEnv>();

orders.post(
  '/api/orders',
  requireAuth(),
  requirePermission('orders:create'),
  validate({ body: createOrderSchema }),
  async (c) => {
    const user = c.get('user')!;
    const body = (await c.req.json()) as CreateOrderInput;
    const result = await ordersService.createOrder(user, body);
    return c.json({ success: true, data: result }, 201);
  },
);

orders.patch(
  '/api/orders/:id/status',
  requireAuth(),
  requirePermission('orders:update'),
  validate({ params: orderParamsSchema, body: updateOrderStatusSchema }),
  async (c) => {
    const user = c.get('user')!;
    const id = c.req.param('id');
    const body = (await c.req.json()) as UpdateOrderStatusInput;
    const result = await ordersService.updateOrderStatus(user, id, body.status);
    return c.json({ success: true, data: result });
  },
);

export default orders;
