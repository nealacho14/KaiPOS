/**
 * Destructive reset: drops the entire `kaipos` database (or the one in the
 * provided URI), re-applies the $jsonSchema validators + indexes, and inserts
 * a minimal admin-only dataset (1 business, 2 branches, 1 admin user).
 *
 * Unlike `db:seed`, this script WILL run against Atlas — it's explicitly
 * designed for wiping and reprovisioning a shared environment. Requires an
 * explicit `--confirm` flag plus the full URI (no default) to prevent
 * accidental invocations.
 *
 * Usage:
 *   MONGO_URI='mongodb+srv://user:pass@cluster/kaipos?...' \
 *   ADMIN_EMAIL='admin@test.com' ADMIN_PASSWORD='admin123' \
 *     pnpm --filter @kaipos/backend db:reset -- --confirm
 */
import { MongoClient } from 'mongodb';
import { hashPassword } from '../lib/password.js';
import { logger } from '../lib/logger.js';
import { setupCollections } from './setup.js';

// UUID v4 fixed-pattern ids so the reset output is stable and debuggable.
// `00000000-0000-4000-8000-` + 12 hex chars.
const BUSINESS_ID = '00000000-0000-4000-8000-000000000100';
const BRANCH_ID_A = '00000000-0000-4000-8000-000000000201';
const BRANCH_ID_B = '00000000-0000-4000-8000-000000000202';
const ADMIN_USER_ID = '00000000-0000-4000-8000-000000000301';

function parseArgs(argv: string[]): { confirm: boolean } {
  return { confirm: argv.includes('--confirm') };
}

function maskUri(uri: string): string {
  return uri.replace(/\/\/[^@]*@/, '//***:***@');
}

async function main(): Promise<void> {
  const { confirm } = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGO_URI;
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@test.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  const adminName = process.env.ADMIN_NAME ?? 'Test Admin';

  if (!uri) {
    throw new Error('MONGO_URI is required. Pass the full connection string explicitly.');
  }

  if (!confirm) {
    logger.warn(
      `This will DROP the target database and recreate it from scratch.\n` +
        `  Target: ${maskUri(uri)}\n` +
        `  Admin:  ${adminEmail}\n\n` +
        `Re-run with --confirm to proceed.`,
    );
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();

  // Resolve the target db from the URI; fall back to `kaipos` if the URI has no
  // explicit default database (mongodb+srv:// paths typically do).
  const defaultDb = client.db();
  const dbName = defaultDb.databaseName === 'test' ? 'kaipos' : defaultDb.databaseName;
  const db = client.db(dbName);

  logger.info(`Target: ${maskUri(uri)} (db: ${dbName})`);
  logger.info('Dropping database...');
  await db.dropDatabase();
  logger.info('  Dropped.');

  logger.info('Applying schemas + indexes...');
  await setupCollections(db);

  logger.info('Inserting seed data (1 business, 2 branches, 1 admin)...');
  const now = new Date();

  await db.collection('businesses').insertOne({
    _id: BUSINESS_ID as never,
    name: 'Test Business',
    slug: 'test-business',
    address: 'Dirección de prueba',
    phone: '809-000-0000',
    email: 'info@test.com',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await db.collection('branches').insertMany([
    {
      _id: BRANCH_ID_A as never,
      businessId: BUSINESS_ID,
      name: 'Sucursal Norte',
      address: 'Av. Norte 1',
      phone: '809-000-0001',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: ADMIN_USER_ID,
    },
    {
      _id: BRANCH_ID_B as never,
      businessId: BUSINESS_ID,
      name: 'Sucursal Sur',
      address: 'Av. Sur 2',
      phone: '809-000-0002',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: ADMIN_USER_ID,
    },
  ]);

  const passwordHash = await hashPassword(adminPassword);
  await db.collection('users').insertOne({
    _id: ADMIN_USER_ID as never,
    businessId: BUSINESS_ID,
    email: adminEmail,
    name: adminName,
    passwordHash,
    role: 'admin',
    branchIds: [BRANCH_ID_A, BRANCH_ID_B],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: ADMIN_USER_ID,
  });

  logger.info('Done.');
  logger.info('');
  logger.info('Admin credentials:');
  logger.info(`  email:    ${adminEmail}`);
  logger.info(`  password: ${adminPassword}`);
  logger.info(`  branches: ${BRANCH_ID_A}, ${BRANCH_ID_B}`);

  await client.close();
}

main().catch((err) => {
  logger.error({ err }, 'Reset failed');
  process.exit(1);
});
