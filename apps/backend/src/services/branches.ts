import type { Filter } from 'mongodb';
import type { Branch, TokenPayload } from '@kaipos/shared';
import { SUPER_ADMIN_BUSINESS_ID, hasPermission } from '@kaipos/shared';
import { getBranchesCollection } from '../db/collections.js';
import { AppError } from '../lib/errors.js';

export interface ListBranchesQuery {
  businessId?: string;
}

export async function listAccessibleBranches(
  actor: TokenPayload,
  query: ListBranchesQuery = {},
): Promise<Branch[]> {
  const branches = await getBranchesCollection();
  const canManage = hasPermission(actor.role, 'branches:manage');

  const filter: Filter<Branch> = { isActive: true };

  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    if (!query.businessId) {
      throw new AppError(
        'super_admin must specify a target businessId',
        400,
        'MISSING_TARGET_BUSINESS_ID',
      );
    }
    filter.businessId = query.businessId;
  } else {
    filter.businessId = actor.businessId;
    if (!canManage) {
      const ids = actor.branchIds ?? [];
      if (ids.length === 0) return [];
      filter._id = { $in: ids };
    }
  }

  return branches.find(filter).toArray();
}
