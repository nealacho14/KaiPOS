import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/authorize.js';
import { requireBranchAccess } from '../middleware/branch-access.js';
import { validate } from '../middleware/validation.js';
import {
  createKitchenStationSchema,
  listKitchenStationsQuerySchema,
} from '../schemas/kitchen-stations.js';
import * as kitchenStationsService from '../services/kitchen-stations.js';
import { toPaginatedResponse } from '../lib/paginate.js';

const kitchenStations = new Hono<AppEnv>();

kitchenStations.get(
  '/api/kitchen-stations',
  requireAuth(),
  requirePermission('kitchen_stations:read'),
  validate({ query: listKitchenStationsQuerySchema }),
  requireBranchAccess('branchId'),
  async (c) => {
    const user = c.get('user')!;
    const parsed = listKitchenStationsQuerySchema.parse(c.req.query());
    const result = await kitchenStationsService.listByBranch(user, parsed.branchId, {
      page: parsed.page,
      limit: parsed.limit,
    });
    return c.json(toPaginatedResponse(result));
  },
);

kitchenStations.post(
  '/api/kitchen-stations',
  requireAuth(),
  requirePermission('kitchen_stations:write'),
  validate({ body: createKitchenStationSchema }),
  async (c) => {
    const user = c.get('user')!;
    const body = (await c.req.json()) as { branchId: string; name: string };
    // Branch access is enforced in the service layer because requireBranchAccess
    // middleware only reads from params/query, not request body.
    const result = await kitchenStationsService.create(user, body);
    return c.json({ success: true, data: result }, 201);
  },
);

export default kitchenStations;
