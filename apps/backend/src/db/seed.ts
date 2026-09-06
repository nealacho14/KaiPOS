import { fileURLToPath } from 'node:url';
import { type Db } from 'mongodb';
import type { Branch, Business, Category, Product, ProductPreference, User } from '@kaipos/shared';
import { logger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { getDb, closeConnection } from './client.js';
import {
  DEFAULT_MURA_IMAGE_BASE_URL,
  MURA_ADMIN_EMAIL,
  MURA_ADMIN_USER_ID,
  MURA_BRANCH_ID,
  MURA_BUSINESS_ID,
  MURA_CARRY_OVER_EMAIL,
  MURA_KELVIN_USER_ID,
  MURA_SLUG,
  buildMuraDocuments,
  muraPlaceholderImageUrl,
} from './seed-data/mura-menu.js';

// ---------------------------------------------------------------------------
// Atlas guard: refuse to run against MongoDB Atlas / prod Secrets Manager
// ---------------------------------------------------------------------------

function assertLocalMongo(): void {
  if (process.env.MONGO_SECRET_ARN) {
    throw new Error(
      'Seed refuses to run with MONGO_SECRET_ARN set. This script is for local/Docker Mongo only.',
    );
  }

  const uri = process.env.MONGO_URI;
  if (uri && uri.includes('mongodb+srv://')) {
    throw new Error(
      'Seed refuses to run against an Atlas URI (mongodb+srv://). Use local/Docker Mongo only.',
    );
  }

  const host = uri ?? '';
  const looksLocal =
    host === '' ||
    host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('@mongo:') ||
    host.includes('//mongo:');
  if (!looksLocal) {
    logger.warn(
      { uri: host.replace(/\/\/[^@]*@/, '//***@') },
      'MONGO_URI does not look local — proceeding anyway, but double-check you are not targeting a shared DB',
    );
  }
}

// ---------------------------------------------------------------------------
// Users. Password sources, in order of precedence:
//   admin@mura.co  → MURA_ADMIN_PASSWORD; locally falls back to 'admin123'.
//   kelvin         → passwordHash carried over from an existing user doc with
//                    the same email in another business (the users unique
//                    index is {businessId, email}, so both docs coexist) →
//                    MURA_KELVIN_PASSWORD → skipped locally.
// On Atlas (MONGO_SECRET_ARN set) every fallback becomes a hard error so a
// prod seed never ends up with a guessable or missing credential.
// ---------------------------------------------------------------------------

const LOCAL_ADMIN_PASSWORD = 'admin123';

interface SeedEnv {
  MONGO_SECRET_ARN?: string;
  MURA_ADMIN_PASSWORD?: string;
  MURA_KELVIN_PASSWORD?: string;
  MURA_IMAGE_BASE_URL?: string;
}

async function resolveAdminPasswordHash(env: SeedEnv): Promise<string> {
  if (env.MURA_ADMIN_PASSWORD) return hashPassword(env.MURA_ADMIN_PASSWORD);
  if (env.MONGO_SECRET_ARN) {
    throw new Error(
      `Refusing to seed Mura on Atlas without MURA_ADMIN_PASSWORD (password for ${MURA_ADMIN_EMAIL}).`,
    );
  }
  logger.warn(
    { email: MURA_ADMIN_EMAIL },
    `MURA_ADMIN_PASSWORD not set — using the local default password '${LOCAL_ADMIN_PASSWORD}'`,
  );
  return hashPassword(LOCAL_ADMIN_PASSWORD);
}

async function resolveKelvinPasswordHash(db: Db, env: SeedEnv): Promise<string | null> {
  const existing = await db
    .collection<User>('users')
    .findOne({ email: MURA_CARRY_OVER_EMAIL, businessId: { $ne: MURA_BUSINESS_ID } });
  if (existing?.passwordHash) {
    logger.info(
      { email: MURA_CARRY_OVER_EMAIL },
      `carried over passwordHash from business ${existing.businessId}`,
    );
    return existing.passwordHash;
  }

  if (env.MURA_KELVIN_PASSWORD) return hashPassword(env.MURA_KELVIN_PASSWORD);

  if (env.MONGO_SECRET_ARN) {
    throw new Error(
      `Refusing to seed Mura on Atlas without a password source for ${MURA_CARRY_OVER_EMAIL}: ` +
        'no existing user doc to carry the passwordHash over from and MURA_KELVIN_PASSWORD is unset.',
    );
  }

  logger.warn(
    { email: MURA_CARRY_OVER_EMAIL },
    'No carry-over user and MURA_KELVIN_PASSWORD not set — skipping this user',
  );
  return null;
}

export async function resolveMuraUsers(
  db: Db,
  env: SeedEnv = process.env,
  now: Date = new Date(),
): Promise<User[]> {
  const base = {
    businessId: MURA_BUSINESS_ID,
    role: 'admin' as const,
    branchIds: [MURA_BRANCH_ID],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: MURA_ADMIN_USER_ID,
  };

  const users: User[] = [
    {
      ...base,
      _id: MURA_ADMIN_USER_ID,
      email: MURA_ADMIN_EMAIL,
      name: 'Mura Admin',
      passwordHash: await resolveAdminPasswordHash(env),
    },
  ];

  const kelvinHash = await resolveKelvinPasswordHash(db, env);
  if (kelvinHash) {
    users.push({
      ...base,
      _id: MURA_KELVIN_USER_ID,
      email: MURA_CARRY_OVER_EMAIL,
      name: 'Kelvin Hernández',
      passwordHash: kelvinHash,
    });
  }

  return users;
}

// ---------------------------------------------------------------------------
// Seed data (idempotent: skipped if the Mura business already exists)
// ---------------------------------------------------------------------------

export async function seedData(db: Db): Promise<void> {
  const businessesCol = db.collection<Business>('businesses');

  const existingBusiness = await businessesCol.findOne({ slug: MURA_SLUG });
  if (existingBusiness) {
    logger.info(`  Seed data already exists (business "${MURA_SLUG}" found). Skipping.`);
    return;
  }

  const env: SeedEnv = process.env;
  const now = new Date();
  const imageBaseUrl = (env.MURA_IMAGE_BASE_URL ?? DEFAULT_MURA_IMAGE_BASE_URL).replace(/\/+$/, '');
  logger.info(
    { placeholderImageUrl: muraPlaceholderImageUrl(imageBaseUrl) },
    '  Product images point at the Mura placeholder',
  );

  const users = await resolveMuraUsers(db, env, now);
  const { business, branch, categories, products, productPreferences } = buildMuraDocuments({
    now,
    imageBaseUrl,
    createdBy: MURA_ADMIN_USER_ID,
  });

  await businessesCol.insertOne(business);
  logger.info(`  Seeded business: ${business.name}`);

  await db.collection<Branch>('branches').insertOne(branch);
  logger.info(`  Seeded 1 branch: ${branch.name}`);

  await db.collection<User>('users').insertMany(users);
  logger.info(`  Seeded ${users.length} user(s): ${users.map((u) => u.email).join(', ')}`);

  await db.collection<Category>('categories').insertMany(categories);
  logger.info(`  Seeded ${categories.length} categories`);

  await db.collection<Product>('products').insertMany(products);
  logger.info(`  Seeded ${products.length} products`);

  await db.collection<ProductPreference>('productPreferences').insertMany(productPreferences);
  logger.info(`  Seeded ${productPreferences.length} featured product preferences`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('KaiPOS Database Seed');
  logger.info('====================\n');

  assertLocalMongo();

  const db = await getDb();

  logger.info('Seeding data...');
  await seedData(db);

  logger.info('\nDone!');
  await closeConnection();
}

// Only auto-run as a CLI; importing this file (e.g. from the Atlas
// orchestrator) must not trigger the local-only guard or a connection.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error({ err }, 'Seed failed');
    process.exit(1);
  });
}
