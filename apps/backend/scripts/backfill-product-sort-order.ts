import { logger } from '../src/lib/logger.js';
import { closeConnection, getDb } from '../src/db/client.js';

// Backfill script for Paso 1 of the advanced catalog feature.
//
//   - Every product without `sortOrder` gets `sortOrder: 0`. Once this runs,
//     the `products` validator can keep `sortOrder` in its `required` list
//     without breaking future updates to legacy docs.
//   - Every branch without `timezone` gets `timezone: 'America/Santo_Domingo'`.
//     Same reason: `timezone` becomes required in the `branches` validator.
//
// Idempotent: re-running is a no-op once both backfills have applied.
// Run order: this script BEFORE `db:setup` whenever upgrading an existing env.

const DEFAULT_TIMEZONE = 'America/Santo_Domingo';

async function backfillProductSortOrder(): Promise<void> {
  const db = await getDb();
  const products = db.collection('products');

  const missing = await products.countDocuments({ sortOrder: { $exists: false } });
  if (missing === 0) {
    logger.info('  products: all docs already have sortOrder — nothing to backfill');
    return;
  }

  const result = await products.updateMany(
    { sortOrder: { $exists: false } },
    { $set: { sortOrder: 0 } },
  );
  logger.info(
    { matched: result.matchedCount, modified: result.modifiedCount },
    `  products: backfilled sortOrder=0 on ${result.modifiedCount} doc(s)`,
  );

  const byBranch = await products
    .aggregate<{
      _id: string;
      count: number;
    }>([{ $group: { _id: '$branchId', count: { $sum: 1 } } }])
    .toArray();
  for (const row of byBranch) {
    logger.info(`    branch ${row._id}: ${row.count} product(s) total`);
  }
}

async function backfillBranchTimezone(): Promise<void> {
  const db = await getDb();
  const branches = db.collection('branches');

  const missing = await branches.countDocuments({ timezone: { $exists: false } });
  if (missing === 0) {
    logger.info('  branches: all docs already have timezone — nothing to backfill');
    return;
  }

  const result = await branches.updateMany(
    { timezone: { $exists: false } },
    { $set: { timezone: DEFAULT_TIMEZONE } },
  );
  logger.info(
    { matched: result.matchedCount, modified: result.modifiedCount, default: DEFAULT_TIMEZONE },
    `  branches: backfilled timezone="${DEFAULT_TIMEZONE}" on ${result.modifiedCount} doc(s)`,
  );
}

async function main(): Promise<void> {
  logger.info('KaiPOS Backfill — product.sortOrder + branch.timezone');
  logger.info('=====================================================\n');

  await backfillProductSortOrder();
  await backfillBranchTimezone();

  logger.info('\nDone!');
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'Backfill failed');
  process.exit(1);
});
