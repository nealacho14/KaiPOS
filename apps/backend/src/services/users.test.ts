import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenPayload, User } from '@kaipos/shared/types';
import { listUsers, getUserById, createUser, updateUser, deactivateUser } from './users.js';

const { mockUsersCollection, mockLogAuditEvent } = vi.hoisted(() => ({
  mockUsersCollection: {
    find: vi.fn(),
    findOne: vi.fn(),
    insertOne: vi.fn(),
    updateOne: vi.fn(),
  },
  mockLogAuditEvent: vi.fn(),
}));

vi.mock('../db/collections.js', () => ({
  getUsersCollection: () => Promise.resolve(mockUsersCollection),
}));

vi.mock('../lib/password.js', () => ({
  hashPassword: vi.fn((plain: string) => Promise.resolve(`hashed_${plain}`)),
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('./audit.js', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

const now = new Date('2025-01-01T00:00:00Z');

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: 'u-1',
    businessId: 'biz-1',
    email: 'user@test.com',
    name: 'User',
    passwordHash: 'hashed_secret',
    role: 'cashier',
    branchIds: ['branch-1'],
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: 'admin-1',
    ...overrides,
  };
}

const adminPayload: TokenPayload = {
  userId: 'admin-1',
  businessId: 'biz-1',
  role: 'admin',
};

const superAdminPayload: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

const managerPayload: TokenPayload = {
  userId: 'mgr-1',
  businessId: 'biz-1',
  role: 'manager',
};

const cashierPayload: TokenPayload = {
  userId: 'cash-1',
  businessId: 'biz-1',
  role: 'cashier',
};

const ctx = { route: '/api/users', method: 'POST' };

function mockFindReturns(docs: User[]): void {
  mockUsersCollection.find.mockReturnValue({
    toArray: () => Promise.resolve(docs),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('users service', () => {
  describe('listUsers', () => {
    it('filters by actor.businessId for non-super_admin', async () => {
      mockFindReturns([makeUser()]);

      await listUsers(adminPayload);

      expect(mockUsersCollection.find).toHaveBeenCalledWith({ businessId: 'biz-1' });
    });

    it('returns users without passwordHash', async () => {
      mockFindReturns([makeUser()]);

      const result = await listUsers(adminPayload);

      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0].email).toBe('user@test.com');
    });

    it('super_admin without businessId returns no filter', async () => {
      mockFindReturns([makeUser()]);

      await listUsers(superAdminPayload);

      expect(mockUsersCollection.find).toHaveBeenCalledWith({});
    });

    it('super_admin with businessId filters by that business', async () => {
      mockFindReturns([makeUser({ businessId: 'biz-other' })]);

      await listUsers(superAdminPayload, { businessId: 'biz-other' });

      expect(mockUsersCollection.find).toHaveBeenCalledWith({ businessId: 'biz-other' });
    });
  });

  describe('getUserById', () => {
    it('returns the user when found in actor scope', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUser());

      const result = await getUserById(adminPayload, 'u-1');

      expect(result.email).toBe('user@test.com');
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockUsersCollection.findOne).toHaveBeenCalledWith({
        _id: 'u-1',
        businessId: 'biz-1',
      });
    });

    it('throws NotFoundError when cross-tenant (admin in another business)', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(getUserById(adminPayload, 'u-other')).rejects.toThrow('User not found');
    });

    it('super_admin can fetch across businesses', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUser({ businessId: 'biz-99' }));

      const result = await getUserById(superAdminPayload, 'u-1');

      expect(result.businessId).toBe('biz-99');
      expect(mockUsersCollection.findOne).toHaveBeenCalledWith({ _id: 'u-1' });
    });
  });

  describe('createUser', () => {
    it('admin creates a user in their business', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      const result = await createUser(
        adminPayload,
        {
          email: 'new@test.com',
          password: 'password123',
          name: 'New',
          role: 'cashier',
        },
        ctx,
      );

      expect(result.email).toBe('new@test.com');
      expect(result.businessId).toBe('biz-1');
      expect(result).not.toHaveProperty('passwordHash');
      expect(mockUsersCollection.insertOne).toHaveBeenCalledOnce();
      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'register', target: 'new@test.com' }),
      );
    });

    it('throws DUPLICATE_EMAIL on existing email within business', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUser({ email: 'dup@test.com' }));

      await expect(
        createUser(
          adminPayload,
          { email: 'dup@test.com', password: 'password123', name: 'Dup', role: 'cashier' },
          ctx,
        ),
      ).rejects.toThrow('A user with this email already exists');
    });

    it('manager can create a cashier', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      const result = await createUser(
        managerPayload,
        {
          email: 'cashier@test.com',
          password: 'password123',
          name: 'Cashier',
          role: 'cashier',
        },
        ctx,
      );

      expect(result.role).toBe('cashier');
    });

    it('manager cannot create an admin (role-boundary)', async () => {
      await expect(
        createUser(
          managerPayload,
          {
            email: 'fake-admin@test.com',
            password: 'password123',
            name: 'Nope',
            role: 'admin',
          },
          ctx,
        ),
      ).rejects.toThrow('Managers cannot assign this role');

      expect(mockLogAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'authorization_failed',
          metadata: expect.objectContaining({
            permission: 'users:write',
            targetRole: 'admin',
          }),
        }),
      );
      expect(mockUsersCollection.insertOne).not.toHaveBeenCalled();
    });

    it('manager cannot create another manager (role-boundary)', async () => {
      await expect(
        createUser(
          managerPayload,
          { email: 'm2@test.com', password: 'password123', name: 'M2', role: 'manager' },
          ctx,
        ),
      ).rejects.toThrow('Managers cannot assign this role');
    });

    it('super_admin must supply a target businessId', async () => {
      await expect(
        createUser(
          superAdminPayload,
          { email: 'new@test.com', password: 'password123', name: 'New', role: 'cashier' },
          ctx,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_TARGET_BUSINESS_ID' });
      expect(mockUsersCollection.insertOne).not.toHaveBeenCalled();
    });

    it('super_admin creates a user in the specified target business', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      const result = await createUser(
        superAdminPayload,
        {
          email: 'new@test.com',
          password: 'password123',
          name: 'New',
          role: 'admin',
          businessId: 'biz-target',
        },
        ctx,
      );

      expect(result.businessId).toBe('biz-target');
      expect(mockUsersCollection.findOne).toHaveBeenCalledWith({
        email: 'new@test.com',
        businessId: 'biz-target',
      });
      expect(mockUsersCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-target' }),
      );
    });

    it('super_admin cannot create with sentinel businessId "*"', async () => {
      await expect(
        createUser(
          superAdminPayload,
          {
            email: 'new@test.com',
            password: 'password123',
            name: 'New',
            role: 'admin',
            businessId: '*',
          },
          ctx,
        ),
      ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_TARGET_BUSINESS_ID' });
      expect(mockUsersCollection.insertOne).not.toHaveBeenCalled();
    });

    it('non-super_admin ignores businessId in body and uses actor.businessId', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);
      mockUsersCollection.insertOne.mockResolvedValue({});

      const result = await createUser(
        adminPayload,
        {
          email: 'new@test.com',
          password: 'password123',
          name: 'New',
          role: 'cashier',
          businessId: 'biz-other',
        },
        ctx,
      );

      expect(result.businessId).toBe('biz-1');
      expect(mockUsersCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({ businessId: 'biz-1' }),
      );
    });
  });

  describe('updateUser', () => {
    it('admin updates name in their business', async () => {
      const existing = makeUser();
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);
      mockUsersCollection.updateOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValueOnce({ ...existing, name: 'Renamed' });

      const result = await updateUser(adminPayload, 'u-1', { name: 'Renamed' }, ctx);

      expect(result.name).toBe('Renamed');
      expect(mockUsersCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'u-1' },
        { $set: expect.objectContaining({ name: 'Renamed', updatedAt: expect.any(Date) }) },
      );
    });

    it('throws NotFoundError when target is in another business', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(updateUser(adminPayload, 'u-other', { name: 'X' }, ctx)).rejects.toThrow(
        'User not found',
      );
    });

    it('manager cannot update existing admin (role-boundary on existing)', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUser({ role: 'admin' }));

      await expect(updateUser(managerPayload, 'u-1', { name: 'X' }, ctx)).rejects.toThrow(
        'Managers cannot assign this role',
      );
    });

    it('manager cannot patch cashier to admin (role-boundary on patch)', async () => {
      mockUsersCollection.findOne.mockResolvedValue(makeUser({ role: 'cashier' }));

      await expect(updateUser(managerPayload, 'u-1', { role: 'admin' }, ctx)).rejects.toThrow(
        'Managers cannot assign this role',
      );
    });

    it('strips disallowed fields from patch (only whitelisted keys applied)', async () => {
      const existing = makeUser();
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);
      mockUsersCollection.updateOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);

      await updateUser(adminPayload, 'u-1', { isActive: false, name: 'Still Here' }, ctx);

      const setArg = mockUsersCollection.updateOne.mock.calls[0][1].$set;
      expect(setArg).not.toHaveProperty('passwordHash');
      expect(setArg).not.toHaveProperty('businessId');
      expect(setArg).not.toHaveProperty('_id');
      expect(setArg).not.toHaveProperty('createdAt');
      expect(setArg).not.toHaveProperty('createdBy');
      expect(setArg).toHaveProperty('updatedAt');
    });
  });

  describe('deactivateUser', () => {
    it('admin deactivates another user', async () => {
      const existing = makeUser();
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);
      mockUsersCollection.updateOne.mockResolvedValue({});
      mockUsersCollection.findOne.mockResolvedValueOnce({ ...existing, isActive: false });

      const result = await deactivateUser(adminPayload, 'u-1', ctx);

      expect(result.isActive).toBe(false);
      expect(mockUsersCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'u-1' },
        { $set: expect.objectContaining({ isActive: false }) },
      );
    });

    it('is idempotent — returns current state without updateOne when already inactive', async () => {
      const existing = makeUser({ isActive: false });
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);
      mockUsersCollection.findOne.mockResolvedValueOnce(existing);

      const result = await deactivateUser(adminPayload, 'u-1', ctx);

      expect(result.isActive).toBe(false);
      expect(mockUsersCollection.updateOne).not.toHaveBeenCalled();
    });

    it('rejects self-deactivation with CANNOT_DEACTIVATE_SELF', async () => {
      await expect(deactivateUser(adminPayload, 'admin-1', ctx)).rejects.toMatchObject({
        statusCode: 403,
        code: 'CANNOT_DEACTIVATE_SELF',
      });
    });

    it('throws NotFoundError when target is in another business', async () => {
      mockUsersCollection.findOne.mockResolvedValue(null);

      await expect(deactivateUser(adminPayload, 'u-other', ctx)).rejects.toThrow('User not found');
    });
  });

  describe('non-admin actors', () => {
    it('cashier payload still scopes to their businessId (listUsers)', async () => {
      mockFindReturns([]);

      await listUsers(cashierPayload);

      expect(mockUsersCollection.find).toHaveBeenCalledWith({ businessId: 'biz-1' });
    });
  });
});
