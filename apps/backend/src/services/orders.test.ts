import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Order, TokenPayload } from '@kaipos/shared/types';
import { createOrder, updateOrderStatus } from './orders.js';

const { mockCollection, mockPublishToChannel, mockLogAudit } = vi.hoisted(() => ({
  mockCollection: {
    insertOne: vi.fn(),
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
  mockPublishToChannel: vi.fn(),
  mockLogAudit: vi.fn(),
}));

vi.mock('../db/collections.js', () => ({
  getOrdersCollection: () => Promise.resolve(mockCollection),
}));

vi.mock('../lib/ws-publish.js', () => ({
  publishToChannel: mockPublishToChannel,
}));

vi.mock('./audit.js', () => ({
  logAuditEvent: mockLogAudit,
}));

vi.mock('../lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));

const cashier: TokenPayload = {
  userId: 'u-1',
  businessId: 'biz-1',
  role: 'cashier',
  branchIds: ['br-1'],
};

const kitchen: TokenPayload = {
  userId: 'k-1',
  businessId: 'biz-1',
  role: 'kitchen',
  branchIds: ['br-1'],
};

const superAdmin: TokenPayload = {
  userId: 'sa-1',
  businessId: '*',
  role: 'super_admin',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCollection.insertOne.mockResolvedValue({});
  mockCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
  mockPublishToChannel.mockResolvedValue({ targets: 0, delivered: 0, stale: 0, failed: 0 });
});

describe('orders service', () => {
  describe('createOrder', () => {
    it('computes subtotal/tax/total and persists a pending order scoped to the actor', async () => {
      const result = await createOrder(cashier, {
        branchId: 'br-1',
        paymentMethod: 'cash',
        taxRate: 0.1,
        items: [
          { productId: 'p-1', productName: 'Taco', quantity: 2, unitPrice: 5 },
          { productId: 'p-2', productName: 'Soda', quantity: 1, unitPrice: 3 },
        ],
      });

      expect(result.businessId).toBe('biz-1');
      expect(result.branchId).toBe('br-1');
      expect(result.status).toBe('pending');
      expect(result.subtotal).toBe(13);
      expect(result.tax).toBeCloseTo(1.3, 5);
      expect(result.total).toBeCloseTo(14.3, 5);
      expect(result.items[0].subtotal).toBe(10);
      expect(result.orderNumber).toMatch(/^ORD-/);
      expect(mockCollection.insertOne).toHaveBeenCalledOnce();

      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order_created', target: result._id }),
      );
    });

    it('rolls modifier prices into the item subtotal', async () => {
      const result = await createOrder(cashier, {
        branchId: 'br-1',
        paymentMethod: 'card',
        items: [
          {
            productId: 'p-1',
            productName: 'Taco',
            quantity: 2,
            unitPrice: 5,
            modifiers: [{ modifierId: 'm-1', name: 'Extra', optionName: 'Cheese', price: 1.5 }],
          },
        ],
      });

      expect(result.subtotal).toBe(13);
      expect(result.items[0].modifiers).toHaveLength(1);
    });

    it('rejects when the branch is not in the actor branchIds', async () => {
      await expect(
        createOrder(cashier, {
          branchId: 'br-foreign',
          paymentMethod: 'cash',
          items: [{ productId: 'p', productName: 'x', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toThrow('Access denied to this branch');
      expect(mockCollection.insertOne).not.toHaveBeenCalled();
    });

    it('rejects super_admin (sentinel businessId)', async () => {
      await expect(
        createOrder(superAdmin, {
          branchId: 'br-1',
          paymentMethod: 'cash',
          items: [{ productId: 'p', productName: 'x', quantity: 1, unitPrice: 1 }],
        }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('updateOrderStatus', () => {
    const existing: Order = {
      _id: 'o-1',
      businessId: 'biz-1',
      branchId: 'br-1',
      orderNumber: 'ORD-ABC-123',
      items: [
        {
          productId: 'p-1',
          productName: 'Taco',
          quantity: 1,
          unitPrice: 5,
          subtotal: 5,
          modifiers: [],
        },
      ],
      subtotal: 5,
      tax: 0,
      total: 5,
      status: 'pending',
      paymentMethod: 'cash',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'u-1',
    };

    it('publishes order.status-changed on the branch channel after updating', async () => {
      mockCollection.findOne.mockResolvedValue(existing);

      const result = await updateOrderStatus(kitchen, 'o-1', 'completed');

      expect(result.status).toBe('completed');
      expect(mockCollection.updateOne).toHaveBeenCalledWith(
        { _id: 'o-1', businessId: 'biz-1' },
        expect.objectContaining({ $set: expect.objectContaining({ status: 'completed' }) }),
      );
      expect(mockPublishToChannel).toHaveBeenCalledWith('branch:br-1', {
        type: 'order.status-changed',
        payload: {
          orderId: 'o-1',
          orderNumber: 'ORD-ABC-123',
          status: 'completed',
        },
      });
      expect(mockLogAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order_status_changed', target: 'o-1' }),
      );
    });

    it('returns 404 (not 403) for cross-tenant access to avoid leaking existence', async () => {
      mockCollection.findOne.mockResolvedValue(null);

      await expect(updateOrderStatus(kitchen, 'o-1', 'completed')).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(mockPublishToChannel).not.toHaveBeenCalled();
    });

    it('rejects when the order branch is outside the actor branchIds', async () => {
      mockCollection.findOne.mockResolvedValue({ ...existing, branchId: 'br-foreign' });

      await expect(updateOrderStatus(kitchen, 'o-1', 'completed')).rejects.toThrow(
        'Access denied to this branch',
      );
      expect(mockCollection.updateOne).not.toHaveBeenCalled();
      expect(mockPublishToChannel).not.toHaveBeenCalled();
    });

    it('still succeeds if the WS publish fails (DB write is the source of truth)', async () => {
      mockCollection.findOne.mockResolvedValue(existing);
      mockPublishToChannel.mockRejectedValueOnce(new Error('ws down'));

      const result = await updateOrderStatus(kitchen, 'o-1', 'completed');

      expect(result.status).toBe('completed');
    });
  });
});
