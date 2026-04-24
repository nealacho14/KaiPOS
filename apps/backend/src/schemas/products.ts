import { z } from 'zod';

const allergenEnum = z.enum([
  'gluten',
  'dairy',
  'egg',
  'peanut',
  'tree-nut',
  'soy',
  'fish',
  'shellfish',
  'sesame',
]);

const dietaryTagEnum = z.enum(['vegetarian', 'vegan', 'gluten-free', 'keto', 'halal', 'kosher']);

const stockUnitEnum = z.enum(['unit', 'kg', 'L']);

const serviceScheduleEnum = z.enum(['breakfast', 'lunch', 'dinner']);

const availabilitySchema = z.object({
  pos: z.boolean(),
  online: z.boolean(),
  kiosk: z.boolean(),
});

const modifierOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  priceDelta: z.number(),
});

const modifierGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  required: z.boolean(),
  options: z.array(modifierOptionSchema),
});

const uploadContentTypeEnum = z.enum(['image/jpeg', 'image/png', 'image/webp']);

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

export const createProductSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  price: z.number().min(0),
  category: z.string().min(1),
  sku: z.string().min(1),
  stock: z.number().min(0),
  imageUrl: z.string().url().optional(),
  cost: z.number().min(0).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  trackStock: z.boolean().default(true),
  lowStockThreshold: z.number().int().min(0).optional(),
  stockUnit: stockUnitEnum.default('unit'),
  availability: availabilitySchema.default({ pos: true, online: false, kiosk: false }),
  serviceSchedules: z.array(serviceScheduleEnum).default([]),
  allergens: z.array(allergenEnum).default([]),
  dietaryTags: z.array(dietaryTagEnum).default([]),
  modifierGroups: z.array(modifierGroupSchema).default([]),
  kitchenStationIds: z.array(z.string().min(1)).default([]),
});

export const updateProductSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    price: z.number().min(0).optional(),
    category: z.string().min(1).optional(),
    sku: z.string().min(1).optional(),
    stock: z.number().min(0).optional(),
    imageUrl: z.string().url().optional(),
    cost: z.number().min(0).optional(),
    taxRate: z.number().min(0).max(100).optional(),
    trackStock: z.boolean().optional(),
    lowStockThreshold: z.number().int().min(0).optional(),
    stockUnit: stockUnitEnum.optional(),
    availability: availabilitySchema.optional(),
    serviceSchedules: z.array(serviceScheduleEnum).optional(),
    allergens: z.array(allergenEnum).optional(),
    dietaryTags: z.array(dietaryTagEnum).optional(),
    modifierGroups: z.array(modifierGroupSchema).optional(),
    kitchenStationIds: z.array(z.string().min(1)).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const listProductsQuerySchema = z.object({
  branchId: z.string().min(1),
  q: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  includeInactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v === 'true' || v === '1';
      return false;
    }),
  businessId: z.string().min(1).optional(),
});

export const uploadUrlSchema = z.object({
  branchId: z.string().min(1),
  contentType: uploadContentTypeEnum,
  fileSize: z.number().int().positive().max(MAX_UPLOAD_SIZE),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
