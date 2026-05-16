/**
 * Perf test for `listProducts` against a real Docker Mongo.
 *
 * Gated by `RUN_PERF=1` — otherwise this entire suite is skipped. To run:
 *
 *   pnpm docker:up         # start Docker Mongo
 *   RUN_PERF=1 pnpm --filter @kaipos/backend test products.perf
 *
 * Asserts median p50 < 300 ms across 20 iterations of a search query over
 * 1 000 products. Uses a dedicated `businessId`/`branchId` to avoid polluting
 * other test or seeded data, and cleans up in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MongoClient, type Db } from 'mongodb';
import type { TokenPayload } from '@kaipos/shared/types';
import { cleanupTestProducts, seedTestProducts } from '../test/seed-products.js';
import { listProducts } from './products.js';

const PERF_BUSINESS_ID = 'perf-biz';
const PERF_BRANCH_ID = 'perf-branch';
const PERF_PRODUCT_COUNT = 1000;
const PERF_ITERATIONS = 20;
const PERF_P50_BUDGET_MS = 300;

const shouldRun = process.env.RUN_PERF === '1';

describe.skipIf(!shouldRun)('listProducts perf', () => {
  let client: MongoClient;
  let db: Db;

  beforeAll(async () => {
    const uri = process.env.MONGO_URI ?? 'mongodb://localhost:27017/kaipos';
    client = new MongoClient(uri);
    await client.connect();
    db = client.db();
    await cleanupTestProducts(db, PERF_BRANCH_ID);
    await seedTestProducts(db, {
      businessId: PERF_BUSINESS_ID,
      branchId: PERF_BRANCH_ID,
      count: PERF_PRODUCT_COUNT,
    });
  }, 60_000);

  afterAll(async () => {
    if (db) await cleanupTestProducts(db, PERF_BRANCH_ID);
    if (client) await client.close();
  });

  it(`p50 < ${PERF_P50_BUDGET_MS} ms over ${PERF_ITERATIONS} iterations`, async () => {
    const actor: TokenPayload = {
      userId: 'perf-actor',
      businessId: PERF_BUSINESS_ID,
      role: 'admin',
    };

    const samples: number[] = [];
    for (let i = 0; i < PERF_ITERATIONS; i++) {
      const t0 = performance.now();
      await listProducts(actor, {
        branchId: PERF_BRANCH_ID,
        q: 'foo',
        includeInactive: false,
        activeNow: false,
        page: 1,
        limit: 50,
      });
      samples.push(performance.now() - t0);
    }

    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length / 2)] ?? Infinity;
    expect(p50, `samples=${samples.map((s) => s.toFixed(1)).join(',')}`).toBeLessThan(
      PERF_P50_BUDGET_MS,
    );
  }, 30_000);
});
