import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { requireBranchAccess } from './branch-access.js';

const mockUsersCollection = {
  findOne: vi.fn(),
};

vi.mock('../db/collections.js', () => ({
  getUsersCollection: () => Promise.resolve(mockUsersCollection),
}));

function createApp() {
  const app = new Hono<AppEnv>();

  // Simulate auth middleware by injecting user from a custom header
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('requireBranchAccess middleware', () => {
  const adminUser = JSON.stringify({ userId: 'u1', businessId: 'biz-1', role: 'admin' });
  const cashierUser = JSON.stringify({ userId: 'u2', businessId: 'biz-1', role: 'cashier' });

  it('allows admin access to any branch', async () => {
    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': adminUser },
    });

    expect(res.status).toBe(200);
    expect(mockUsersCollection.findOne).not.toHaveBeenCalled();
  });

  it('allows cashier access to their assigned branch', async () => {
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'u2',
      branchIds: ['branch-1', 'branch-2'],
    });

    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': cashierUser },
    });

    expect(res.status).toBe(200);
  });

  it('denies cashier access to unassigned branch', async () => {
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'u2',
      branchIds: ['branch-1'],
    });

    const app = createApp();
    const res = await app.request('/branch/branch-99/data', {
      headers: { 'X-Test-User': cashierUser },
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('Access denied');
  });

  it('denies access when user has no branchIds', async () => {
    mockUsersCollection.findOne.mockResolvedValue({
      _id: 'u2',
      branchIds: undefined,
    });

    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': cashierUser },
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

  it('denies when user not found in DB', async () => {
    mockUsersCollection.findOne.mockResolvedValue(null);

    const app = createApp();
    const res = await app.request('/branch/branch-1/data', {
      headers: { 'X-Test-User': cashierUser },
    });

    expect(res.status).toBe(403);
  });
});
