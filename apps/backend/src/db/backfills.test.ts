import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Db } from 'mongodb';
import { backfillProductModifierMaxSelectable } from './backfills.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

interface CollectionMock {
  countDocuments: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

function makeDb(): { db: Db; products: CollectionMock } {
  const products: CollectionMock = {
    countDocuments: vi.fn(),
    updateMany: vi.fn(),
  };
  const db = {
    collection: (name: string) => {
      if (name === 'products') return products;
      throw new Error(`Unexpected collection ${name}`);
    },
  } as unknown as Db;
  return { db, products };
}

describe('backfillProductModifierMaxSelectable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when no docs are missing maxSelectable', async () => {
    const { db, products } = makeDb();
    products.countDocuments.mockResolvedValue(0);

    await backfillProductModifierMaxSelectable(db);

    expect(products.updateMany).not.toHaveBeenCalled();
  });

  it('runs a pipeline update over docs with at least one modifierGroup missing maxSelectable', async () => {
    const { db, products } = makeDb();
    products.countDocuments.mockResolvedValue(3);
    products.updateMany.mockResolvedValue({ matchedCount: 3, modifiedCount: 3 });

    await backfillProductModifierMaxSelectable(db);

    expect(products.countDocuments).toHaveBeenCalledWith({
      'modifierGroups.maxSelectable': { $exists: false },
      modifierGroups: { $exists: true, $not: { $size: 0 } },
    });

    const [filter, pipeline] = products.updateMany.mock.calls[0]!;
    expect(filter).toEqual({ 'modifierGroups.maxSelectable': { $exists: false } });
    expect(Array.isArray(pipeline)).toBe(true);
    const stage = pipeline[0];
    expect(stage).toHaveProperty('$set.modifierGroups.$map');
    const mapExpr = stage.$set.modifierGroups.$map;
    expect(mapExpr.input).toBe('$modifierGroups');
    expect(mapExpr.as).toBe('g');
  });

  it('keeps existing maxSelectable values (idempotent via $ifNull on the field itself)', async () => {
    const { db, products } = makeDb();
    products.countDocuments.mockResolvedValue(1);
    products.updateMany.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    await backfillProductModifierMaxSelectable(db);

    const pipeline = products.updateMany.mock.calls[0]![1] as Array<Record<string, unknown>>;
    const json = JSON.stringify(pipeline);
    // The merge uses $ifNull on the group-level maxSelectable so existing
    // numeric values (including 0) are preserved.
    expect(json).toContain('$ifNull');
    expect(json).toContain('$$g.maxSelectable');
    expect(json).toContain('$size');
  });
});
