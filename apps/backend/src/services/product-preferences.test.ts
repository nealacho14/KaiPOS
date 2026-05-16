import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Product, TokenPayload } from '@kaipos/shared/types';
import { setFeatured } from './product-preferences.js';

const { mockProducts, mockProductPreferences, mockLogAudit, mockPublishToChannel } = vi.hoisted(
  () => ({
    mockProducts: { findOne: vi.fn() },
    mockProductPreferences: { findOne: vi.fn(), findOneAndUpdate: vi.fn() },
    mockLogAudit: vi.fn(),
    mockPublishToChannel: vi.fn(),
  }),
);

vi.mock('../db/collections.js', () => ({
  getProductsCollection: () => Promise.resolve(mockProducts),
  getProductPreferencesCollection: () => Promise.resolve(mockProductPreferences),
}));

vi.mock('./audit.js', () => ({ logAuditEvent: mockLogAudit }));

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

const now = new Date('2026-04-23T00:00:00Z');

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p-1',
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
    sortOrder: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'admin-1',
    ...overrides,
  };
}

const adminPayload: TokenPayload = { userId: 'admin-1', businessId: 'biz-1', role: 'admin' };
const cashierBranchB: TokenPayload = {
  userId: 'cash-2',
  businessId: 'biz-1',
  role: 'cashier',
  branchIds: ['br-2'],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('product-preferences service — setFeatured', () => {
  it('upserts a new preference, audits, and fans out a WS event', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct());
    mockProductPreferences.findOne.mockResolvedValue(null);
    mockProductPreferences.findOneAndUpdate.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      productId: 'p-1',
      featured: true,
      updatedAt: now,
      updatedBy: 'admin-1',
    });

    const result = await setFeatured(adminPayload, 'p-1', {
      branchId: 'br-1',
      featured: true,
    });

    expect(result.featured).toBe(true);
    expect(mockProductPreferences.findOneAndUpdate).toHaveBeenCalledWith(
      { businessId: 'biz-1', branchId: 'br-1', productId: 'p-1' },
      expect.objectContaining({
        $set: expect.objectContaining({ featured: true, updatedBy: 'admin-1' }),
      }),
      expect.objectContaining({ upsert: true, returnDocument: 'after' }),
    );
    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'product_featured',
        target: 'p-1',
        metadata: expect.objectContaining({ branchId: 'br-1' }),
      }),
    );
    expect(mockPublishToChannel).toHaveBeenCalledWith(
      'branch:biz-1:br-1',
      expect.objectContaining({ type: 'product.updated' }),
    );
  });

  it('audits product_unfeatured when toggling off', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct());
    mockProductPreferences.findOne.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      productId: 'p-1',
      featured: true,
      updatedAt: now,
      updatedBy: 'admin-1',
    });
    mockProductPreferences.findOneAndUpdate.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      productId: 'p-1',
      featured: false,
      updatedAt: now,
      updatedBy: 'admin-1',
    });

    await setFeatured(adminPayload, 'p-1', { branchId: 'br-1', featured: false });

    expect(mockLogAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'product_unfeatured' }),
    );
  });

  it('is idempotent — same state → no audit, no WS publish', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct());
    mockProductPreferences.findOne.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      productId: 'p-1',
      featured: true,
      updatedAt: now,
      updatedBy: 'admin-1',
    });
    mockProductPreferences.findOneAndUpdate.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      productId: 'p-1',
      featured: true,
      updatedAt: now,
      updatedBy: 'admin-1',
    });

    await setFeatured(adminPayload, 'p-1', { branchId: 'br-1', featured: true });

    expect(mockLogAudit).not.toHaveBeenCalled();
    expect(mockPublishToChannel).not.toHaveBeenCalled();
  });

  it('404 when product does not exist', async () => {
    mockProducts.findOne.mockResolvedValue(null);

    await expect(
      setFeatured(adminPayload, 'missing', { branchId: 'br-1', featured: true }),
    ).rejects.toThrow('Product not found');
  });

  it('404 when product lives in another branch (no orphan preference)', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct({ branchId: 'br-2' }));

    await expect(
      setFeatured(adminPayload, 'p-1', { branchId: 'br-1', featured: true }),
    ).rejects.toThrow('Product not found');
  });

  it('404 when product is in another business (cross-tenant probe)', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct({ businessId: 'biz-other' }));

    await expect(
      setFeatured(adminPayload, 'p-1', { branchId: 'br-1', featured: true }),
    ).rejects.toThrow('Product not found');
  });

  it('403 when actor cannot access the target branch', async () => {
    mockProducts.findOne.mockResolvedValue(makeProduct());

    await expect(
      setFeatured(cashierBranchB, 'p-1', { branchId: 'br-1', featured: true }),
    ).rejects.toThrow('Access denied to this branch');
  });
});
