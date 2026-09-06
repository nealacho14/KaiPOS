import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { type Db, type Document } from 'mongodb';
import { logger } from '../lib/logger.js';
import { getDb, closeConnection } from './client.js';

// ---------------------------------------------------------------------------
// db:purge-business — delete every document that belongs to ONE business.
//
// Dry-run by default: without `--yes` the script only counts what it would
// delete. Safe to point at prod Atlas (via MONGO_SECRET_ARN) precisely because
// nothing is written until `--yes` is passed and every expectation has been
// checked first.
//
//   pnpm --filter @kaipos/backend db:purge-business -- --slug <slug> \
//     [--expect-carried-over <email>]... [--yes]
//
// What is never touched: other businesses, the super_admin user
// (`businessId: '*'`), S3 objects (product images live under
// `products/<branchId>/`), and DynamoDB WebSocket connections.
// ---------------------------------------------------------------------------

export interface PurgeStep {
  collection: string;
  filter: Document;
}

export interface PurgePlan {
  business: { _id: string; name: string; slug: string };
  userIds: string[];
  userEmails: string[];
  branchIds: string[];
  steps: PurgeStep[];
}

export interface PurgeStepResult {
  collection: string;
  matched: number;
  deleted: number;
}

export class PurgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PurgeError';
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const PROTECTED_SLUG_PATTERN = /^cypress-/;

/**
 * The Cypress fixture businesses (`cypress-biz-a`, `cypress-biz-b`) are the
 * post-deploy smoke's ground truth; deleting one breaks E2E for everyone.
 * Refuse before opening a connection.
 */
export function assertPurgeableSlug(slug: string): void {
  if (!slug || slug.trim() === '') {
    throw new PurgeError('--slug is required');
  }
  if (PROTECTED_SLUG_PATTERN.test(slug)) {
    throw new PurgeError(
      `Refusing to purge "${slug}": slugs matching ${PROTECTED_SLUG_PATTERN} are the Cypress fixtures.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Resolve the business and build the ordered list of delete filters.
 * Children first, business last, so an interrupted run never leaves orphans
 * whose parent is already gone.
 */
export async function planBusinessPurge(db: Db, slug: string): Promise<PurgePlan> {
  const business = await db
    .collection<{ _id: string; name: string; slug: string }>('businesses')
    .findOne({ slug });
  if (!business) {
    throw new PurgeError(`Business with slug "${slug}" not found`);
  }
  const businessId = business._id;

  const users = await db
    .collection<{ _id: string; email: string }>('users')
    .find({ businessId }, { projection: { _id: 1, email: 1 } })
    .toArray();
  const userIds = users.map((u) => u._id);
  const userEmails = users.map((u) => u.email);

  const branches = await db
    .collection<{ _id: string }>('branches')
    .find({ businessId }, { projection: { _id: 1 } })
    .toArray();
  const branchIds = branches.map((b) => b._id);

  const steps: PurgeStep[] = [
    { collection: 'refreshTokens', filter: { userId: { $in: userIds } } },
    { collection: 'passwordResetTokens', filter: { userId: { $in: userIds } } },
    { collection: 'loginAttempts', filter: { email: { $in: userEmails } } },
    { collection: 'auditLogs', filter: { $or: [{ businessId }, { userId: { $in: userIds } }] } },
    { collection: 'orders', filter: { businessId } },
    { collection: 'productPreferences', filter: { businessId } },
    { collection: 'products', filter: { businessId } },
    { collection: 'categories', filter: { businessId } },
    { collection: 'kitchenStations', filter: { businessId } },
    { collection: 'users', filter: { businessId } },
    { collection: 'branches', filter: { businessId } },
    { collection: 'businesses', filter: { _id: businessId } },
  ];

  return {
    business: { _id: businessId, name: business.name, slug: business.slug },
    userIds,
    userEmails,
    branchIds,
    steps,
  };
}

// ---------------------------------------------------------------------------
// Expectations
// ---------------------------------------------------------------------------

/**
 * Every email passed via `--expect-carried-over` must already exist as a user
 * of some OTHER business. Guards against the "I re-created my account in the
 * new business, didn't I?" mistake before the old one is wiped.
 */
export async function assertCarriedOver(
  db: Db,
  emails: string[],
  doomedBusinessId: string,
): Promise<void> {
  if (emails.length === 0) return;

  const users = db.collection<{ _id: string; email: string; businessId: string }>('users');
  const missing: string[] = [];
  for (const email of emails) {
    const found = await users.findOne(
      { email, businessId: { $ne: doomedBusinessId } },
      { projection: { _id: 1 } },
    );
    if (!found) missing.push(email);
  }

  if (missing.length > 0) {
    throw new PurgeError(
      `Carry-over check failed — no user outside the doomed business for: ${missing.join(', ')}`,
    );
  }
  logger.info({ emails }, 'Carry-over check passed: every expected email exists elsewhere');
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

export async function executePurge(
  db: Db,
  plan: PurgePlan,
  { execute }: { execute: boolean },
): Promise<PurgeStepResult[]> {
  const { business, userEmails, branchIds } = plan;
  logger.info(
    {
      businessId: business._id,
      slug: business.slug,
      name: business.name,
      mode: execute ? 'EXECUTE' : 'dry-run',
    },
    'Purge target',
  );
  logger.info(
    { userEmails },
    `${execute ? 'Deleting' : 'Would delete'} ${userEmails.length} user(s)`,
  );
  logger.info(
    { s3Prefixes: branchIds.map((id) => `products/${id}/`) },
    'S3 prefixes left untouched in the assets bucket (delete manually if desired)',
  );

  const results: PurgeStepResult[] = [];
  for (const step of plan.steps) {
    const col = db.collection(step.collection);
    const matched = await col.countDocuments(step.filter);
    let deleted = 0;
    if (execute) {
      const res = await col.deleteMany(step.filter);
      deleted = res.deletedCount;
      logger.info({ collection: step.collection, matched, deleted }, 'Deleted');
    } else {
      logger.info({ collection: step.collection, matched }, 'Would delete');
    }
    results.push({ collection: step.collection, matched, deleted });
  }
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface PurgeCliOptions {
  slug: string;
  yes: boolean;
  expectCarriedOver: string[];
}

export function parsePurgeArgs(argv: string[]): PurgeCliOptions {
  // `pnpm run <script> -- --slug x` forwards the literal `--` to the script,
  // which parseArgs would treat as the end of options. Drop it.
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  const { values } = parseArgs({
    args,
    options: {
      slug: { type: 'string' },
      yes: { type: 'boolean', default: false },
      'expect-carried-over': { type: 'string', multiple: true, default: [] },
    },
    strict: true,
    allowPositionals: false,
  });
  return {
    slug: values.slug ?? '',
    yes: values.yes ?? false,
    expectCarriedOver: values['expect-carried-over'] ?? [],
  };
}

async function main(): Promise<void> {
  const opts = parsePurgeArgs(process.argv.slice(2));

  logger.info('KaiPOS Purge Business');
  logger.info('=====================');

  // Cheap guards first — nothing below opens a connection until these pass.
  assertPurgeableSlug(opts.slug);

  if (process.env.MONGO_SECRET_ARN) {
    logger.warn('!!! MONGO_SECRET_ARN is set — targeting Atlas (prod) !!!');
  }
  if (opts.yes) {
    logger.warn('!!! --yes given: documents WILL be deleted !!!');
  } else {
    logger.info('Dry-run (no --yes): counting only, nothing will be deleted');
  }

  const db = await getDb();
  try {
    const plan = await planBusinessPurge(db, opts.slug);
    await assertCarriedOver(db, opts.expectCarriedOver, plan.business._id);
    const summary = await executePurge(db, plan, { execute: opts.yes });

    const totalMatched = summary.reduce((n, s) => n + s.matched, 0);
    const totalDeleted = summary.reduce((n, s) => n + s.deleted, 0);
    logger.info(
      { summary, totalMatched, totalDeleted },
      opts.yes ? 'Purge complete' : 'Dry-run complete',
    );
    if (!opts.yes) {
      logger.info('Re-run with --yes to delete the documents listed above');
    }
  } finally {
    await closeConnection();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    logger.error({ err }, 'Purge failed');
    process.exit(1);
  });
}
