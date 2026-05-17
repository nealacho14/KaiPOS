import { logger } from '../src/lib/logger.js';
import { closeConnection, getDb } from '../src/db/client.js';
import { runAllBackfills } from '../src/db/backfills.js';

// Standalone runner for the data backfills defined in `src/db/backfills.ts`.
// Same logic also runs as part of `db:seed-atlas`. Idempotent.

async function main(): Promise<void> {
  logger.info('KaiPOS Backfill — product.sortOrder + branch.timezone');
  logger.info('=====================================================\n');

  const db = await getDb();
  await runAllBackfills(db);

  logger.info('\nDone!');
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'Backfill failed');
  process.exit(1);
});
