import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Db } from 'mongodb';
import { logger } from '../lib/logger.js';
import { hashPassword } from '../lib/password.js';
import { resolveMuraUsers, seedData } from './seed.js';
import {
  MURA_ADMIN_EMAIL,
  MURA_ADMIN_USER_ID,
  MURA_BRANCH_ID,
  MURA_BUSINESS_ID,
  MURA_CARRY_OVER_EMAIL,
  MURA_KELVIN_USER_ID,
  MURA_SLUG,
} from './seed-data/mura-menu.js';

vi.mock('../lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../lib/password.js', () => ({
  hashPassword: vi.fn(async (p: string) => `hashed:${p}`),
}));

interface CollectionMock {
  findOne: ReturnType<typeof vi.fn>;
  insertOne: ReturnType<typeof vi.fn>;
  insertMany: ReturnType<typeof vi.fn>;
}

function makeCollection(): CollectionMock {
  return {
    findOne: vi.fn().mockResolvedValue(null),
    insertOne: vi.fn().mockResolvedValue({ acknowledged: true }),
    insertMany: vi.fn().mockResolvedValue({ acknowledged: true }),
  };
}

function makeDb(): { db: Db; collections: Record<string, CollectionMock> } {
  const collections: Record<string, CollectionMock> = {};
  const db = {
    collection: (name: string) => {
      collections[name] ??= makeCollection();
      return collections[name];
    },
  } as unknown as Db;
  return { db, collections };
}

const EXISTING_HASH = '$2a$12$existing-hash-from-another-business';

describe('resolveMuraUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('carries over the passwordHash when kelvin exists in another business', async () => {
    const { db, collections } = makeDb();
    db.collection('users');
    collections.users!.findOne.mockResolvedValue({
      _id: 'other-user',
      businessId: 'other-business',
      email: MURA_CARRY_OVER_EMAIL,
      passwordHash: EXISTING_HASH,
    });

    const users = await resolveMuraUsers(db, { MURA_ADMIN_PASSWORD: 'secret' });

    expect(collections.users!.findOne).toHaveBeenCalledWith({
      email: MURA_CARRY_OVER_EMAIL,
      businessId: { $ne: MURA_BUSINESS_ID },
    });
    expect(users).toHaveLength(2);
    const kelvin = users.find((u) => u.email === MURA_CARRY_OVER_EMAIL)!;
    expect(kelvin.passwordHash).toBe(EXISTING_HASH);
    expect(kelvin._id).toBe(MURA_KELVIN_USER_ID);
    expect(hashPassword).toHaveBeenCalledTimes(1);
    expect(hashPassword).toHaveBeenCalledWith('secret');
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ email: MURA_CARRY_OVER_EMAIL }),
      'carried over passwordHash from business other-business',
    );
  });

  it('hashes MURA_KELVIN_PASSWORD when there is no carry-over user', async () => {
    const { db } = makeDb();

    const users = await resolveMuraUsers(db, {
      MURA_ADMIN_PASSWORD: 'secret',
      MURA_KELVIN_PASSWORD: 'kelvin-pass',
    });

    const kelvin = users.find((u) => u.email === MURA_CARRY_OVER_EMAIL)!;
    expect(kelvin.passwordHash).toBe('hashed:kelvin-pass');
    expect(hashPassword).toHaveBeenCalledWith('kelvin-pass');
  });

  it('skips kelvin locally when no password source exists', async () => {
    const { db } = makeDb();

    const users = await resolveMuraUsers(db, { MURA_ADMIN_PASSWORD: 'secret' });

    expect(users.map((u) => u.email)).toEqual([MURA_ADMIN_EMAIL]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ email: MURA_CARRY_OVER_EMAIL }),
      expect.stringContaining('skipping this user'),
    );
  });

  it('throws on Atlas when kelvin has no password source', async () => {
    const { db } = makeDb();

    await expect(
      resolveMuraUsers(db, { MURA_ADMIN_PASSWORD: 'secret', MONGO_SECRET_ARN: 'arn:...' }),
    ).rejects.toThrow(/Refusing to seed Mura on Atlas without a password source/);
  });

  it("falls back to 'admin123' for the admin locally when MURA_ADMIN_PASSWORD is unset", async () => {
    const { db } = makeDb();

    const users = await resolveMuraUsers(db, {});

    const admin = users.find((u) => u.email === MURA_ADMIN_EMAIL)!;
    expect(admin.passwordHash).toBe('hashed:admin123');
    expect(admin).toMatchObject({
      _id: MURA_ADMIN_USER_ID,
      businessId: MURA_BUSINESS_ID,
      role: 'admin',
      branchIds: [MURA_BRANCH_ID],
      isActive: true,
      createdBy: MURA_ADMIN_USER_ID,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ email: MURA_ADMIN_EMAIL }),
      expect.stringContaining('MURA_ADMIN_PASSWORD not set'),
    );
  });

  it('throws on Atlas when MURA_ADMIN_PASSWORD is unset', async () => {
    const { db } = makeDb();

    await expect(resolveMuraUsers(db, { MONGO_SECRET_ARN: 'arn:...' })).rejects.toThrow(
      /MURA_ADMIN_PASSWORD/,
    );
  });
});

describe('seedData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MONGO_SECRET_ARN', '');
    vi.stubEnv('MURA_ADMIN_PASSWORD', 'secret');
    vi.stubEnv('MURA_KELVIN_PASSWORD', 'kelvin-pass');
    vi.stubEnv('MURA_IMAGE_BASE_URL', 'https://cdn.example.com/');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('skips when the Mura business already exists', async () => {
    const { db, collections } = makeDb();
    db.collection('businesses');
    collections.businesses!.findOne.mockResolvedValue({ _id: MURA_BUSINESS_ID, slug: MURA_SLUG });

    await seedData(db);

    expect(collections.businesses!.findOne).toHaveBeenCalledWith({ slug: MURA_SLUG });
    expect(collections.businesses!.insertOne).not.toHaveBeenCalled();
    expect(collections.products).toBeUndefined();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Skipping'));
  });

  it('inserts the business, branch, 2 users, 13 categories, 64 products and 5 preferences', async () => {
    const { db, collections } = makeDb();

    await seedData(db);

    expect(collections.businesses!.insertOne).toHaveBeenCalledTimes(1);
    expect(collections.businesses!.insertOne.mock.calls[0]![0]).toMatchObject({
      _id: MURA_BUSINESS_ID,
      slug: MURA_SLUG,
      currency: 'COP',
    });
    expect(collections.branches!.insertOne).toHaveBeenCalledTimes(1);
    expect(collections.branches!.insertOne.mock.calls[0]![0]).toMatchObject({
      _id: MURA_BRANCH_ID,
      businessId: MURA_BUSINESS_ID,
    });

    const users = collections.users!.insertMany.mock.calls[0]![0] as Array<{ email: string }>;
    expect(users.map((u) => u.email)).toEqual([MURA_ADMIN_EMAIL, MURA_CARRY_OVER_EMAIL]);

    expect(collections.categories!.insertMany.mock.calls[0]![0]).toHaveLength(13);

    const products = collections.products!.insertMany.mock.calls[0]![0] as Array<{
      imageUrl: string;
    }>;
    expect(products).toHaveLength(64);
    // Trailing slash on MURA_IMAGE_BASE_URL is stripped.
    expect(products[0]!.imageUrl).toBe(
      `https://cdn.example.com/products/${MURA_BRANCH_ID}/placeholder.webp`,
    );

    expect(collections.productPreferences!.insertMany.mock.calls[0]![0]).toHaveLength(5);
    expect(collections.kitchenStations).toBeUndefined();
  });
});
