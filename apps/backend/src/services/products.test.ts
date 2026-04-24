import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import type { CreateProductInput } from '../schemas/products.js';
import {
  createProduct,
  deleteProduct,
  generateUploadUrl,
  getProductById,
  listProducts,
  updateProduct,
} from './products.js';

const { mockProducts, mockKitchenStations, mockLogAudit, mockGetSignedUrl } = vi.hoisted(() => ({
  mockProducts: {
    find: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
  },
  mockKitchenStations: {
    find: vi.fn(),
  },
  mockLogAudit: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock('../db/collections.js', () => ({
  getProductsCollection: () => Promise.resolve(mockProducts),
  getKitchenStationsCollection: () => Promise.resolve(mockKitchenStations),
}));

vi.mock('./audit.js', () => ({
  logAuditEvent: mockLogAudit,
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
  mockProducts.find.mockReturnValue({ toArray: () => Promise.resolve(docs) });
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

      await listProducts(adminPayload, { branchId: 'br-1', includeInactive: false });

      expect(mockProducts.find).toHaveBeenCalledWith({
        branchId: 'br-1',
        businessId: 'biz-1',
        isActive: true,
      });
    });

    it('applies case-insensitive q across name and sku', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { branchId: 'br-1', q: 'arroz', includeInactive: false });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { name: { $regex: 'arroz', $options: 'i' } },
            { sku: { $regex: 'arroz', $options: 'i' } },
          ],
        }),
      );
    });

    it('scopes by category when provided', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, {
        branchId: 'br-1',
        category: 'Entradas',
        includeInactive: false,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Entradas' }),
      );
    });

    it('includeInactive removes the isActive filter', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { branchId: 'br-1', includeInactive: true });

      const call = mockProducts.find.mock.calls[0][0];
      expect(call).not.toHaveProperty('isActive');
    });

    it('super_admin with no businessId query returns unscoped by business', async () => {
      mockFindReturns([]);

      await listProducts(superAdminPayload, { branchId: 'br-1', includeInactive: false });

      const call = mockProducts.find.mock.calls[0][0];
      expect(call).not.toHaveProperty('businessId');
    });

    it('super_admin with ?businessId filters by that businessId', async () => {
      mockFindReturns([]);

      await listProducts(superAdminPayload, {
        branchId: 'br-1',
        businessId: 'biz-99',
        includeInactive: false,
      });

      expect(mockProducts.find).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-99' }),
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
      mockProducts.insertOne.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

      await expect(createProduct(adminPayload, validCreateInput)).rejects.toMatchObject({
        statusCode: 409,
        code: 'SKU_ALREADY_EXISTS',
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
});
