import { type Collection, type Db } from 'mongodb';
import { logger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { closeConnection, getDb } from './client.js';

// ---------------------------------------------------------------------------
// Atlas guard: refuse to run against MongoDB Atlas / prod Secrets Manager.
// ---------------------------------------------------------------------------

function assertLocalMongo(): void {
  if (process.env.MONGO_SECRET_ARN) {
    throw new Error(
      'seed-cypress refuses to run with MONGO_SECRET_ARN set. ' +
        'This script is for local/Docker Mongo or a manually-provisioned staging tunnel only.',
    );
  }

  const uri = process.env.MONGO_URI;
  if (uri && uri.includes('mongodb+srv://')) {
    throw new Error(
      'seed-cypress refuses to run against an Atlas URI (mongodb+srv://). ' +
        'Use local/Docker Mongo or a staging tunnel only.',
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
      'MONGO_URI does not look local — proceeding anyway, but double-check you are not targeting prod',
    );
  }
}

// ---------------------------------------------------------------------------
// Stable IDs for Cypress fixtures. UUID v4 to satisfy `z.string().uuid()`
// param validation, with a `9000`/`9100`/`9200`/`9300` block that obviously
// belongs to the Cypress fixture set (the demo seed uses `0100`/`0200`/...).
// ---------------------------------------------------------------------------

const BIZ_A_ID = '00000000-0000-4000-8000-000000009100';
const BIZ_B_ID = '00000000-0000-4000-8000-000000009200';
const BRANCH_A_ID = '00000000-0000-4000-8000-000000009110';
const BRANCH_B_ID = '00000000-0000-4000-8000-000000009210';
const CATEGORY_A_ID = '00000000-0000-4000-8000-000000009120';
const CATEGORY_B_ID = '00000000-0000-4000-8000-000000009220';
const PRODUCT_A_ID = '00000000-0000-4000-8000-000000009130';
const PRODUCT_B_ID = '00000000-0000-4000-8000-000000009230';

const ROLES = ['admin', 'manager', 'supervisor', 'cashier', 'waiter', 'kitchen'] as const;

type CypressRole = (typeof ROLES)[number];

// Single super_admin spans both businesses via the SUPER_ADMIN_BUSINESS_ID
// sentinel ('*'). Lives outside the per-tenant ROLES loop because it is
// global by definition.
const SUPER_ADMIN_USER_ID = '00000000-0000-4000-8000-000000009000';
const SUPER_ADMIN_EMAIL = 'cypress-super-admin@cypress.test';
const SUPER_ADMIN_PASSWORD = 'cypress-super-admin-pass-1';

interface BusinessFixture {
  _id: string;
  slug: string;
  name: string;
  branchId: string;
  branchName: string;
  categoryId: string;
  productId: string;
  productSku: string;
  emailSuffix: 'a' | 'b';
}

const BUSINESSES: BusinessFixture[] = [
  {
    _id: BIZ_A_ID,
    slug: 'cypress-biz-a',
    name: 'Cypress Business A',
    branchId: BRANCH_A_ID,
    branchName: 'Cypress A · Sucursal Principal',
    categoryId: CATEGORY_A_ID,
    productId: PRODUCT_A_ID,
    productSku: 'CYP-FIXED-A-001',
    emailSuffix: 'a',
  },
  {
    _id: BIZ_B_ID,
    slug: 'cypress-biz-b',
    name: 'Cypress Business B',
    branchId: BRANCH_B_ID,
    branchName: 'Cypress B · Sucursal Principal',
    categoryId: CATEGORY_B_ID,
    productId: PRODUCT_B_ID,
    productSku: 'CYP-FIXED-B-001',
    emailSuffix: 'b',
  },
];

// User IDs are deterministic based on (business, role) so reruns of the
// seed never duplicate accounts. The pattern is:
//   00000000-0000-4000-8000-9<biz>0<role>
// where <biz> is 1 (A) or 2 (B) and <role> is the index into ROLES (1-based).
function userIdFor(businessIndex: 1 | 2, roleIndex: number): string {
  const block = `9${businessIndex}0${roleIndex.toString().padStart(2, '0')}`;
  return `00000000-0000-4000-8000-00000000${block}`;
}

function emailFor(role: CypressRole, biz: BusinessFixture): string {
  return `cypress-${role}-${biz.emailSuffix}@cypress.test`;
}

function passwordFor(role: CypressRole): string {
  // Deterministic but distinct so a leak of one role doesn't grant the others.
  // These are documented test credentials, not production secrets.
  return `cypress-${role}-pass-1`;
}

// ---------------------------------------------------------------------------
// Idempotent upserts. Each section uses _id-based upsert so reruns are no-ops
// when nothing changed and self-heal when fields drift.
// ---------------------------------------------------------------------------

async function upsertById<T extends { _id: string }>(
  col: Collection,
  doc: T,
  setOnInsert: Record<string, unknown>,
): Promise<{ upserted: boolean }> {
  const { _id, ...rest } = doc;
  const result = await col.updateOne(
    { _id: _id as never },
    {
      $set: { ...rest, updatedAt: new Date() },
      $setOnInsert: { _id: _id as never, ...setOnInsert, createdAt: new Date() },
    },
    { upsert: true },
  );
  return { upserted: Boolean(result.upsertedId) };
}

async function seedBusinesses(db: Db): Promise<void> {
  const col = db.collection('businesses');
  for (const biz of BUSINESSES) {
    const { upserted } = await upsertById(
      col,
      {
        _id: biz._id,
        name: biz.name,
        slug: biz.slug,
        address: 'Cypress Test Address',
        phone: '809-555-9999',
        email: `info-${biz.slug}@cypress.test`,
        isActive: true,
      } as { _id: string },
      {},
    );
    logger.info(`  ${upserted ? 'inserted' : 'updated'} business ${biz.slug}`);
  }
}

async function seedBranches(db: Db): Promise<void> {
  const col = db.collection('branches');
  for (const biz of BUSINESSES) {
    const adminId = userIdFor(biz.emailSuffix === 'a' ? 1 : 2, 1);
    const { upserted } = await upsertById(
      col,
      {
        _id: biz.branchId,
        businessId: biz._id,
        name: biz.branchName,
        address: 'Cypress Test Address',
        phone: '809-555-9990',
        isActive: true,
      } as { _id: string },
      { createdBy: adminId },
    );
    logger.info(`  ${upserted ? 'inserted' : 'updated'} branch ${biz.branchName}`);
  }
}

async function seedUsers(db: Db): Promise<void> {
  const col = db.collection('users');
  // Hash all passwords once up-front (bcrypt is the slow part).
  const hashes = new Map<CypressRole, string>();
  await Promise.all(
    ROLES.map(async (role) => {
      hashes.set(role, await hashPassword(passwordFor(role)));
    }),
  );

  for (const biz of BUSINESSES) {
    const businessIndex = biz.emailSuffix === 'a' ? 1 : 2;
    for (let i = 0; i < ROLES.length; i++) {
      const role = ROLES[i]!;
      const userId = userIdFor(businessIndex, i + 1);
      const { upserted } = await upsertById(
        col,
        {
          _id: userId,
          businessId: biz._id,
          email: emailFor(role, biz),
          name: `Cypress ${role} ${biz.emailSuffix.toUpperCase()}`,
          passwordHash: hashes.get(role)!,
          role,
          branchIds: [biz.branchId],
          isActive: true,
        } as { _id: string },
        { createdBy: userIdFor(businessIndex, 1) },
      );
      logger.info(`  ${upserted ? 'inserted' : 'updated'} user ${emailFor(role, biz)} (${role})`);
    }
  }

  // Single super_admin that spans both Cypress businesses (and any other
  // business in the database) via the '*' sentinel. The business picker in
  // the header drives runtime tenant scoping.
  const superHash = await hashPassword(SUPER_ADMIN_PASSWORD);
  const { upserted: superInserted } = await upsertById(
    col,
    {
      _id: SUPER_ADMIN_USER_ID,
      businessId: '*',
      email: SUPER_ADMIN_EMAIL,
      name: 'Cypress Super Admin',
      passwordHash: superHash,
      role: 'super_admin',
      branchIds: [] as string[],
      isActive: true,
    } as { _id: string },
    { createdBy: SUPER_ADMIN_USER_ID },
  );
  logger.info(
    `  ${superInserted ? 'inserted' : 'updated'} user ${SUPER_ADMIN_EMAIL} (super_admin)`,
  );
}

async function seedFixedProductData(db: Db): Promise<void> {
  // One stable category and one stable product per business, used by the
  // multi-tenant suite to exercise cross-tenant 404s on known IDs without
  // having to discover them at runtime.
  const categories = db.collection('categories');
  const products = db.collection('products');

  for (const biz of BUSINESSES) {
    const adminId = userIdFor(biz.emailSuffix === 'a' ? 1 : 2, 1);
    await upsertById(
      categories,
      {
        _id: biz.categoryId,
        businessId: biz._id,
        name: 'Cypress Categoría',
        description: 'Categoría reservada para fixtures de Cypress',
        sortOrder: 999,
        isActive: true,
      } as { _id: string },
      { createdBy: adminId },
    );

    await upsertById(
      products,
      {
        _id: biz.productId,
        businessId: biz._id,
        branchId: biz.branchId,
        name: `Cypress Fixture ${biz.emailSuffix.toUpperCase()}`,
        description: 'Producto fijo para suites multi-tenant. No borrar.',
        price: 100,
        category: 'Cypress Categoría',
        sku: biz.productSku,
        stock: 999,
        trackStock: true,
        stockUnit: 'unit' as const,
        availability: { pos: true, online: false, kiosk: false },
        serviceSchedules: [] as string[],
        allergens: [] as string[],
        dietaryTags: [] as string[],
        modifierGroups: [] as Array<Record<string, unknown>>,
        kitchenStationIds: [] as string[],
        isActive: true,
      } as { _id: string },
      { createdBy: adminId },
    );
    logger.info(`  fixed category + product ready for ${biz.slug}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.info('KaiPOS Cypress Seed');
  logger.info('===================\n');

  assertLocalMongo();

  const db = await getDb();

  logger.info('Seeding Cypress fixtures...');
  await seedBusinesses(db);
  await seedBranches(db);
  await seedUsers(db);
  await seedFixedProductData(db);

  logger.info('\nDone! Cypress fixtures provisioned.');
  logger.info('Accounts (password = "cypress-<role>-pass-1"):');
  for (const biz of BUSINESSES) {
    for (const role of ROLES) {
      logger.info(`  ${emailFor(role, biz)}  →  ${biz.slug} / ${role}`);
    }
  }
  logger.info(`  ${SUPER_ADMIN_EMAIL}  →  super_admin (password = "${SUPER_ADMIN_PASSWORD}")`);
  await closeConnection();
}

main().catch((err) => {
  logger.error({ err }, 'seed-cypress failed');
  process.exit(1);
});
