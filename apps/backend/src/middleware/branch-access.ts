import type { MiddlewareHandler } from 'hono';
import type { TokenPayload } from '@kaipos/shared/types';
import { hasPermission } from '@kaipos/shared/permissions';
import { ForbiddenError } from '../lib/errors.js';
import type { AppEnv } from '../types.js';

/**
 * Returns true when the actor may access `branchId`. Roles with
 * `branches:manage` (admin, super_admin) bypass; others must have the
 * branch in their token's `branchIds` cache.
 */
export function canAccessBranch(actor: TokenPayload, branchId: string): boolean {
  if (hasPermission(actor.role, 'branches:manage')) return true;
  return actor.branchIds?.includes(branchId) ?? false;
}

export function assertBranchAccess(actor: TokenPayload, branchId: string): void {
  if (!canAccessBranch(actor, branchId)) {
    throw new ForbiddenError('Access denied to this branch');
  }
}

/**
 * Where to look for the branchId. `auto` (default) checks path param → query
 * → JSON body in that order. Pass `body` to force body-only when the same key
 * could also appear in the path (e.g. POST /reorder with `branchId` in body).
 */
export type BranchIdSource = 'auto' | 'param' | 'query' | 'body';

export function requireBranchAccess(
  paramName: string,
  source: BranchIdSource = 'auto',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get('user');
    if (!user) {
      throw new ForbiddenError('Authentication required');
    }

    let branchId: string | undefined;
    if (source === 'param') {
      branchId = c.req.param(paramName);
    } else if (source === 'query') {
      branchId = c.req.query(paramName);
    } else if (source === 'body') {
      branchId = await readBranchIdFromBody(c, paramName);
    } else {
      branchId =
        c.req.param(paramName) ??
        c.req.query(paramName) ??
        (await readBranchIdFromBody(c, paramName));
    }

    if (!branchId) {
      throw new ForbiddenError('Branch ID is required');
    }

    assertBranchAccess(user, branchId);
    await next();
  };
}

async function readBranchIdFromBody(
  c: Parameters<MiddlewareHandler<AppEnv>>[0],
  key: string,
): Promise<string | undefined> {
  // Hono caches parsed JSON, so this read is safe to repeat downstream
  // (e.g. inside the route handler that re-parses with Zod).
  try {
    const body = (await c.req.json()) as Record<string, unknown> | null;
    const value = body?.[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}
