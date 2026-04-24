import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import type { AppEnv } from '../types.js';
import { errorHandler } from '../middleware/error-handler.js';
import { AppError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import productsRoutes from './products.js';

const { mockVerifyAccessToken, mockProductsService, mockLogAuditEvent } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
  mockProductsService: {
    listProducts: vi.fn(),
    getProductById: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    generateUploadUrl: vi.fn(),
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
  deleteProduct: (...args: unknown[]) => mockProductsService.deleteProduct(...args),
  generateUploadUrl: (...args: unknown[]) => mockProductsService.generateUploadUrl(...args),
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

const VALID_UUID = '123e4567-e89b-42d3-a456-426614174000';

const adminPayload: TokenPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' };
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
const cashierBranchB: TokenPayload = {
  userId: 'cash-2',
  businessId: 'biz-1',
  role: 'cashier',
  branchIds: ['br-2'],
};

const now = new Date('2026-04-23T00:00:00Z');

const sampleProduct: Product = {
  _id: VALID_UUID,
  businessId: 'biz-1',
  branchId: 'br-1',
  name: 'Arroz con Pollo',
  description: '',
  price: 12.5,
  category: 'Entradas',
  sku: 'ARR-001',
  stock: 10,
  trackStock: true,
  stockUnit: 'unit',
  availability: { pos: true, online: false, kiosk: false },
  serviceSchedules: [],
  allergens: [],
  dietaryTags: [],
  modifierGroups: [],
  kitchenStationIds: [],
  isActive: true,
  createdAt: now,
  updatedAt: now,
  createdBy: 'admin-1',
};

const validCreateBody = {
  branchId: 'br-1',
  name: 'New Product',
  description: '',
  price: 5,
  category: 'Entradas',
  sku: 'NEW-001',
  stock: 5,
};

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
    it('401 without Authorization', async () => {
      const app = createApp();
      const res = await app.request('/api/products?branchId=br-1');

      expect(res.status).toBe(401);
    });

    it('400 when branchId is missing', async () => {
      const app = createApp();
      const res = await app.request('/api/products', withToken(adminPayload));

      expect(res.status).toBe(400);
    });

    it('admin lists products in a branch → 200', async () => {
      mockProductsService.listProducts.mockResolvedValue([sampleProduct]);

      const app = createApp();
      const res = await app.request('/api/products?branchId=br-1', withToken(adminPayload));

      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; data: Product[] };
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });

    it('cashier from branch B listing branch A → 403 (requireBranchAccess)', async () => {
      const app = createApp();
      const res = await app.request('/api/products?branchId=br-1', withToken(cashierBranchB));

      expect(res.status).toBe(403);
      expect(mockProductsService.listProducts).not.toHaveBeenCalled();
    });

    it('cashier without products:read (kitchen role) → 403 + audit', async () => {
      const kitchenPayload: TokenPayload = {
        userId: 'k-1',
        businessId: 'biz-1',
        role: 'kitchen',
        branchIds: ['br-1'],
      };

      const app = createApp();
      const res = await app.request('/api/products?branchId=br-1', withToken(kitchenPayload));

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'products:read' }),
        }),
      );
    });
  });

  describe('GET /api/products/:id', () => {
    it('admin gets a product → 200', async () => {
      mockProductsService.getProductById.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(`/api/products/${VALID_UUID}`, withToken(adminPayload));

      expect(res.status).toBe(200);
    });

    it('service returning NotFoundError → 404 (cross-tenant/cross-branch)', async () => {
      mockProductsService.getProductById.mockRejectedValue(new NotFoundError('Product'));

      const app = createApp();
      const res = await app.request(`/api/products/${VALID_UUID}`, withToken(adminPayload));

      expect(res.status).toBe(404);
    });

    it('rejects non-uuid id with 400', async () => {
      const app = createApp();
      const res = await app.request('/api/products/not-a-uuid', withToken(adminPayload));

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/products', () => {
    it('admin creates a product → 201', async () => {
      mockProductsService.createProduct.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validCreateBody),
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as { success: boolean; data: Product };
      expect(body.success).toBe(true);
      expect(body.data._id).toBe(VALID_UUID);
    });

    it('cashier → 403 + audit (lacks products:write)', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(cashierPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validCreateBody),
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

    it('returns 409 SKU_ALREADY_EXISTS on duplicate SKU', async () => {
      mockProductsService.createProduct.mockRejectedValue(
        new AppError(
          'A product with this SKU already exists in this branch',
          409,
          'SKU_ALREADY_EXISTS',
          [{ field: 'sku', message: 'SKU already exists in this branch' }],
        ),
      );

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validCreateBody),
        }),
      );

      expect(res.status).toBe(409);
      const body = (await res.json()) as { code: string; details?: Array<{ field: string }> };
      expect(body.code).toBe('SKU_ALREADY_EXISTS');
      expect(body.details?.[0].field).toBe('sku');
    });

    it('service-level ForbiddenError surfaces as 403 (cross-branch)', async () => {
      mockProductsService.createProduct.mockRejectedValue(
        new ForbiddenError('Access denied to this branch'),
      );

      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validCreateBody),
        }),
      );

      expect(res.status).toBe(403);
    });

    it('rejects invalid body with 400', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Missing required fields' }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockProductsService.createProduct).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /api/products/:id', () => {
    it('admin patches a product → 200', async () => {
      mockProductsService.updateProduct.mockResolvedValue({ ...sampleProduct, price: 20 });

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(adminPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 20 }),
        }),
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { price: number } };
      expect(body.data.price).toBe(20);
    });

    it('manager gets 200 too (has products:write)', async () => {
      mockProductsService.updateProduct.mockResolvedValue(sampleProduct);

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(managerPayload, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ price: 10 }),
        }),
      );

      expect(res.status).toBe(200);
    });

    it('rejects empty body with 400', async () => {
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
  });

  describe('DELETE /api/products/:id', () => {
    it('admin deletes → 204 No Content (empty body)', async () => {
      mockProductsService.deleteProduct.mockResolvedValue(undefined);

      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(adminPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('manager → 403 (lacks products:delete) + audit', async () => {
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
      expect(mockProductsService.deleteProduct).not.toHaveBeenCalled();
    });

    it('cashier → 403 (lacks products:delete)', async () => {
      const app = createApp();
      const res = await app.request(
        `/api/products/${VALID_UUID}`,
        withToken(cashierPayload, { method: 'DELETE' }),
      );

      expect(res.status).toBe(403);
      expect(mockProductsService.deleteProduct).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/products/upload-url', () => {
    it('admin → 201 with shape', async () => {
      mockProductsService.generateUploadUrl.mockResolvedValue({
        uploadUrl: 'https://bucket.s3.amazonaws.com/products/br-1/x.jpg?sig=abc',
        publicUrl: 'https://cdn.example.com/products/br-1/x.jpg',
        expiresIn: 60,
      });

      const app = createApp();
      const res = await app.request(
        '/api/products/upload-url',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: 'br-1',
            contentType: 'image/jpeg',
            fileSize: 100_000,
          }),
        }),
      );

      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        success: boolean;
        data: { uploadUrl: string; publicUrl: string; expiresIn: number };
      };
      expect(body.data.uploadUrl).toContain('sig=abc');
      expect(body.data.expiresIn).toBe(60);
    });

    it('400 on bad contentType', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products/upload-url',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: 'br-1',
            contentType: 'application/pdf',
            fileSize: 100,
          }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockProductsService.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('400 when fileSize exceeds 2 MB', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products/upload-url',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: 'br-1',
            contentType: 'image/jpeg',
            fileSize: 3 * 1024 * 1024,
          }),
        }),
      );

      expect(res.status).toBe(400);
      expect(mockProductsService.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('cashier → 403 + audit', async () => {
      const app = createApp();
      const res = await app.request(
        '/api/products/upload-url',
        withToken(cashierPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: 'br-1',
            contentType: 'image/jpeg',
            fileSize: 100,
          }),
        }),
      );

      expect(res.status).toBe(403);
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ permission: 'products:write' }),
        }),
      );
      expect(mockProductsService.generateUploadUrl).not.toHaveBeenCalled();
    });

    it('503 when ASSETS_NOT_CONFIGURED surfaces from service', async () => {
      mockProductsService.generateUploadUrl.mockRejectedValue(
        new AppError('Assets bucket is not configured', 503, 'ASSETS_NOT_CONFIGURED'),
      );

      const app = createApp();
      const res = await app.request(
        '/api/products/upload-url',
        withToken(adminPayload, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branchId: 'br-1',
            contentType: 'image/jpeg',
            fileSize: 100,
          }),
        }),
      );

      expect(res.status).toBe(503);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('ASSETS_NOT_CONFIGURED');
    });
  });
});
