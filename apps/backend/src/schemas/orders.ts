import { z } from 'zod';

const appliedModifierSchema = z.object({
  modifierId: z.string().min(1),
  name: z.string().min(1),
  optionName: z.string().min(1),
  price: z.number().min(0),
});

const orderItemInputSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
  modifiers: z.array(appliedModifierSchema).optional(),
});

export const createOrderSchema = z.object({
  branchId: z.string().min(1),
  items: z.array(orderItemInputSchema).min(1),
  paymentMethod: z.enum(['cash', 'card', 'transfer', 'other']),
  taxRate: z.number().min(0).max(1).optional(),
  tableId: z.string().min(1).optional(),
  customerId: z.string().min(1).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'completed', 'cancelled', 'refunded']),
});

export const orderParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
