import { z } from 'zod';

const coercePositiveInt = (min: number, max: number, fallback: number) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === '') return fallback;
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      if (Number.isNaN(n) || n < min) return fallback;
      return Math.min(n, max);
    });

// `limit` capped at 500 to let the POS catalog grid load 500+ products on one
// page (Paso 2 SLA: < 1 s for 500 products). Page size remains conservative
// by default; callers must opt into larger pages explicitly.
export const paginationQuerySchema = z.object({
  page: coercePositiveInt(1, 10_000, 1),
  limit: coercePositiveInt(1, 500, 50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
