import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Db } from 'mongodb';
import {
  assertPurgeableSlug,
  assertCarriedOver,
  executePurge,
  parsePurgeArgs,
  planBusinessPurge,
  PurgeError,
} from './purge-business.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

interface CollectionMock {
  findOne: ReturnType<typeof vi.fn>;
  find: ReturnType<typeof vi.fn>;
  countDocuments: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}

const COLLECTIONS = [
  'refreshTokens',
  'passwordResetTokens',
  'loginAttempts',
  'auditLogs',
  'orders',
  'productPreferences',
  'products',
  'categories',
  'kitchenStations',
  'users',
  'branches',
  'businesses',
] as const;

const BIZ_ID = '00000000-0000-4000-8000-000000000100';
const BIZ = { _id: BIZ_ID, name: 'La Cocina de Kai', slug: 'la-cocina-de-kai' };
const USERS = [
  { _id: 'u1', email: 'admin@lacocinadekai.com' },
  { _id: 'u2', email: 'cajero@lacocinadekai.com' },
  { _id: 'u3', email: 'kitchen@lacocinadekai.com' },
];
const BRANCHES = [{ _id: 'b1' }, { _id: 'b2' }];

function makeCollection(): CollectionMock {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    countDocuments: vi.fn().mockResolvedValue(0),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
  };
}

function makeDb(): { db: Db; cols: Record<(typeof COLLECTIONS)[number], CollectionMock> } {
  const cols = Object.fromEntries(COLLECTIONS.map((name) => [name, makeCollection()])) as Record<
    (typeof COLLECTIONS)[number],
    CollectionMock
  >;
  const db = {
    collection: (name: string) => {
      const col = cols[name as (typeof COLLECTIONS)[number]];
      if (!col) throw new Error(`Unexpected collection ${name}`);
      return col;
    },
  } as unknown as Db;
  return { db, cols };
}

function seedPlanInputs(cols: ReturnType<typeof makeDb>['cols']): void {
  cols.businesses.findOne.mockResolvedValue(BIZ);
  cols.users.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(USERS) });
  cols.branches.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(BRANCHES) });
}

describe('assertPurgeableSlug', () => {
  it('refuses cypress fixture slugs', () => {
    expect(() => assertPurgeableSlug('cypress-biz-a')).toThrow(PurgeError);
    expect(() => assertPurgeableSlug('cypress-biz-b')).toThrow(/Cypress/);
    expect(() => assertPurgeableSlug('cypress-')).toThrow(PurgeError);
  });

  it('refuses an empty slug', () => {
    expect(() => assertPurgeableSlug('')).toThrow(/--slug is required/);
    expect(() => assertPurgeableSlug('   ')).toThrow(/--slug is required/);
  });

  it('accepts ordinary slugs, including ones that merely contain "cypress"', () => {
    expect(() => assertPurgeableSlug('la-cocina-de-kai')).not.toThrow();
    expect(() => assertPurgeableSlug('my-cypress-cafe')).not.toThrow();
  });
});

describe('parsePurgeArgs', () => {
  it('parses slug, yes and repeatable expect-carried-over', () => {
    expect(
      parsePurgeArgs([
        '--slug',
        'la-cocina-de-kai',
        '--expect-carried-over',
        'a@x.com',
        '--expect-carried-over',
        'b@x.com',
        '--yes',
      ]),
    ).toEqual({
      slug: 'la-cocina-de-kai',
      yes: true,
      expectCarriedOver: ['a@x.com', 'b@x.com'],
    });
  });

  it('defaults to dry-run with no expectations', () => {
    expect(parsePurgeArgs(['--slug', 's'])).toEqual({
      slug: 's',
      yes: false,
      expectCarriedOver: [],
    });
  });

  it('ignores the leading "--" that pnpm run forwards', () => {
    expect(parsePurgeArgs(['--', '--slug', 's', '--yes'])).toEqual({
      slug: 's',
      yes: true,
      expectCarriedOver: [],
    });
  });

  it('rejects unknown flags', () => {
    expect(() => parsePurgeArgs(['--slug', 's', '--force'])).toThrow();
  });
});

describe('planBusinessPurge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unknown slug without touching child collections', async () => {
    const { db, cols } = makeDb();
    cols.businesses.findOne.mockResolvedValue(null);

    await expect(planBusinessPurge(db, 'nope')).rejects.toThrow(/"nope" not found/);
    expect(cols.users.find).not.toHaveBeenCalled();
  });

  it('builds exactly 12 child-first steps with the expected filters', async () => {
    const { db, cols } = makeDb();
    seedPlanInputs(cols);

    const plan = await planBusinessPurge(db, 'la-cocina-de-kai');

    expect(cols.businesses.findOne).toHaveBeenCalledWith({ slug: 'la-cocina-de-kai' });
    expect(cols.users.find).toHaveBeenCalledWith(
      { businessId: BIZ_ID },
      { projection: { _id: 1, email: 1 } },
    );
    expect(cols.branches.find).toHaveBeenCalledWith(
      { businessId: BIZ_ID },
      { projection: { _id: 1 } },
    );

    expect(plan.business).toEqual(BIZ);
    expect(plan.userIds).toEqual(['u1', 'u2', 'u3']);
    expect(plan.userEmails).toEqual([
      'admin@lacocinadekai.com',
      'cajero@lacocinadekai.com',
      'kitchen@lacocinadekai.com',
    ]);
    expect(plan.branchIds).toEqual(['b1', 'b2']);

    const userIds = ['u1', 'u2', 'u3'];
    const userEmails = [
      'admin@lacocinadekai.com',
      'cajero@lacocinadekai.com',
      'kitchen@lacocinadekai.com',
    ];
    expect(plan.steps).toHaveLength(12);
    expect(plan.steps).toEqual([
      { collection: 'refreshTokens', filter: { userId: { $in: userIds } } },
      { collection: 'passwordResetTokens', filter: { userId: { $in: userIds } } },
      { collection: 'loginAttempts', filter: { email: { $in: userEmails } } },
      {
        collection: 'auditLogs',
        filter: { $or: [{ businessId: BIZ_ID }, { userId: { $in: userIds } }] },
      },
      { collection: 'orders', filter: { businessId: BIZ_ID } },
      { collection: 'productPreferences', filter: { businessId: BIZ_ID } },
      { collection: 'products', filter: { businessId: BIZ_ID } },
      { collection: 'categories', filter: { businessId: BIZ_ID } },
      { collection: 'kitchenStations', filter: { businessId: BIZ_ID } },
      { collection: 'users', filter: { businessId: BIZ_ID } },
      { collection: 'branches', filter: { businessId: BIZ_ID } },
      { collection: 'businesses', filter: { _id: BIZ_ID } },
    ]);
  });
});

describe('assertCarriedOver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op with no expectations', async () => {
    const { db, cols } = makeDb();
    await expect(assertCarriedOver(db, [], BIZ_ID)).resolves.toBeUndefined();
    expect(cols.users.findOne).not.toHaveBeenCalled();
  });

  it('passes when the email exists under another businessId', async () => {
    const { db, cols } = makeDb();
    cols.users.findOne.mockResolvedValue({ _id: 'u9' });

    await expect(
      assertCarriedOver(db, ['admin@lacocinadekai.com'], BIZ_ID),
    ).resolves.toBeUndefined();
    expect(cols.users.findOne).toHaveBeenCalledWith(
      { email: 'admin@lacocinadekai.com', businessId: { $ne: BIZ_ID } },
      { projection: { _id: 1 } },
    );
  });

  it('fails listing every email that only exists inside the doomed business', async () => {
    const { db, cols } = makeDb();
    // The `$ne` filter is what excludes the doomed business; a mock that only
    // "knows" the doomed user answers null to it, as Mongo would.
    cols.users.findOne.mockImplementation(async (filter: { email: string }) =>
      filter.email === 'kept@x.com' ? { _id: 'u9' } : null,
    );

    await expect(
      assertCarriedOver(db, ['kept@x.com', 'lost@x.com', 'gone@x.com'], BIZ_ID),
    ).rejects.toThrow(/lost@x.com, gone@x.com/);
  });
});

describe('executePurge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function makePlan() {
    const { db, cols } = makeDb();
    seedPlanInputs(cols);
    const plan = await planBusinessPurge(db, 'la-cocina-de-kai');
    return { db, cols, plan };
  }

  it('dry-run counts every step and never calls deleteMany', async () => {
    const { db, cols, plan } = await makePlan();
    for (const name of COLLECTIONS) cols[name].countDocuments.mockResolvedValue(2);

    const summary = await executePurge(db, plan, { execute: false });

    for (const step of plan.steps) {
      expect(
        cols[step.collection as (typeof COLLECTIONS)[number]].countDocuments,
      ).toHaveBeenCalledWith(step.filter);
    }
    for (const name of COLLECTIONS) {
      expect(cols[name].deleteMany).not.toHaveBeenCalled();
    }
    expect(summary).toHaveLength(12);
    expect(summary.every((s) => s.matched === 2 && s.deleted === 0)).toBe(true);
  });

  it('execute calls deleteMany with each step filter in child-first order', async () => {
    const { db, cols, plan } = await makePlan();
    const callOrder: string[] = [];
    for (const name of COLLECTIONS) {
      cols[name].countDocuments.mockResolvedValue(1);
      cols[name].deleteMany.mockImplementation(async () => {
        callOrder.push(name);
        return { deletedCount: 1 };
      });
    }

    const summary = await executePurge(db, plan, { execute: true });

    expect(callOrder).toEqual([...COLLECTIONS]);
    for (const step of plan.steps) {
      expect(cols[step.collection as (typeof COLLECTIONS)[number]].deleteMany).toHaveBeenCalledWith(
        step.filter,
      );
    }
    expect(summary).toEqual(
      COLLECTIONS.map((collection) => ({ collection, matched: 1, deleted: 1 })),
    );
  });
});
