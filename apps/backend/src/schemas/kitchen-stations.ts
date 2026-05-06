import { z } from 'zod';
import { paginationQuerySchema } from '@kaipos/shared/schemas/pagination';

export const listKitchenStationsQuerySchema = z
  .object({
    branchId: z.string().min(1),
  })
  .merge(paginationQuerySchema);

export const createKitchenStationSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(100),
});

export type ListKitchenStationsQuery = z.infer<typeof listKitchenStationsQuerySchema>;
export type CreateKitchenStationInput = z.infer<typeof createKitchenStationSchema>;
