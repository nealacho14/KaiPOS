import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../types.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import * as branchesService from '../services/branches.js';

const listBranchesQuerySchema = z.object({
  businessId: z.string().min(1).optional(),
});

const branches = new Hono<AppEnv>();

// Read-only listing of branches the caller can access. Any authenticated user
// sees the branches they're assigned to (`user.branchIds`); users with
// `branches:manage` see every branch in their business. Used by the admin shell
// to resolve branch ids → names without exposing the full Branch record.
branches.get(
  '/api/branches',
  requireAuth(),
  validate({ query: listBranchesQuerySchema }),
  async (c) => {
    const user = c.get('user')!;
    const query = c.req.query();
    const result = await branchesService.listAccessibleBranches(user, {
      businessId: query.businessId,
    });
    return c.json({
      success: true,
      data: { branches: result.map((b) => ({ _id: b._id, name: b.name })) },
    });
  },
);

export default branches;
