import { logger } from '../lib/logger.js';
import { closeConnection, getDb } from './client.js';
import { runAllBackfills } from './backfills.js';
import { setupCollections } from './setup.js';
import { seedData } from './seed.js';

// Atlas-targeted orchestrator. Single entry point for any Mongo data update
// that needs to land in the prod Atlas cluster after a deploy.
//
// Steps, in order:
//   1) Data backfills (src/db/backfills.ts) — must run BEFORE setup whenever
//      a new field has been promoted to `required` in the validator, so the
//      legacy docs become valid.
//   2) Collection validators + indexes (src/db/setup.ts).
//   3) Mura seed (src/db/seed.ts + src/db/seed-data/mura-menu.ts) —
//      idempotent: skips if the business with slug `mura` already exists.
//      Requires `MURA_ADMIN_PASSWORD` (password for admin@mura.co). The
//      kelvin.hernandezc30@gmail.com user carries its passwordHash over from an
//      existing doc in another business; when none exists, set
//      `MURA_KELVIN_PASSWORD` or the seed aborts. `MURA_IMAGE_BASE_URL`
//      overrides the CDN base for the product placeholder image.
//
// Every step is idempotent; re-running is safe. Add future migrations either
// as a new function in `backfills.ts` (and call it from step 1) or by
// extending the seed/setup definitions directly.
//
// Invocation (from a workstation with AWS creds for the KaiPOS account):
//
//   AWS_PROFILE=personal MONGO_SECRET_ARN=arn:aws:secretsmanager:...:kaipos/prod/mongo-uri \
//     MURA_ADMIN_PASSWORD=... pnpm --filter @kaipos/backend db:seed-atlas
//
// The script refuses to run without `MONGO_SECRET_ARN` because that env var
// is the only path `src/db/client.ts` accepts for an Atlas (`mongodb+srv://`)
// connection — keeping local-only commands from accidentally talking to prod.

function assertAtlasTarget(): void {
  if (!process.env.MONGO_SECRET_ARN) {
    throw new Error(
      'db:seed-atlas requires MONGO_SECRET_ARN to be set (the ARN of the Atlas URI secret). ' +
        'For local/Docker Mongo use `db:setup` + `db:seed` instead.',
    );
  }
  if (!process.env.MURA_ADMIN_PASSWORD) {
    throw new Error(
      'db:seed-atlas requires MURA_ADMIN_PASSWORD to be set (password for admin@mura.co). ' +
        'The Mura seed never falls back to a default password on Atlas.',
    );
  }
}

async function main(): Promise<void> {
  logger.info('KaiPOS Atlas Seed Orchestrator');
  logger.info('==============================\n');

  assertAtlasTarget();

  const db = await getDb();

  logger.info('Step 1/3: data backfills');
  await runAllBackfills(db);

  logger.info('\nStep 2/3: collections, validators, indexes');
  await setupCollections(db);

  logger.info('\nStep 3/3: Mura seed data (idempotent)');
  await seedData(db);

  logger.info('\nDone!');
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'Atlas seed failed');
  process.exit(1);
});
