import { z } from 'zod';

export const listProductsQuerySchema = z.object({
  q: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
  businessId: z.string().min(1).optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  price: z.number().nonnegative(),
  category: z.string().min(1),
  sku: z.string().min(1),
  stock: z.number().int().nonnegative(),
  imageUrl: z.string().url().optional(),
  businessId: z.string().min(1).optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().nonnegative().optional(),
    category: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    stock: z.number().int().nonnegative().optional(),
    imageUrl: z.string().url().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
