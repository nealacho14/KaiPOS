import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import type { CreateProductInput } from '../schemas/products.js';
import {
  createProduct,
  deleteProduct,
  generateUploadUrl,
  getProductById,
  listProducts,
  reorderProducts,
  updateProduct,
} from './products.js';

const {
  mockProducts,
  mockKitchenStations,
  mockBranches,
  mockCategories,
  mockProductPreferences,
  mockLogAudit,
  mockGetSignedUrl,
  mockPublishToChannel,
} = vi.hoisted(() => ({
  mockProducts: {
    find: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
    bulkWrite: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
  mockKitchenStations: {
    find: vi.fn(),
  },
  mockBranches: {
    findOne: vi.fn(),
  },
  mockCategories: {
    find: vi.fn(),
  },
  mockProductPreferences: {
    find: vi.fn(),
  },
  mockLogAudit: vi.fn(),
  mockGetSignedUrl: vi.fn(),
  mockPublishToChannel: vi.fn(),
}));

vi.mock('../db/collections.js', () => ({
  getProductsCollection: () => Promise.resolve(mockProducts),
  getKitchenStationsCollection: () => Promise.resolve(mockKitchenStations),
  getBranchesCollection: () => Promise.resolve(mockBranches),
  getCategoriesCollection: () => Promise.resolve(mockCategories),
  getProductPreferencesCollection: () => Promise.resolve(mockProductPreferences),
}));

vi.mock('./audit.js', () => ({
  logAuditEvent: mockLogAudit,
}));

vi.mock('../lib/ws-publish.js', () => ({
  publishToChannel: mockPublishToChannel,
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class MockS3Client {
    constructor(_config?: unknown) {
      /* noop */
    }
  },
  PutObjectCommand: class MockPutObjectCommand {
    public readonly input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));

const now = new Date('2026-04-23T00:00:00Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p-1',
    businessId: 'biz-1',
    branchId: 'br-1',
    name: 'Arroz con Pollo',
    description: 'Plato tradicional',
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
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'admin-1',
    ...overrides,
  };
}

const adminPayload: TokenPayload = {
  userId: 'admin-1',
  businessId: 'biz-1',
  role: 'admin',
};

const managerBranchA: TokenPayload = {
  userId: 'mgr-1',
  businessId: 'biz-1',
  role: 'manager',
  branchIds: ['br-1'],
};

const cashierBranchA: TokenPayload = {
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

const superAdminPayload: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

const ctx = { route: '/api/products/p-1', method: 'PATCH' };

function mockFindReturns(docs: Product[]): void {
  mockProducts.find.mockReturnValue({
    collation: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    toArray: () => Promise.resolve(docs),
  });
  mockProducts.countDocuments.mockResolvedValue(docs.length);
  // Default — the category enrichment runs when no `q` is set. Returning
  // an empty array makes every category sort to 0, which keeps the original
  // mongo-order assertions stable.
  mockCategories.find.mockReturnValue({ toArray: () => Promise.resolve([]) });
}

function mockKitchenStationFindReturns(ids: string[]): void {
  mockKitchenStations.find.mockReturnValue({
    toArray: () => Promise.resolve(ids.map((id) => ({ _id: id }))),
  });
}

const validCreateInput: CreateProductInput = {
  branchId: 'br-1',
  name: 'New Product',
  description: '',
  price: 5,
  category: 'Entradas',
  sku: 'NEW-001',
  stock: 5,
  trackStock: true,
  stockUnit: 'unit',
  availability: { pos: true, online: false, kiosk: false },
  serviceSchedules: [],
  allergens: [],
  dietaryTags: [],
  modifierGroups: [],
  kitchenStationIds: [],
  sortOrder: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProducts.insertOne.mockResolvedValue({});
  mockProducts.updateOne.mockResolvedValue({ matchedCount: 1 });
});

describe('products service', () => {
  describe('listProducts', () => {
    it('scopes non-super_admin by actor.businessId and required branchId', async () => {
      mockFindReturns([makeProduct()]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        { branchId: 'br-1', businessId: 'biz-1', isActive: true },
        { projection: { modifierGroups: 0 } },
      );
    });

    it('applies anchored prefix q across name, sku, and barcode (case-insensitive)', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        q: 'arroz',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: '^arroz', $options: 'i' } },
            { sku: { $regex: '^arroz', $options: 'i' } },
            { barcode: { $regex: '^arroz', $options: 'i' } },
          ],
        }),
        expect.anything(),
      );
    });

    it('case-insensitive search: uppercase query still uses $options: i', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        q: 'POLLO',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: '^POLLO', $options: 'i' } },
            { sku: { $regex: '^POLLO', $options: 'i' } },
            { barcode: { $regex: '^POLLO', $options: 'i' } },
          ],
        }),
        expect.anything(),
      );
    });

    it('scopes by category when provided', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        category: 'Entradas',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Entradas' }),
        expect.anything(),
      );
    });

    it('includeInactive removes the isActive filter', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        includeInactive: true,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      const call = mockProducts.find.mock.calls[0][0];
      expect(call).not.toHaveProperty('isActive');
    });

    it('super_admin with no businessId query returns unscoped by business', async () => {
      mockFindReturns([]);

      await listProducts(superAdminPayload, {
        branchId: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      const call = mockProducts.find.mock.calls[0][0];
      expect(call).not.toHaveProperty('businessId');
    });

    it('super_admin with ?businessId filters by that businessId', async () => {
      mockFindReturns([]);

      await listProducts(superAdminPayload, {
        branchId: 'br-1',
        businessId: 'biz-99',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-99' }),
        expect.anything(),
      );
    });
  });

  describe('getProductById', () => {
    it('returns the product when within tenant + branch access', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct());

      const result = await getProductById(adminPayload, 'p-1');

      expect(result._id).toBe('p-1');
    });

    it('throws 404 when the product is in another business', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ businessId: 'biz-other' }));

      await expect(getProductById(adminPayload, 'p-1')).rejects.toThrow('Product not found');
    });

    it('throws 404 when the product is in a branch the actor cannot access', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-2' }));

      await expect(getProductById(cashierBranchA, 'p-1')).rejects.toThrow('Product not found');
    });

    it('admin (branches:manage) bypasses branch restriction', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-99' }));

      const result = await getProductById(adminPayload, 'p-1');

      expect(result.branchId).toBe('br-99');
    });

    it('super_admin can fetch across businesses', async () => {
      mockProducts.findOne.mockResolvedValue(
        makeProduct({ businessId: 'biz-other', branchId: 'br-99' }),
      );

      const result = await getProductById(superAdminPayload, 'p-1');

      expect(result.businessId).toBe('biz-other');
    });
  });

  describe('createProduct', () => {
    it('admin creates a product in a branch they manage', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);

      const result = await createProduct(adminPayload, validCreateInput);

      expect(result.businessId).toBe('biz-1');
      expect(result.branchId).toBe('br-1');
      expect(result.isActive).toBe(true);
      expect(mockProducts.insertOne).toHaveBeenCalledOnce();
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_created', target: result._id }),
      );
    });

    it('cashier assigned to branch A cannot create in branch B (403)', async () => {
      await expect(
        createProduct(cashierBranchB, { ...validCreateInput, branchId: 'br-1' }),
      ).rejects.toThrow('Access denied to this branch');

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });

    it('returns 409 SKU_ALREADY_EXISTS on duplicate SKU in same branch', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ sku: 'NEW-001' }));

      await expect(createProduct(adminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 409,
        code: 'SKU_ALREADY_EXISTS',
        details: [expect.objectContaining({ field: 'sku' })],
      });

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });

    it('maps Mongo duplicate key error (race) to 409 SKU_ALREADY_EXISTS', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);
      mockProducts.insertOne.mockRejectedValue(
        Object.assign(new Error('E11000'), {
          code: 11000,
          keyPattern: { branchId: 1, sku: 1 },
        }),
      );

      await expect(createProduct(adminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 409,
        code: 'SKU_ALREADY_EXISTS',
        details: [expect.objectContaining({ field: 'sku' })],
      });
    });

    it('maps Mongo duplicate barcode error to 409 BARCODE_ALREADY_EXISTS', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);
      mockProducts.insertOne.mockRejectedValue(
        Object.assign(new Error('E11000'), {
          code: 11000,
          keyPattern: { branchId: 1, barcode: 1 },
        }),
      );

      await expect(createProduct(adminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 409,
        code: 'BARCODE_ALREADY_EXISTS',
        details: [expect.objectContaining({ field: 'barcode' })],
      });
    });

    it('falls back to errmsg parsing when keyPattern is missing (legacy driver)', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);
      mockProducts.insertOne.mockRejectedValue(
        Object.assign(new Error('E11000'), {
          code: 11000,
          errmsg: 'E11000 duplicate key error collection: products index: branchId_1_barcode_1',
        }),
      );

      await expect(createProduct(adminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 409,
        code: 'BARCODE_ALREADY_EXISTS',
      });
    });

    it('validates kitchenStationIds belong to same branch/business', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      // Only one of the two ids is returned by the kitchen-stations query.
      mockKitchenStationFindReturns(['ks-1']);

      await expect(
        createProduct(adminPayload, {
          ...validCreateInput,
          kitchenStationIds: ['ks-1', 'ks-foreign'],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        details: [expect.objectContaining({ field: 'kitchenStationIds' })],
      });

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });

    it('super_admin cannot create without a concrete business context', async () => {
      await expect(createProduct(superAdminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_TARGET_BUSINESS_ID',
      });

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });
  });

  describe('updateProduct', () => {
    it('admin updates name in their own product', async () => {
      mockProducts.findOne.mockResolvedValueOnce(makeProduct());
      mockProducts.findOne.mockResolvedValueOnce(makeProduct({ name: 'Renamed' }));

      const result = await updateProduct(adminPayload, 'p-1', { name: 'Renamed' }, ctx);

      expect(result.name).toBe('Renamed');
      expect(mockProducts.updateOne).toHaveBeenCalledWith(
        { _id: 'p-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ name: 'Renamed', updatedAt: expect.any(Date) }),
        }),
      );
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_updated' }),
      );
    });

    it('throws 404 when the doc does not exist', async () => {
      mockProducts.findOne.mockResolvedValue(null);

      await expect(updateProduct(adminPayload, 'p-1', { name: 'X' }, ctx)).rejects.toThrow(
        'Product not found',
      );
    });

    it('cross-tenant mutation → 403 + audit', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ businessId: 'biz-other' }));

      await expect(updateProduct(adminPayload, 'p-1', { name: 'X' }, ctx)).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({
            permission: 'products:write',
            route: ctx.route,
            method: ctx.method,
          }),
        }),
      );
    });

    it('cross-branch mutation (same tenant) → 403 + audit', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-2' }));

      await expect(updateProduct(cashierBranchA, 'p-1', { name: 'X' }, ctx)).rejects.toMatchObject({
        statusCode: 403,
      });

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({ branchId: 'br-2' }),
        }),
      );
    });

    it('re-checks SKU uniqueness when SKU changes', async () => {
      mockProducts.findOne.mockResolvedValueOnce(makeProduct({ sku: 'OLD-001' }));
      mockProducts.findOne.mockResolvedValueOnce(makeProduct({ _id: 'p-2', sku: 'NEW-001' }));

      await expect(
        updateProduct(adminPayload, 'p-1', { sku: 'NEW-001' }, ctx),
      ).rejects.toMatchObject({ statusCode: 409, code: 'SKU_ALREADY_EXISTS' });

      expect(mockProducts.updateOne).not.toHaveBeenCalled();
    });

    it('allows same SKU across different branches', async () => {
      mockProducts.findOne.mockResolvedValueOnce(makeProduct({ sku: 'OLD-001' }));
      mockProducts.findOne.mockResolvedValueOnce(null); // SKU query scoped to branch returns none
      mockProducts.findOne.mockResolvedValueOnce(makeProduct({ sku: 'NEW-001' }));

      const result = await updateProduct(adminPayload, 'p-1', { sku: 'NEW-001' }, ctx);

      expect(result.sku).toBe('NEW-001');
    });

    it('maps duplicate barcode on update to 409 BARCODE_ALREADY_EXISTS', async () => {
      // Only the first findOne fires before updateOne throws — using
      // `mockResolvedValue` (not Once) avoids leaking a queued value into
      // the next test, since `vi.clearAllMocks()` doesn't drain Once queues.
      mockProducts.findOne.mockResolvedValue(makeProduct({ sku: 'OLD-001' }));
      mockProducts.updateOne.mockRejectedValue(
        Object.assign(new Error('E11000'), {
          code: 11000,
          keyPattern: { branchId: 1, barcode: 1 },
        }),
      );

      await expect(
        updateProduct(adminPayload, 'p-1', { barcode: '750ML-NEW' }, ctx),
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'BARCODE_ALREADY_EXISTS',
        details: [expect.objectContaining({ field: 'barcode' })],
      });
    });

    it('manager in branch A cannot update a product in branch B (cross-branch)', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-2' }));

      await expect(updateProduct(managerBranchA, 'p-1', { name: 'X' }, ctx)).rejects.toMatchObject({
        statusCode: 403,
      });
    });
  });

  describe('deleteProduct', () => {
    it('soft-deletes an active product (isActive → false)', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ isActive: true }));

      await deleteProduct(adminPayload, 'p-1', ctx);

      expect(mockProducts.updateOne).toHaveBeenCalledWith(
        { _id: 'p-1' },
        expect.objectContaining({
          $set: expect.objectContaining({ isActive: false, updatedAt: expect.any(Date) }),
        }),
      );
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'product_deleted' }),
      );
    });

    it('is idempotent — no updateOne call when already inactive', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ isActive: false }));

      await deleteProduct(adminPayload, 'p-1', ctx);

      expect(mockProducts.updateOne).not.toHaveBeenCalled();
    });

    it('404 when the product does not exist', async () => {
      mockProducts.findOne.mockResolvedValue(null);

      await expect(deleteProduct(adminPayload, 'p-1', ctx)).rejects.toThrow('Product not found');
    });

    it('cross-tenant delete → 403 + audit', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ businessId: 'biz-other' }));

      await expect(deleteProduct(adminPayload, 'p-1', ctx)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'authorization_failed' }),
      );
    });

    it('cross-branch delete → 403 + audit', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-2' }));

      await expect(deleteProduct(cashierBranchA, 'p-1', ctx)).rejects.toMatchObject({
        statusCode: 403,
      });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'authorization_failed' }),
      );
    });
  });

  describe('WebSocket fan-out', () => {
    const baseInput: CreateProductInput = {
      branchId: 'br-1',
      name: 'Arroz con Pollo',
      description: 'Plato tradicional',
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
      sortOrder: 0,
    };

    it('createProduct publishes product.created on the branch channel', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockProducts.insertOne.mockResolvedValue({});

      await createProduct(adminPayload, baseInput);

      expect(mockPublishToChannel).toHaveBeenCalledWith(
        'branch:biz-1:br-1',
        expect.objectContaining({
          type: 'product.created',
          payload: expect.objectContaining({ branchId: 'br-1', name: 'Arroz con Pollo' }),
        }),
      );
    });

    it('updateProduct publishes product.updated', async () => {
      mockProducts.findOne
        .mockResolvedValueOnce(makeProduct())
        .mockResolvedValueOnce(makeProduct({ name: 'Renamed' }));
      mockProducts.updateOne.mockResolvedValue({});

      await updateProduct(adminPayload, 'p-1', { name: 'Renamed' }, ctx);

      expect(mockPublishToChannel).toHaveBeenCalledWith(
        'branch:biz-1:br-1',
        expect.objectContaining({ type: 'product.updated' }),
      );
    });

    it('deleteProduct publishes product.deleted', async () => {
      mockProducts.findOne.mockResolvedValue(makeProduct({ isActive: true }));

      await deleteProduct(adminPayload, 'p-1', ctx);

      expect(mockPublishToChannel).toHaveBeenCalledWith(
        'branch:biz-1:br-1',
        expect.objectContaining({ type: 'product.deleted' }),
      );
    });

    it('updateProduct publishes product.low-stock on the transition into low stock', async () => {
      mockProducts.findOne
        // existing: stock 10, threshold 5 — not low
        .mockResolvedValueOnce(makeProduct({ stock: 10, lowStockThreshold: 5 }))
        // updated: stock 4, threshold 5 — low
        .mockResolvedValueOnce(makeProduct({ stock: 4, lowStockThreshold: 5 }));
      mockProducts.updateOne.mockResolvedValue({});

      await updateProduct(adminPayload, 'p-1', { stock: 4 }, ctx);

      const calls = mockPublishToChannel.mock.calls.map(
        ([_, msg]) => (msg as { type: string }).type,
      );
      expect(calls).toContain('product.updated');
      expect(calls).toContain('product.low-stock');
    });

    it('updateProduct does NOT re-emit product.low-stock when already below threshold', async () => {
      mockProducts.findOne
        .mockResolvedValueOnce(makeProduct({ stock: 3, lowStockThreshold: 5 }))
        .mockResolvedValueOnce(makeProduct({ stock: 2, lowStockThreshold: 5 }));
      mockProducts.updateOne.mockResolvedValue({});

      await updateProduct(adminPayload, 'p-1', { stock: 2 }, ctx);

      const calls = mockPublishToChannel.mock.calls.map(
        ([_, msg]) => (msg as { type: string }).type,
      );
      expect(calls).toContain('product.updated');
      expect(calls).not.toContain('product.low-stock');
    });
  });

  describe('generateUploadUrl', () => {
    const ORIGINAL_ENV = { ...process.env };

    beforeEach(() => {
      process.env = { ...ORIGINAL_ENV };
      mockGetSignedUrl.mockResolvedValue(
        'https://bucket.s3.amazonaws.com/products/br-1/uuid.jpg?X-Amz-Signature=x',
      );
    });

    it('returns a pre-signed PUT URL + public CDN URL', async () => {
      process.env.ASSETS_BUCKET_NAME = 'kaipos-assets-prod';
      process.env.ASSETS_CDN_DOMAIN = 'd123.cloudfront.net';

      const result = await generateUploadUrl(adminPayload, {
        branchId: 'br-1',
        contentType: 'image/jpeg',
        fileSize: 100_000,
      });

      expect(result.uploadUrl).toContain('X-Amz-Signature');
      expect(result.publicUrl).toMatch(
        /^https:\/\/d123\.cloudfront\.net\/products\/br-1\/.+\.jpg$/,
      );
      expect(result.expiresIn).toBe(60);
    });

    it('falls back to S3 origin when ASSETS_CDN_DOMAIN unset', async () => {
      process.env.ASSETS_BUCKET_NAME = 'kaipos-assets-prod';
      delete process.env.ASSETS_CDN_DOMAIN;

      const result = await generateUploadUrl(adminPayload, {
        branchId: 'br-1',
        contentType: 'image/png',
        fileSize: 100_000,
      });

      expect(result.publicUrl.startsWith('https://bucket.s3.amazonaws.com/')).toBe(true);
    });

    it('returns 503 ASSETS_NOT_CONFIGURED when ASSETS_BUCKET_NAME unset', async () => {
      delete process.env.ASSETS_BUCKET_NAME;

      await expect(
        generateUploadUrl(adminPayload, {
          branchId: 'br-1',
          contentType: 'image/jpeg',
          fileSize: 100,
        }),
      ).rejects.toMatchObject({ statusCode: 503, code: 'ASSETS_NOT_CONFIGURED' });
    });

    it('forbids when actor does not have access to the branch', async () => {
      process.env.ASSETS_BUCKET_NAME = 'kaipos-assets-prod';

      await expect(
        generateUploadUrl(cashierBranchB, {
          branchId: 'br-1',
          contentType: 'image/jpeg',
          fileSize: 100,
        }),
      ).rejects.toMatchObject({ statusCode: 403 });
    });
  });

  describe('listProducts — Phase 2 extensions', () => {
    it('barcode prefix appears in the $or alongside name and sku', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        q: '750',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: '^750', $options: 'i' } },
            { sku: { $regex: '^750', $options: 'i' } },
            { barcode: { $regex: '^750', $options: 'i' } },
          ],
        }),
        expect.anything(),
      );
    });

    it('featuredIn uses an aggregation pipeline with a productPreferences $lookup', async () => {
      const featuredProduct = makeProduct({ _id: 'p-feat-1' });
      mockProducts.aggregate.mockReturnValue({
        toArray: () => Promise.resolve([{ data: [featuredProduct], meta: [{ total: 1 }] }]),
      });
      mockCategories.find.mockReturnValue({ toArray: () => Promise.resolve([]) });

      const result = await listProducts(adminPayload, {
        branchId: 'br-1',
        featuredIn: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(mockProducts.aggregate).toHaveBeenCalledTimes(1);
      const [pipeline] = mockProducts.aggregate.mock.calls[0]!;
      expect(pipeline[0]).toEqual({
        $match: expect.objectContaining({ branchId: 'br-1', businessId: 'biz-1', isActive: true }),
      });
      const lookupStage = pipeline.find((s: Record<string, unknown>) => '$lookup' in s);
      expect(lookupStage).toBeTruthy();
      expect(lookupStage.$lookup.from).toBe('productPreferences');
      expect(result.data.map((p) => p._id)).toEqual(['p-feat-1']);
      expect(result.total).toBe(1);
      expect(mockProductPreferences.find).not.toHaveBeenCalled();
    });

    it('featuredIn with zero matches returns an empty page from the aggregation', async () => {
      mockProducts.aggregate.mockReturnValue({
        toArray: () => Promise.resolve([{ data: [], meta: [] }]),
      });
      mockCategories.find.mockReturnValue({ toArray: () => Promise.resolve([]) });

      const result = await listProducts(adminPayload, {
        branchId: 'br-1',
        featuredIn: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockProducts.find).not.toHaveBeenCalled();
      expect(mockProductPreferences.find).not.toHaveBeenCalled();
    });

    it('activeNow pushes the availability window into the Mongo filter (paginator total is post-filter)', async () => {
      mockFindReturns([]);
      mockBranches.findOne.mockResolvedValue({ _id: 'br-1', timezone: 'America/Santo_Domingo' });

      // 2026-05-08 16:00Z = 12:00 in DR (Friday).
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 4, 8, 16)));

      await listProducts(adminPayload, {
        branchId: 'br-1',
        includeInactive: false,
        activeNow: true,
        page: 1,
        limit: 50,
      });

      vi.useRealTimers();

      expect(mockProducts.find).toHaveBeenCalledTimes(1);
      const [filterArg] = mockProducts.find.mock.calls[0]!;
      expect(filterArg).toEqual(
        expect.objectContaining({
          $and: expect.arrayContaining([
            expect.objectContaining({ branchId: 'br-1', businessId: 'biz-1', isActive: true }),
            expect.objectContaining({ $expr: expect.objectContaining({ $or: expect.any(Array) }) }),
          ]),
        }),
      );
      // The same combined filter is used for the count call so paginator total
      // reflects the post-filter set.
      expect(mockProducts.countDocuments).toHaveBeenCalledWith(filterArg, undefined);
    });

    it('default sort (no q) orders by category.sortOrder, then product.sortOrder, then name', async () => {
      const docs = [
        makeProduct({ _id: 'a', category: 'Bebidas', sortOrder: 0, name: 'A' }),
        makeProduct({ _id: 'b', category: 'Entradas', sortOrder: 0, name: 'B' }),
        makeProduct({ _id: 'c', category: 'Entradas', sortOrder: 1, name: 'C' }),
        makeProduct({ _id: 'd', category: 'Entradas', sortOrder: 0, name: 'D' }),
      ];
      mockFindReturns(docs);
      mockCategories.find.mockReturnValue({
        toArray: () =>
          Promise.resolve([
            { name: 'Entradas', sortOrder: 0, businessId: 'biz-1' },
            { name: 'Bebidas', sortOrder: 1, businessId: 'biz-1' },
          ]),
      });

      const result = await listProducts(adminPayload, {
        branchId: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(result.data.map((p) => p._id)).toEqual(['b', 'd', 'c', 'a']);
    });

    it('uses a stable DB-level sort when q is absent (matches new index)', async () => {
      const cursor = {
        collation: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: () => Promise.resolve([]),
      };
      mockProducts.find.mockReturnValue(cursor);
      mockProducts.countDocuments.mockResolvedValue(0);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(cursor.sort).toHaveBeenCalledWith({ category: 1, sortOrder: 1, _id: 1 });
    });

    it('falls back to createdAt sort when q is present', async () => {
      const cursor = {
        collation: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        toArray: () => Promise.resolve([]),
      };
      mockProducts.find.mockReturnValue(cursor);
      mockProducts.countDocuments.mockResolvedValue(0);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        q: 'arroz',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });

      expect(cursor.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });
  });

  describe('createProduct — Phase 2 validations', () => {
    it('rejects duplicate variant SKUs with VARIANT_SKU_DUPLICATE', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);

      await expect(
        createProduct(adminPayload, {
          ...validCreateInput,
          variants: [
            { id: 'v1', name: 'S', sku: 'DUP', priceDelta: 0 },
            { id: 'v2', name: 'M', sku: 'DUP', priceDelta: 1 },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'VARIANT_SKU_DUPLICATE' });

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });

    it('rejects maxSelectable greater than options.length', async () => {
      mockProducts.findOne.mockResolvedValue(null);
      mockKitchenStationFindReturns([]);

      await expect(
        createProduct(adminPayload, {
          ...validCreateInput,
          modifierGroups: [
            {
              id: 'g1',
              name: 'Tamaño',
              required: false,
              maxSelectable: 3,
              options: [{ id: 'o1', label: 'S', priceDelta: 0 }],
            },
          ],
        }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'MAX_SELECTABLE_EXCEEDS_OPTIONS' });

      expect(mockProducts.insertOne).not.toHaveBeenCalled();
    });
  });

  describe('reorderProducts', () => {
    it('admin bulkWrites sortOrder for each item + audit', async () => {
      mockProducts.bulkWrite.mockResolvedValue({ matchedCount: 2 });

      const result = await reorderProducts(adminPayload, {
        branchId: 'br-1',
        items: [
          { id: '11111111-1111-4111-a111-111111111111', sortOrder: 0 },
          { id: '22222222-2222-4222-a222-222222222222', sortOrder: 1 },
        ],
      });

      expect(result.matched).toBe(2);
      const args = mockProducts.bulkWrite.mock.calls[0];
      const ops = args[0] as Array<{ updateOne: { filter: object; update: object } }>;
      expect(ops).toHaveLength(2);
      expect(ops[0].updateOne.filter).toMatchObject({
        _id: '11111111-1111-4111-a111-111111111111',
        branchId: 'br-1',
        businessId: 'biz-1',
      });
      expect(args[1]).toEqual({ ordered: false });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'products_reordered',
          target: 'br-1',
          metadata: expect.objectContaining({ itemCount: 2 }),
        }),
      );
      expect(mockPublishToChannel).toHaveBeenCalledWith(
        'branch:biz-1:br-1',
        expect.objectContaining({ type: 'product.reordered' }),
      );
    });

    it('returns 400 when one or more ids did not match', async () => {
      mockProducts.bulkWrite.mockResolvedValue({ matchedCount: 1 });
      mockProducts.find.mockReturnValue({
        toArray: () => Promise.resolve([{ _id: '11111111-1111-4111-a111-111111111111' }]),
      });

      await expect(
        reorderProducts(adminPayload, {
          branchId: 'br-1',
          items: [
            { id: '11111111-1111-4111-a111-111111111111', sortOrder: 0 },
            { id: '22222222-2222-4222-a222-222222222222', sortOrder: 1 },
          ],
        }),
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'REORDER_PRODUCT_NOT_FOUND',
        details: [expect.objectContaining({ message: expect.stringContaining('22222222') })],
      });
    });

    it('cashier from another branch → 403', async () => {
      await expect(
        reorderProducts(cashierBranchB, {
          branchId: 'br-1',
          items: [{ id: '11111111-1111-4111-a111-111111111111', sortOrder: 0 }],
        }),
      ).rejects.toThrow('Access denied to this branch');

      expect(mockProducts.bulkWrite).not.toHaveBeenCalled();
    });

    it('super_admin resolves businessId from the branch and reorders', async () => {
      mockBranches.findOne.mockResolvedValue({ _id: 'br-1', businessId: 'biz-target' });
      mockProducts.bulkWrite.mockResolvedValue({ matchedCount: 1 });

      const result = await reorderProducts(superAdminPayload, {
        branchId: 'br-1',
        items: [{ id: '11111111-1111-4111-a111-111111111111', sortOrder: 0 }],
      });

      expect(result.matched).toBe(1);
      expect(mockBranches.findOne).toHaveBeenCalledWith(
        { _id: 'br-1' },
        { projection: { businessId: 1 } },
      );
      const ops = mockProducts.bulkWrite.mock.calls[0][0] as Array<{
        updateOne: { filter: object };
      }>;
      expect(ops[0].updateOne.filter).toMatchObject({ businessId: 'biz-target' });
      expect(mockPublishToChannel).toHaveBeenCalledWith(
        'branch:biz-target:br-1',
        expect.objectContaining({ type: 'product.reordered' }),
      );
    });

    it('super_admin → 404 when the branch does not exist', async () => {
      mockBranches.findOne.mockResolvedValue(null);

      await expect(
        reorderProducts(superAdminPayload, {
          branchId: 'br-missing',
          items: [{ id: '11111111-1111-4111-a111-111111111111', sortOrder: 0 }],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });

      expect(mockProducts.bulkWrite).not.toHaveBeenCalled();
    });
  });
});
