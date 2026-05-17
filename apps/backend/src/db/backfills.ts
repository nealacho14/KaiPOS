import { type Db } from 'mongodb';
import { logger } from '../lib/logger.js';

// Reusable data backfills. Each function takes a `Db` so the same logic runs
// from the standalone `db:backfill:sortorder` script and from the Atlas
// orchestrator (`db:seed-atlas`). Add new backfills here whenever a future
// schema change requires touching existing docs before tightening validators.
//
// Conventions:
//   - Every backfill MUST be idempotent (re-running is a no-op).
//   - Filter by `$exists: false` (or equivalent) so we only touch docs that
//     need it — never blindly overwrite.
//   - Run BEFORE `setupCollections` whenever the corresponding field is
//     promoted to `required` in the validator.

const DEFAULT_TIMEZONE = 'America/Santo_Domingo';

export async function backfillProductSortOrder(db: Db): Promise<void> {
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

export async function backfillBranchTimezone(db: Db): Promise<void> {
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

/**
 * Sets `modifierGroups[].maxSelectable = options.length` on any product where
 * a group is missing the field. Legacy docs created before `maxSelectable`
 * became required pass the `moderate`/`off` validator level but break under
 * `strict` and under partial-update writes that re-serialize the array.
 *
 * Idempotent — re-running is a no-op once every group has the field.
 */
export async function backfillProductModifierMaxSelectable(db: Db): Promise<void> {
  const products = db.collection('products');

  const missing = await products.countDocuments({
    'modifierGroups.maxSelectable': { $exists: false },
    modifierGroups: { $exists: true, $not: { $size: 0 } },
  });
  if (missing === 0) {
    logger.info('  products: all modifierGroups already have maxSelectable — nothing to backfill');
    return;
  }

  // Use a pipeline-style update so we can compute `options.length` per group
  // in a single round-trip. `$map` walks every group and only overwrites
  // `maxSelectable` when it's missing — groups that already have the field
  // (numeric, including 0) keep their stored value.
  const result = await products.updateMany({ 'modifierGroups.maxSelectable': { $exists: false } }, [
    {
      $set: {
        modifierGroups: {
          $map: {
            input: '$modifierGroups',
            as: 'g',
            in: {
              $mergeObjects: [
                '$$g',
                {
                  maxSelectable: {
                    $ifNull: ['$$g.maxSelectable', { $size: { $ifNull: ['$$g.options', []] } }],
                  },
                },
              ],
            },
          },
        },
      },
    },
  ]);
  logger.info(
    { matched: result.matchedCount, modified: result.modifiedCount },
    `  products: backfilled modifierGroups.maxSelectable on ${result.modifiedCount} doc(s)`,
  );
}

export async function runAllBackfills(db: Db): Promise<void> {
  await backfillProductSortOrder(db);
  await backfillBranchTimezone(db);
  await backfillProductModifierMaxSelectable(db);
}
