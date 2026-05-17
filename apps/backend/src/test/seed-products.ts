import type { Db } from 'mongodb';
import type { Product } from '@kaipos/shared/types';

/**
 * Seed a deterministic batch of products against a real Mongo db. Intended
 * for the gated perf test in `services/products.perf.test.ts` — never called
 * from production code paths.
 *
 * Returns the inserted product ids so the caller can clean up afterwards.
 */
export async function seedTestProducts(
  db: Db,
  opts: { businessId: string; branchId: string; count: number },
): Promise<string[]> {
  const products = db.collection<Product>('products');
  const now = new Date();
  const docs: Product[] = Array.from({ length: opts.count }, (_, i) => ({
    _id: `perf-${opts.branchId}-${i}`,
    businessId: opts.businessId,
    branchId: opts.branchId,
    name: `PerfProduct ${i.toString().padStart(5, '0')}`,
    description: '',
    price: 1 + (i % 50),
    category: `Cat${i % 10}`,
    sku: `PERF-${i.toString().padStart(5, '0')}`,
    stock: 100,
    trackStock: true,
    stockUnit: 'unit',
    availability: { pos: true, online: false, kiosk: false },
    serviceSchedules: [],
    allergens: [],
    dietaryTags: [],
    modifierGroups: [],
    kitchenStationIds: [],
    sortOrder: i,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'perf-seed',
    // Every 17th product is taggable by the `foo` prefix used in the perf
    // query, so we exercise both index hit and result-set assembly.
    ...(i % 17 === 0 ? { name: `foo${i.toString().padStart(5, '0')}` } : {}),
  }));

  await products.insertMany(docs, { ordered: false });
  return docs.map((d) => d._id);
}

export async function cleanupTestProducts(db: Db, branchId: string): Promise<void> {
  await db.collection('products').deleteMany({ branchId });
}
