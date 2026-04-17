import {
  calculateOrderTotal,
  channelFor,
  generateOrderNumber,
  type AppliedModifier,
  type Order,
  type OrderItem,
  type OrderStatus,
  type TokenPayload,
} from '@kaipos/shared';
import { getOrdersCollection } from '../db/collections.js';
import { NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import { assertBranchAccess } from '../middleware/branch-access.js';
import { SUPER_ADMIN_BUSINESS_ID } from '../lib/permissions.js';
import { publishToChannel } from '../lib/ws-publish.js';
import type { CreateOrderInput } from '../schemas/orders.js';
import { logAuditEvent } from './audit.js';

const log = createLogger({ module: 'orders-service' });

function resolveBusinessId(actor: TokenPayload): string {
  // Super_admin has no concrete tenant context on their token. They can't
  // create or mutate orders without adopting one, which is out of scope here.
  if (actor.businessId === SUPER_ADMIN_BUSINESS_ID) {
    throw new NotFoundError('Order');
  }
  return actor.businessId;
}

function buildItem(input: CreateOrderInput['items'][number]): OrderItem {
  const modifiers: AppliedModifier[] = input.modifiers ?? [];
  const modifiersTotal = modifiers.reduce((sum, m) => sum + m.price, 0);
  const subtotal = (input.unitPrice + modifiersTotal) * input.quantity;
  return {
    productId: input.productId,
    productName: input.productName,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    subtotal,
    modifiers,
  };
}

export async function createOrder(actor: TokenPayload, input: CreateOrderInput): Promise<Order> {
  assertBranchAccess(actor, input.branchId);
  const businessId = resolveBusinessId(actor);

  const items = input.items.map(buildItem);
  const { subtotal, tax, total } = calculateOrderTotal(
    items.map((i) => ({ quantity: 1, unitPrice: i.subtotal })),
    input.taxRate ?? 0,
  );

  const now = new Date();
  const order: Order = {
    _id: crypto.randomUUID(),
    businessId,
    branchId: input.branchId,
    orderNumber: generateOrderNumber(),
    items,
    subtotal,
    tax,
    total,
    status: 'pending',
    paymentMethod: input.paymentMethod,
    ...(input.customerId && { customerId: input.customerId }),
    ...(input.tableId && { tableId: input.tableId }),
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
  };

  const collection = await getOrdersCollection();
  await collection.insertOne(order);

  logAuditEvent({
    action: 'order_created',
    target: order._id,
    userId: actor.userId,
    businessId,
    metadata: { orderNumber: order.orderNumber, branchId: input.branchId, total },
  });

  log.info(
    { orderId: order._id, orderNumber: order.orderNumber, businessId, branchId: input.branchId },
    'Order created',
  );

  return order;
}

export async function updateOrderStatus(
  actor: TokenPayload,
  orderId: string,
  status: OrderStatus,
): Promise<Order> {
  const businessId = resolveBusinessId(actor);
  const collection = await getOrdersCollection();

  const existing = await collection.findOne({ _id: orderId, businessId });
  if (!existing) {
    // 404 rather than 403 to avoid leaking existence across tenants.
    throw new NotFoundError('Order');
  }

  assertBranchAccess(actor, existing.branchId);

  const now = new Date();
  await collection.updateOne({ _id: orderId, businessId }, { $set: { status, updatedAt: now } });
  const updated: Order = { ...existing, status, updatedAt: now };

  logAuditEvent({
    action: 'order_status_changed',
    target: orderId,
    userId: actor.userId,
    businessId,
    metadata: {
      orderNumber: updated.orderNumber,
      branchId: updated.branchId,
      from: existing.status,
      to: status,
    },
  });

  // Fan-out to every client subscribed to this branch. Fire-and-forget at the
  // service boundary would hide publish failures; await instead so the caller
  // observes a 500 if DDB/API GW is broken (the DB write still stands, which is
  // the correct semantic — the client can retry the PATCH to re-emit).
  try {
    await publishToChannel(channelFor.branch(updated.businessId, updated.branchId), {
      type: 'order.status-changed',
      payload: {
        orderId: updated._id,
        orderNumber: updated.orderNumber,
        status: updated.status,
      },
    });
  } catch (err) {
    log.warn(
      { err, orderId, businessId: updated.businessId, branchId: updated.branchId },
      'Order status persisted but WS publish failed',
    );
  }

  return updated;
}
