import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import type { AppEnv } from '../types.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import productsRoutes from './products.js';

const { mockVerifyAccessToken, mockProductsService, mockLogAuditEvent } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockProductsService: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    softDeleteProduct: vi.fn(),
  },
  mockLogAuditEvent: vi.fn(),
}));

vi.mock('../lib/jwt.js', () => ({
  verifyAccessToken: (...args: unknown[]) => mockVerifyAccessToken(...args),
}));

vi.mock('../services/products.js', () => ({
  listProducts: (...args: unknown[]) => mockProductsService.listProducts(...args),
  getProductById: (...args: unknown[]) => mockProductsService.getProductById(...args),
  createProduct: (...args: unknown[]) => mockProductsService.createProduct(...args),
  updateProduct: (...args: unknown[]) => mockProductsService.updateProduct(...args),
  softDeleteProduct: (...args: unknown[]) => mockProductsService.softDeleteProduct(...args),
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

const adminPayload: TokenPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' };
const managerPayload: TokenPayload = { userId: 'mgr-1', businessId: 'biz-1', role: 'manager' };
const cashierPayload: TokenPayload = { userId: 'cash-1', businessId: 'biz-1', role: 'cashier' };
const kitchenPayload: TokenPayload = { userId: 'kit-1', businessId: 'biz-1', role: 'kitchen' };
const superAdminPayload: TokenPayload = { userId: 'sa-1', businessId: '*', role: 'super_admin' };

const sampleProduct: Product = {
  _id: 'p-1',
  businessId: 'biz-1',
  name: 'Empanada',
  description: 'Rica',
  price: 3.5,
  category: 'Entradas',
  sku: 'EMP-001',
  stock: 10,
  isActive: true,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
  createdBy: 'admin-1',
};

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

function createApp() {
  const app = new Hono<AppEnv>();
  app.onError(errorHandler);
  app.route('/', productsRoutes);
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

describe('products routes', () => {
  describe('GET /api/products', () => {
    it('401 without Authorization header', async () => {
      const app = createApp();
      const res = await app.request('/api/products');

      expect(res.status).toBe(401);
      expect(mockProductsService.listProducts).not.toHaveBeenCalled();
    });

    it('admin lists products → 200', async () => {
      mockProductsService.listProducts.mockResolvedValue([sampleProduct]);

      const app = createApp();
      const res = await app.request('/api/products', withToken(adminPayload));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: unknown[] };
      expect(body.data).toHaveLength(1);
    });

    it('cashier has products:read → 200', async () => {
      mockProductsService.listProducts.mockResolvedValue([]);

      const app = createApp();
      const res = await app.request('/api/products', withToken(cashierPayload));

      expect(res.status).toBe(200);
    });

    it('kitchen lacks products:read → 403 + audit', async () => {
      const app = createApp();
      const res = await app.request('/api/products', withToken(kitchenPayload));

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'products:read' }),
        }),
      );
      expect(mockProductsService.listProducts).not.toHaveBeenCalled();
    });

    it('super_admin with ?businessId= propagates the query', async () => {
      mockProductsService.listProducts.mockResolvedValue([]);

      const app = createApp();
      const res = await app.request(
        '/api/products?businessId=biz-99',
        withToken(superAdminPayload),
      );

      expect(res.status).toBe(200);
      expect(mockProductsService.listProducts).toHaveBeenCalledWith(
        superAdminPayload,
        expect.objectContaining({ businessId: 'biz-99' }),
      );
    });
  });

  describe('GET /api/products/:id', () => {
    it('400 on invalid uuid', async () => {
      const app = createApp();
      const res = await app.request('/api/products/not-a-uuid', withToken(adminPayload));

      expect(res.status).toBe(400);
    });

    it('cross-tenant → 404', async () => {
      mockProductsService.getProductById.mockRejectedValue(new NotFoundError('Product'));

      const app = createApp();
      const res = await app.request(`/api/products/${VALID_UUID}`, withToken(adminPayload));

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/products', () => {
    const body = {
      name: 'Nuevo',
      description: 'desc',
      price: 5,
      category: 'Entradas',
      sku: 'NEW-1',
      stock: 3,
    };

    it('admin creates → 201', async () => {
      mockProductsService.createProduct.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );

      expect(res.status).toBe(201);
    });

    it('manager creates → 201 (has products:write)', async () => {
      mockProductsService.createProduct.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(managerPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );

      expect(res.status).toBe(201);
    });

    it('cashier → 403 + audit products:write', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(cashierPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'products:write' }),
        }),
      );
      expect(mockProductsService.createProduct).not.toHaveBeenCalled();
    });

    it('400 on invalid body', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: '' }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockProductsService.createProduct).not.toHaveBeenCalled();
    });

    it('service 409 DUPLICATE_SKU propagates as 409', async () => {
      mockProductsService.createProduct.mockRejectedValue(
        new AppError('A product with this SKU already exists', 409, 'DUPLICATE_SKU'),
      );

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );

      expect(res.status).toBe(409);
      const resBody = (await res.json()) as { code: string };
      expect(resBody.code).toBe('DUPLICATE_SKU');
    });
  });

  describe('PATCH /api/products/:id', () => {
    it('admin patches → 200', async () => {
      mockProductsService.updateProduct.mockResolvedValue({ ...sampleProduct, name: 'X' });

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(adminPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X' }),
        }),
      );

      expect(res.status).toBe(200);
    });

    it('manager patches → 200', async () => {
      mockProductsService.updateProduct.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(managerPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X' }),
        }),
      );

      expect(res.status).toBe(200);
    });

    it('empty body → 400 (refine)', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(adminPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }),
      );

      expect(res.status).toBe(400);
    });

    it('cashier → 403', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(cashierPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'X' }),
        }),
      );

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('admin deactivates → 200 with isActive:false', async () => {
      mockProductsService.softDeleteProduct.mockResolvedValue({
        ...sampleProduct,
        isActive: false,
      });

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(adminPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { isActive: boolean } };
      expect(body.data.isActive).toBe(false);
    });

    it('manager lacks products:delete → 403 + audit', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(managerPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'products:delete' }),
        }),
      );
      expect(mockProductsService.softDeleteProduct).not.toHaveBeenCalled();
    });

    it('cashier → 403', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(cashierPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      expect(mockProductsService.softDeleteProduct).not.toHaveBeenCalled();
    });
  });
});
