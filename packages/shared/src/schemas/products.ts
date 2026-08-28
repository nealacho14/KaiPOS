import { z } from 'zod';
import { paginationQuerySchema } from './pagination.js';

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

const timeOfDayRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayOfWeekSchema = z.number().int().min(0).max(6);

const modifierOptionAvailabilitySchema = z
  .object({
    daysOfWeek: z.array(dayOfWeekSchema).min(1).optional(),
    from: z.string().regex(timeOfDayRegex).optional(),
    to: z.string().regex(timeOfDayRegex).optional(),
  })
  .strict()
  .refine((v) => (v.from === undefined) === (v.to === undefined), {
    message: 'from and to must be provided together',
  });

const modifierOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  priceDelta: z.number(),
  available: modifierOptionAvailabilitySchema.optional(),
});

const modifierGroupSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    required: z.boolean(),
    maxSelectable: z.number().int().min(1),
    options: z.array(modifierOptionSchema),
  })
  .refine((g) => g.maxSelectable <= g.options.length, {
    message: 'maxSelectable cannot exceed options.length',
    path: ['maxSelectable'],
  });

export const productVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
  priceDelta: z.number(),
  imageUrl: z.string().url().optional(),
});

export const availabilityWindowSchema = z.object({
  daysOfWeek: z.array(dayOfWeekSchema).min(1),
  from: z.string().regex(timeOfDayRegex),
  to: z.string().regex(timeOfDayRegex),
});

const uploadContentTypeEnum = z.enum(['image/jpeg', 'image/png', 'image/webp']);

const MAX_UPLOAD_SIZE = 2 * 1024 * 1024;

const variantsUniqueSkuRefinement = <T extends { variants?: { sku: string }[] }>(
  data: T,
  ctx: z.RefinementCtx,
): void => {
  if (!data.variants || data.variants.length === 0) return;
  const seen = new Set<string>();
  for (let i = 0; i < data.variants.length; i++) {
    const sku = data.variants[i]!.sku;
    if (seen.has(sku)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Variant SKUs must be unique',
        path: ['variants', i, 'sku'],
      });
    }
    seen.add(sku);
  }
};

export const createProductSchema = z
  .object({
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
    variants: z.array(productVariantSchema).optional(),
    availabilityWindow: availabilityWindowSchema.optional(),
    sortOrder: z.number().int().min(0).default(0),
    barcode: z.string().min(1).optional(),
  })
  .superRefine(variantsUniqueSkuRefinement);

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
    variants: z.array(productVariantSchema).optional(),
    availabilityWindow: availabilityWindowSchema.optional(),
    sortOrder: z.number().int().min(0).optional(),
    barcode: z.string().min(1).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  })
  .superRefine(variantsUniqueSkuRefinement);

const coerceBool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v === 'true' || v === '1';
    return false;
  });

export const listProductsQuerySchema = z
  .object({
    branchId: z.string().min(1),
    q: z.string().min(1).optional(),
    category: z.string().min(1).optional(),
    includeInactive: coerceBool,
    activeNow: coerceBool,
    featuredIn: z.string().min(1).optional(),
    businessId: z.string().min(1).optional(),
  })
  .merge(paginationQuerySchema);

export const uploadUrlSchema = z.object({
  branchId: z.string().min(1),
  contentType: uploadContentTypeEnum,
  fileSize: z.number().int().positive().max(MAX_UPLOAD_SIZE),
});

export const productIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const reorderProductsSchema = z.object({
  branchId: z.string().min(1),
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sortOrder: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(500),
});

export const featureProductSchema = z.object({
  branchId: z.string().min(1),
  featured: z.boolean(),
});

export const listProductPreferencesQuerySchema = z.object({
  branchId: z.string().min(1),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type ReorderProductsInput = z.infer<typeof reorderProductsSchema>;
export type FeatureProductInput = z.infer<typeof featureProductSchema>;
export type ListProductPreferencesQuery = z.infer<typeof listProductPreferencesQuerySchema>;
export type ProductVariantInput = z.infer<typeof productVariantSchema>;
export type AvailabilityWindowInput = z.infer<typeof availabilityWindowSchema>;
