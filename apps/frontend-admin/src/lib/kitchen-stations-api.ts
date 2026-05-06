import type { KitchenStation } from '@kaipos/shared';
import { apiJsonPaginated, type PaginatedResult } from './api.js';

export interface ListKitchenStationsParams {
  branchId: string;
  page?: number;
  limit?: number;
}

export function listKitchenStations(
  params: ListKitchenStationsParams,
): Promise<PaginatedResult<KitchenStation>> {
  const qs = new URLSearchParams();
  qs.set('branchId', params.branchId);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  return apiJsonPaginated<KitchenStation>(`/api/kitchen-stations?${qs.toString()}`);
}
