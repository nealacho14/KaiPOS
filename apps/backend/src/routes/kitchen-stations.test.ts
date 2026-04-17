import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { TokenPayload, KitchenStation } from '@kaipos/shared/types';
import type { AppEnv } from '../types.js';
import { errorHandler } from '../middleware/error-handler.js';
import { ForbiddenError } from '../lib/errors.js';
import kitchenStationsRoutes from './kitchen-stations.js';

const { mockVerifyAccessToken, mockService, mockLogAuditEvent } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockService: {
    listByBranch: vi.fn(),
    create: vi.fn(),
  },
  mockLogAuditEvent: vi.fn(),
}));

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

vi.mock('../services/kitchen-stations.js', () => ({
  listByBranch: (...args: unknown[]) => mockService.listByBranch(...args),
  create: (...args: unknown[]) => mockService.create(...args),
}));

vi.mock('../services/audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  },
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

const managerPayload: TokenPayload = {
  userId: 'mgr-1',
  businessId: 'biz-1',
  role: 'manager',
  branchIds: ['br-1'],
};

const cashierPayload: TokenPayload = {
  userId: 'cash-1',
  businessId: 'biz-1',
  role: 'cashier',
  branchIds: ['br-1'],
};

const kitchenPayload: TokenPayload = {
  userId: 'k-1',
  businessId: 'biz-1',
  role: 'kitchen',
  branchIds: ['br-1'],
};

const sampleStation: KitchenStation = {
  _id: 'st-1',
  businessId: 'biz-1',
  branchId: 'br-1',
  name: 'Cocina caliente',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  createdBy: 'mgr-1',
};

function createApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', kitchenStationsRoutes);
  return app;
}

function withToken(payload: TokenPayload, init?: RequestInit): RequestInit {
  mockVerifyAccessToken.mockResolvedValue(payload);
  return {
    ...init,
    headers: {
      Authorization: 'Bearer fake-token',
      ...(init?.headers as Record<string, string> | undefined),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kitchen-stations routes', () => {
  describe('GET /api/kitchen-stations', () => {
    it('returns 401 without an Authorization header', async () => {
      const res = await createApp().request('/api/kitchen-stations?branchId=br-1');

      expect(res.status).toBe(401);
      expect(mockService.listByBranch).not.toHaveBeenCalled();
    });

    it('returns 400 when branchId query param is missing', async () => {
      const res = await createApp().request('/api/kitchen-stations', withToken(managerPayload));

      expect(res.status).toBe(400);
      expect(mockService.listByBranch).not.toHaveBeenCalled();
    });

    it('manager lists stations in their branch', async () => {
      mockService.listByBranch.mockResolvedValue([sampleStation]);

      const res = await createApp().request(
        '/api/kitchen-stations?branchId=br-1',
        withToken(managerPayload),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: unknown[] };
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(mockService.listByBranch).toHaveBeenCalledWith(managerPayload, 'br-1');
    });

    it('kitchen role can read kitchen stations', async () => {
      mockService.listByBranch.mockResolvedValue([]);

      const res = await createApp().request(
        '/api/kitchen-stations?branchId=br-1',
        withToken(kitchenPayload),
      );

      expect(res.status).toBe(200);
      expect(mockService.listByBranch).toHaveBeenCalled();
    });

    it('403 when the user tries to list stations of a branch outside branchIds', async () => {
      const res = await createApp().request(
        '/api/kitchen-stations?branchId=br-other',
        withToken(kitchenPayload),
      );

      expect(res.status).toBe(403);
      expect(mockService.listByBranch).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/kitchen-stations', () => {
    it('manager creates a station → 201', async () => {
      mockService.create.mockResolvedValue(sampleStation);

      const res = await createApp().request(
        '/api/kitchen-stations',
        withToken(managerPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'br-1', name: 'Parrilla' }),
        }),
      );

      expect(res.status).toBe(201);
      expect(mockService.create).toHaveBeenCalledWith(managerPayload, {
        branchId: 'br-1',
        name: 'Parrilla',
      });
    });

    it('cashier gets 403 and logs authorization_failed (lacks kitchen_stations:write)', async () => {
      const res = await createApp().request(
        '/api/kitchen-stations',
        withToken(cashierPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'br-1', name: 'Parrilla' }),
        }),
      );

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'kitchen_stations:write' }),
        }),
      );
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('kitchen role is forbidden from POST (read-only access)', async () => {
      const res = await createApp().request(
        '/api/kitchen-stations',
        withToken(kitchenPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'br-1', name: 'Parrilla' }),
        }),
      );

      expect(res.status).toBe(403);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('rejects invalid body with 400', async () => {
      const res = await createApp().request(
        '/api/kitchen-stations',
        withToken(managerPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: '', name: '' }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockService.create).not.toHaveBeenCalled();
    });

    it('service-layer branch access failure surfaces as 403', async () => {
      mockService.create.mockRejectedValue(new ForbiddenError('Access denied to this branch'));

      const res = await createApp().request(
        '/api/kitchen-stations',
        withToken(managerPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branchId: 'br-other', name: 'Parrilla' }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });
});
