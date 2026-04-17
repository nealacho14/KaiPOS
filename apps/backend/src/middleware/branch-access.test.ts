import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireBranchAccess } from './branch-access.js';

function createApp() {
  const app = new Hono<AppEnv>();

  app.use('/branch/:branchId/*', async (c, next) => {
    const userJson = c.req.header('X-Test-User');
    if (userJson) {
      c.set('user', JSON.parse(userJson));
    }
    await next();
  });

  app.use('/branch/:branchId/*', requireBranchAccess('branchId'));

  app.get('/branch/:branchId/data', (c) => {
    return c.json({ branch: c.req.param('branchId') });
  });

  app.onError((err, c) => {
    const status = 'statusCode' in err ? (err.statusCode as number) : 500;
    return c.json({ error: err.message }, status as 200);
  });

  return app;
}

describe('requireBranchAccess middleware', () => {
  const superAdminUser = JSON.stringify({
    userId: 'su1',
    businessId: '*',
    role: 'super_admin',
  });
  const adminUser = JSON.stringify({ userId: 'u1', businessId: 'biz-1', role: 'admin' });
  const managerUser = JSON.stringify({
    userId: 'm1',
    businessId: 'biz-1',
    role: 'manager',
    branchIds: ['branch-1', 'branch-2'],
  });
  const cashierWithBranches = JSON.stringify({
    userId: 'u2',
    businessId: 'biz-1',
    role: 'cashier',
    branchIds: ['branch-1', 'branch-2'],
  });
  const cashierNoBranches = JSON.stringify({
    userId: 'u3',
    businessId: 'biz-1',
    role: 'cashier',
  });

  it('allows super_admin access to any branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': superAdminUser },
    });

    expect(res.status).toBe(200);
  });

  it('allows admin access to any branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': adminUser },
    });

    expect(res.status).toBe(200);
  });

  it('allows manager access to their assigned branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': managerUser },
    });

    expect(res.status).toBe(200);
  });

  it('denies manager access to an unassigned branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': managerUser },
    });

    expect(res.status).toBe(403);
  });

  it('allows cashier access to their assigned branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': cashierWithBranches },
    });

    expect(res.status).toBe(200);
  });

  it('denies cashier access to unassigned branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': cashierWithBranches },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Access denied');
  });

  it('denies access when user token has no branchIds', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': cashierNoBranches },
    });

    expect(res.status).toBe(403);
  });

  it('returns 403 when no user is set on context', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-1/data');

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Authentication required');
  });
});
