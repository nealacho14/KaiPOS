import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MongoServerError } from 'mongodb';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  softDeleteProduct,
} from './products.js';

const { mockProductsCollection } = vi.hoisted(() => ({
  mockProductsCollection: {
    find: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../db/collections.js', () => ({
  getProductsCollection: () => Promise.resolve(mockProductsCollection),
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./audit.js', () => ({
  logAuditEvent: vi.fn(),
}));

const now = new Date('2025-01-01T00:00:00Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p-1',
    businessId: 'biz-1',
    name: 'Empanada',
    description: 'Rica',
    price: 3.5,
    category: 'Entradas',
    sku: 'EMP-001',
    stock: 10,
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

const superAdminPayload: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

const cashierPayload: TokenPayload = {
  userId: 'cash-1',
  businessId: 'biz-1',
  role: 'cashier',
};

const ctx = { route: '/api/products', method: 'POST' };

function mockFindReturns(docs: Product[]): void {
  mockProductsCollection.find.mockReturnValue({
    toArray: () => Promise.resolve(docs),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('products service', () => {
  describe('listProducts', () => {
    it('scopes by actor.businessId and excludes inactive by default', async () => {
      mockFindReturns([makeProduct()]);

      await listProducts(adminPayload);

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-1',
        isActive: true,
      });
    });

    it('super_admin without businessId returns no business filter', async () => {
      mockFindReturns([makeProduct()]);

      await listProducts(superAdminPayload);

      expect(mockProductsCollection.find).toHaveBeenCalledWith({ isActive: true });
    });

    it('super_admin with businessId filters by that business', async () => {
      mockFindReturns([makeProduct({ businessId: 'biz-other' })]);

      await listProducts(superAdminPayload, { businessId: 'biz-other' });

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-other',
        isActive: true,
      });
    });

    it('includeInactive=true removes isActive filter', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { includeInactive: 'true' });

      expect(mockProductsCollection.find).toHaveBeenCalledWith({ businessId: 'biz-1' });
    });

    it('category filter matches exactly', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { category: 'Entradas' });

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-1',
        isActive: true,
        category: 'Entradas',
      });
    });

    it('q generates case-insensitive $or on name/sku', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { q: 'emp' });

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-1',
        isActive: true,
        $or: [
          { name: { $regex: 'emp', $options: 'i' } },
          { sku: { $regex: 'emp', $options: 'i' } },
        ],
      });
    });

    it('escapes regex metacharacters in q', async () => {
      mockFindReturns([]);

      await listProducts(adminPayload, { q: 'a.b*c' });

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-1',
        isActive: true,
        $or: [
          { name: { $regex: 'a\\.b\\*c', $options: 'i' } },
          { sku: { $regex: 'a\\.b\\*c', $options: 'i' } },
        ],
      });
    });
  });

  describe('getProductById', () => {
    it('returns the product when in scope', async () => {
      mockProductsCollection.findOne.mockResolvedValue(makeProduct());

      const result = await getProductById(adminPayload, 'p-1');

      expect(result._id).toBe('p-1');
      expect(mockProductsCollection.findOne).toHaveBeenCalledWith({
        _id: 'p-1',
        businessId: 'biz-1',
      });
    });

    it('throws NotFoundError on cross-tenant', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);

      await expect(getProductById(adminPayload, 'p-other')).rejects.toThrow('Product not found');
    });

    it('super_admin can fetch across businesses', async () => {
      mockProductsCollection.findOne.mockResolvedValue(makeProduct({ businessId: 'biz-99' }));

      const result = await getProductById(superAdminPayload, 'p-1');

      expect(result.businessId).toBe('biz-99');
      expect(mockProductsCollection.findOne).toHaveBeenCalledWith({ _id: 'p-1' });
    });
  });

  describe('createProduct', () => {
    const base = {
      name: 'Nuevo',
      description: 'desc',
      price: 5,
      category: 'Entradas',
      sku: 'NEW-1',
      stock: 3,
    };

    it('admin creates in their business', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);
      mockProductsCollection.insertOne.mockResolvedValue({});

      const result = await createProduct(adminPayload, base, ctx);

      expect(result.businessId).toBe('biz-1');
      expect(result.isActive).toBe(true);
      expect(result.createdBy).toBe('admin-1');
      expect(result).not.toHaveProperty('imageUrl');
      expect(mockProductsCollection.insertOne).toHaveBeenCalledOnce();
    });

    it('persists imageUrl when provided', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);
      mockProductsCollection.insertOne.mockResolvedValue({});

      const result = await createProduct(
        adminPayload,
        { ...base, imageUrl: 'https://example.com/img.png' },
        ctx,
      );

      expect(result.imageUrl).toBe('https://example.com/img.png');
      expect(mockProductsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ imageUrl: 'https://example.com/img.png' }),
      );
    });

    it('pre-check: duplicate SKU throws 409 DUPLICATE_SKU', async () => {
      mockProductsCollection.findOne.mockResolvedValue(makeProduct({ sku: 'NEW-1' }));

      await expect(createProduct(adminPayload, base, ctx)).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_SKU',
      });
      expect(mockProductsCollection.insertOne).not.toHaveBeenCalled();
    });

    it('maps driver E11000 to 409 DUPLICATE_SKU (race condition)', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);
      const e11000 = new MongoServerError({ message: 'dup' });
      (e11000 as unknown as { code: number }).code = 11000;
      mockProductsCollection.insertOne.mockRejectedValue(e11000);

      await expect(createProduct(adminPayload, base, ctx)).rejects.toMatchObject({
        statusCode: 409,
        code: 'DUPLICATE_SKU',
      });
    });

    it('super_admin must supply a target businessId', async () => {
      await expect(createProduct(superAdminPayload, base, ctx)).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_TARGET_BUSINESS_ID',
      });
      expect(mockProductsCollection.insertOne).not.toHaveBeenCalled();
    });

    it('super_admin cannot create with sentinel "*"', async () => {
      await expect(
        createProduct(superAdminPayload, { ...base, businessId: '*' }, ctx),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TARGET_BUSINESS_ID' });
    });

    it('super_admin creates in the specified business', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);
      mockProductsCollection.insertOne.mockResolvedValue({});

      const result = await createProduct(
        superAdminPayload,
        { ...base, businessId: 'biz-target' },
        ctx,
      );

      expect(result.businessId).toBe('biz-target');
      expect(mockProductsCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-target' }),
      );
    });

    it('non-super_admin ignores body.businessId', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);
      mockProductsCollection.insertOne.mockResolvedValue({});

      const result = await createProduct(adminPayload, { ...base, businessId: 'biz-other' }, ctx);

      expect(result.businessId).toBe('biz-1');
    });
  });

  describe('updateProduct', () => {
    it('applies only whitelisted fields and updatedAt', async () => {
      const existing = makeProduct();
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);
      mockProductsCollection.updateOne.mockResolvedValue({});
      mockProductsCollection.findOne.mockResolvedValueOnce({ ...existing, name: 'Renombrado' });

      await updateProduct(
        adminPayload,
        'p-1',
        {
          name: 'Renombrado',
          price: 9,
        },
        ctx,
      );

      const setArg = mockProductsCollection.updateOne.mock.calls[0][1].$set;
      expect(setArg.name).toBe('Renombrado');
      expect(setArg.price).toBe(9);
      expect(setArg).toHaveProperty('updatedAt');
      expect(setArg).not.toHaveProperty('_id');
      expect(setArg).not.toHaveProperty('businessId');
      expect(setArg).not.toHaveProperty('createdAt');
      expect(setArg).not.toHaveProperty('createdBy');
    });

    it('throws NotFoundError on cross-tenant', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);

      await expect(updateProduct(adminPayload, 'p-other', { name: 'X' }, ctx)).rejects.toThrow(
        'Product not found',
      );
    });

    it('changing SKU to one already taken throws 409 DUPLICATE_SKU', async () => {
      const existing = makeProduct({ sku: 'OLD-1' });
      mockProductsCollection.findOne
        .mockResolvedValueOnce(existing)
        .mockResolvedValueOnce(makeProduct({ _id: 'p-2', sku: 'TAKEN' }));

      await expect(updateProduct(adminPayload, 'p-1', { sku: 'TAKEN' }, ctx)).rejects.toMatchObject(
        { statusCode: 409, code: 'DUPLICATE_SKU' },
      );
      expect(mockProductsCollection.updateOne).not.toHaveBeenCalled();
    });

    it('does not run SKU pre-check when SKU unchanged', async () => {
      const existing = makeProduct({ sku: 'SAME' });
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);
      mockProductsCollection.updateOne.mockResolvedValue({});
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);

      await updateProduct(adminPayload, 'p-1', { sku: 'SAME', name: 'X' }, ctx);

      expect(mockProductsCollection.findOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('softDeleteProduct', () => {
    it('admin deactivates an active product', async () => {
      const existing = makeProduct();
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);
      mockProductsCollection.updateOne.mockResolvedValue({});
      mockProductsCollection.findOne.mockResolvedValueOnce({ ...existing, isActive: false });

      const result = await softDeleteProduct(adminPayload, 'p-1', ctx);

      expect(result.isActive).toBe(false);
      expect(mockProductsCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'p-1' },
        { $set: expect.objectContaining({ isActive: false }) },
      );
    });

    it('is idempotent when already inactive', async () => {
      const existing = makeProduct({ isActive: false });
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);
      mockProductsCollection.findOne.mockResolvedValueOnce(existing);

      const result = await softDeleteProduct(adminPayload, 'p-1', ctx);

      expect(result.isActive).toBe(false);
      expect(mockProductsCollection.updateOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundError on cross-tenant', async () => {
      mockProductsCollection.findOne.mockResolvedValue(null);

      await expect(softDeleteProduct(adminPayload, 'p-other', ctx)).rejects.toThrow(
        'Product not found',
      );
    });
  });

  describe('non-admin actors', () => {
    it('cashier still scopes by their businessId when listing', async () => {
      mockFindReturns([]);

      await listProducts(cashierPayload);

      expect(mockProductsCollection.find).toHaveBeenCalledWith({
        businessId: 'biz-1',
        isActive: true,
      });
    });
  });
});
