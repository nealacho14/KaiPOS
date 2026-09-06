import { describe, it, expect } from 'vitest';
import {
  availabilityWindowSchema,
  createProductSchema,
  featureProductSchema,
  listProductsQuerySchema,
  productVariantSchema,
  reorderProductsSchema,
  updateProductSchema,
  uploadUrlSchema,
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_CONTENT_TYPES,
} from './products.js';

const validProductBase = {
  branchId: 'branch-1',
  name: 'Producto',
  description: 'desc',
  price: 100,
  category: 'cat',
  sku: 'SKU-1',
  stock: 10,
};

describe('productVariantSchema', () => {
  it('accepts a valid variant', () => {
    const parsed = productVariantSchema.parse({
      id: 'v1',
      name: 'Small',
      sku: 'V-S-1',
      priceDelta: 0,
    });
    expect(parsed.sku).toBe('V-S-1');
  });

  it('rejects empty sku', () => {
    const result = productVariantSchema.safeParse({
      id: 'v1',
      name: 'Small',
      sku: '',
      priceDelta: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric priceDelta', () => {
    const result = productVariantSchema.safeParse({
      id: 'v1',
      name: 'Small',
      sku: 'X',
      priceDelta: 'free',
    });
    expect(result.success).toBe(false);
  });

  it('allows negative priceDelta (for "menor que" variantes)', () => {
    const parsed = productVariantSchema.parse({
      id: 'v1',
      name: 'Mini',
      sku: 'V-MINI',
      priceDelta: -50,
    });
    expect(parsed.priceDelta).toBe(-50);
  });
});

describe('availabilityWindowSchema', () => {
  it('accepts a typical 11–15 window', () => {
    const parsed = availabilityWindowSchema.parse({
      daysOfWeek: [1, 2, 3, 4, 5],
      from: '11:00',
      to: '15:00',
    });
    expect(parsed.from).toBe('11:00');
  });

  it('rejects invalid time format', () => {
    const result = availabilityWindowSchema.safeParse({
      daysOfWeek: [1],
      from: '25:00',
      to: '15:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty daysOfWeek', () => {
    const result = availabilityWindowSchema.safeParse({
      daysOfWeek: [],
      from: '11:00',
      to: '15:00',
    });
    expect(result.success).toBe(false);
  });

  it('rejects day out of 0–6 range', () => {
    const result = availabilityWindowSchema.safeParse({
      daysOfWeek: [7],
      from: '11:00',
      to: '15:00',
    });
    expect(result.success).toBe(false);
  });
});

describe('createProductSchema', () => {
  it('parses a minimal product and defaults sortOrder to 0', () => {
    const parsed = createProductSchema.parse(validProductBase);
    expect(parsed.sortOrder).toBe(0);
    expect(parsed.variants).toBeUndefined();
    expect(parsed.availabilityWindow).toBeUndefined();
    expect(parsed.barcode).toBeUndefined();
  });

  it('accepts variants with unique SKUs', () => {
    const parsed = createProductSchema.parse({
      ...validProductBase,
      variants: [
        { id: 'v1', name: 'S', sku: 'V-1', priceDelta: 0 },
        { id: 'v2', name: 'M', sku: 'V-2', priceDelta: 50 },
      ],
    });
    expect(parsed.variants).toHaveLength(2);
  });

  it('rejects duplicate variant SKUs', () => {
    const result = createProductSchema.safeParse({
      ...validProductBase,
      variants: [
        { id: 'v1', name: 'S', sku: 'V-DUP', priceDelta: 0 },
        { id: 'v2', name: 'M', sku: 'V-DUP', priceDelta: 50 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('variants.1.sku'))).toBe(true);
    }
  });

  it('rejects modifierGroup with maxSelectable > options.length', () => {
    const result = createProductSchema.safeParse({
      ...validProductBase,
      modifierGroups: [
        {
          id: 'g1',
          name: 'Tamaño',
          required: true,
          maxSelectable: 5,
          options: [
            { id: 'o1', label: 'S', priceDelta: 0 },
            { id: 'o2', label: 'M', priceDelta: 50 },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxSelectable < 1', () => {
    const result = createProductSchema.safeParse({
      ...validProductBase,
      modifierGroups: [
        {
          id: 'g1',
          name: 'Tamaño',
          required: true,
          maxSelectable: 0,
          options: [{ id: 'o1', label: 'S', priceDelta: 0 }],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts modifierGroup with maxSelectable equal to options.length', () => {
    const parsed = createProductSchema.parse({
      ...validProductBase,
      modifierGroups: [
        {
          id: 'g1',
          name: 'Salsas',
          required: false,
          maxSelectable: 2,
          options: [
            { id: 'o1', label: 'BBQ', priceDelta: 0 },
            { id: 'o2', label: 'Picante', priceDelta: 0 },
          ],
        },
      ],
    });
    expect(parsed.modifierGroups[0]?.maxSelectable).toBe(2);
  });

  it('accepts modifierOption with availability window', () => {
    const parsed = createProductSchema.parse({
      ...validProductBase,
      modifierGroups: [
        {
          id: 'g1',
          name: 'Extras',
          required: false,
          maxSelectable: 1,
          options: [
            {
              id: 'o1',
              label: 'Desayuno',
              priceDelta: 0,
              available: { daysOfWeek: [1, 2, 3, 4, 5], from: '06:00', to: '11:00' },
            },
          ],
        },
      ],
    });
    expect(parsed.modifierGroups[0]?.options[0]?.available?.from).toBe('06:00');
  });

  it('rejects modifierOption availability with from but no to', () => {
    const result = createProductSchema.safeParse({
      ...validProductBase,
      modifierGroups: [
        {
          id: 'g1',
          name: 'Extras',
          required: false,
          maxSelectable: 1,
          options: [
            {
              id: 'o1',
              label: 'X',
              priceDelta: 0,
              available: { from: '06:00' },
            },
          ],
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts product-level availabilityWindow', () => {
    const parsed = createProductSchema.parse({
      ...validProductBase,
      availabilityWindow: {
        daysOfWeek: [0, 6],
        from: '08:00',
        to: '12:00',
      },
    });
    expect(parsed.availabilityWindow?.daysOfWeek).toEqual([0, 6]);
  });

  it('accepts optional barcode', () => {
    const parsed = createProductSchema.parse({ ...validProductBase, barcode: '750ML-TINTO' });
    expect(parsed.barcode).toBe('750ML-TINTO');
  });

  it('rejects empty-string barcode', () => {
    const result = createProductSchema.safeParse({ ...validProductBase, barcode: '' });
    expect(result.success).toBe(false);
  });
});

describe('updateProductSchema', () => {
  it('detects duplicate variant SKUs on update', () => {
    const result = updateProductSchema.safeParse({
      variants: [
        { id: 'v1', name: 'S', sku: 'V-DUP', priceDelta: 0 },
        { id: 'v2', name: 'M', sku: 'V-DUP', priceDelta: 50 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one field', () => {
    const result = updateProductSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('listProductsQuerySchema', () => {
  it('coerces activeNow=true (string)', () => {
    const parsed = listProductsQuerySchema.parse({ branchId: 'b1', activeNow: 'true' });
    expect(parsed.activeNow).toBe(true);
  });

  it('coerces activeNow=1 (string) to true', () => {
    const parsed = listProductsQuerySchema.parse({ branchId: 'b1', activeNow: '1' });
    expect(parsed.activeNow).toBe(true);
  });

  it('coerces unset activeNow to false', () => {
    const parsed = listProductsQuerySchema.parse({ branchId: 'b1' });
    expect(parsed.activeNow).toBe(false);
  });

  it('accepts featuredIn branchId', () => {
    const parsed = listProductsQuerySchema.parse({ branchId: 'b1', featuredIn: 'b2' });
    expect(parsed.featuredIn).toBe('b2');
  });
});

describe('reorderProductsSchema', () => {
  it('accepts up to 500 items', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      id: '00000000-0000-4000-8000-000000000001'.replace(/.$/, String(i % 10)),
      sortOrder: i,
    }));
    const parsed = reorderProductsSchema.parse({ branchId: 'b1', items });
    expect(parsed.items).toHaveLength(500);
  });

  it('rejects more than 500 items', () => {
    const items = Array.from({ length: 501 }, () => ({
      id: '11111111-1111-4111-8111-111111111111',
      sortOrder: 0,
    }));
    const result = reorderProductsSchema.safeParse({ branchId: 'b1', items });
    expect(result.success).toBe(false);
  });

  it('rejects empty items', () => {
    const result = reorderProductsSchema.safeParse({ branchId: 'b1', items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects non-uuid product id', () => {
    const result = reorderProductsSchema.safeParse({
      branchId: 'b1',
      items: [{ id: 'not-a-uuid', sortOrder: 0 }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative sortOrder', () => {
    const result = reorderProductsSchema.safeParse({
      branchId: 'b1',
      items: [{ id: '11111111-1111-4111-8111-111111111111', sortOrder: -1 }],
    });
    expect(result.success).toBe(false);
  });
});

describe('featureProductSchema', () => {
  it('accepts featured=true', () => {
    const parsed = featureProductSchema.parse({ branchId: 'b1', featured: true });
    expect(parsed.featured).toBe(true);
  });

  it('rejects non-boolean featured', () => {
    const result = featureProductSchema.safeParse({ branchId: 'b1', featured: 'yes' });
    expect(result.success).toBe(false);
  });
});

describe('uploadUrlSchema', () => {
  const base = { branchId: 'branch-1', contentType: 'image/jpeg' } as const;

  it('exposes a 10 MB limit and the accepted content types', () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(UPLOAD_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });

  it('accepts fileSize of exactly 10 MB', () => {
    const result = uploadUrlSchema.safeParse({ ...base, fileSize: MAX_UPLOAD_SIZE_BYTES });
    expect(result.success).toBe(true);
  });

  it('rejects fileSize of 10 MB + 1', () => {
    const result = uploadUrlSchema.safeParse({ ...base, fileSize: MAX_UPLOAD_SIZE_BYTES + 1 });
    expect(result.success).toBe(false);
  });

  it('rejects content types outside UPLOAD_CONTENT_TYPES', () => {
    const result = uploadUrlSchema.safeParse({
      ...base,
      contentType: 'image/gif',
      fileSize: 1024,
    });
    expect(result.success).toBe(false);
  });
});
