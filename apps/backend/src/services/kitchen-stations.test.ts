import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenPayload } from '@kaipos/shared/types';
import { create, listByBranch } from './kitchen-stations.js';

const { mockCollection } = vi.hoisted(() => ({
  mockCollection: {
    find: vi.fn(),
    insertOne: vi.fn(),
  },
}));

vi.mock('../db/collections.js', () => ({
  getKitchenStationsCollection: () => Promise.resolve(mockCollection),
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

function mockFindReturns<T>(docs: T[]): void {
  mockCollection.find.mockReturnValue({ toArray: () => Promise.resolve(docs) });
}

const adminPayload: TokenPayload = {
  userId: 'admin-1',
  businessId: 'biz-1',
  role: 'admin',
  branchIds: ['br-1'],
};

const managerPayload: TokenPayload = {
  userId: 'mgr-1',
  businessId: 'biz-1',
  role: 'manager',
  branchIds: ['br-1', 'br-2'],
};

const kitchenPayload: TokenPayload = {
  userId: 'k-1',
  businessId: 'biz-1',
  role: 'kitchen',
  branchIds: ['br-1'],
};

const superAdminPayload: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('kitchen-stations service', () => {
  describe('listByBranch', () => {
    it('returns stations scoped by businessId + branchId', async () => {
      mockFindReturns([
        {
          _id: 'st-1',
          businessId: 'biz-1',
          branchId: 'br-1',
          name: 'Cocina caliente',
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'admin-1',
        },
      ]);

      const result = await listByBranch(managerPayload, 'br-1');

      expect(result).toHaveLength(1);
      expect(mockCollection.find).toHaveBeenCalledWith({ businessId: 'biz-1', branchId: 'br-1' });
    });

    it('rejects when the branch is not in the user branchIds', async () => {
      await expect(listByBranch(kitchenPayload, 'br-other')).rejects.toThrow(
        'Access denied to this branch',
      );
      expect(mockCollection.find).not.toHaveBeenCalled();
    });

    it('admin bypasses branch scoping via branches:manage', async () => {
      mockFindReturns([]);

      await listByBranch(adminPayload, 'br-9');

      expect(mockCollection.find).toHaveBeenCalledWith({ businessId: 'biz-1', branchId: 'br-9' });
    });

    it('rejects super_admin with a 400 (no concrete business context)', async () => {
      await expect(listByBranch(superAdminPayload, 'br-1')).rejects.toMatchObject({
        statusCode: 400,
        code: 'MISSING_TARGET_BUSINESS_ID',
      });
      expect(mockCollection.find).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('inserts a new station scoped to the actor business', async () => {
      mockCollection.insertOne.mockResolvedValue({});

      const result = await create(managerPayload, { branchId: 'br-1', name: 'Parrilla' });

      expect(result).toMatchObject({
        businessId: 'biz-1',
        branchId: 'br-1',
        name: 'Parrilla',
        createdBy: 'mgr-1',
      });
      expect(typeof result._id).toBe('string');
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 'biz-1',
          branchId: 'br-1',
          name: 'Parrilla',
          createdBy: 'mgr-1',
        }),
      );
    });

    it('rejects when the branch is not in the actor branchIds', async () => {
      await expect(create(kitchenPayload, { branchId: 'br-other', name: 'Foo' })).rejects.toThrow(
        'Access denied to this branch',
      );
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });

    it('rejects super_admin (sentinel businessId "*")', async () => {
      await expect(
        create(superAdminPayload, { branchId: 'br-1', name: 'Foo' }),
      ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_TARGET_BUSINESS_ID' });
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });
  });
});
