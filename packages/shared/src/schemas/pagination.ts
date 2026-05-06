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

export const paginationQuerySchema = z.object({
  page: coercePositiveInt(1, 10_000, 1),
  limit: coercePositiveInt(1, 100, 50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
