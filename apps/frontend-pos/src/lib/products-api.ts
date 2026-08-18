import type { Product, ProductPreference } from '@kaipos/shared';
import { ApiError, apiJson, apiJsonPaginated, type PaginatedResult } from '@kaipos/app-runtime';

export interface ListProductsParams {
  branchId: string;
  q?: string;
  category?: string;
  includeInactive?: boolean;
  businessId?: string;
  page?: number;
  limit?: number;
  activeNow?: boolean;
  featuredIn?: string;
}

export type ProductsApiErrorCode =
  | 'SKU_ALREADY_EXISTS'
  | 'BARCODE_ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VARIANT_SKU_DUPLICATE'
  | 'MAX_SELECTABLE_EXCEEDS_OPTIONS'
  | 'UNKNOWN_ERROR';

export interface ProductsApiError {
  code: ProductsApiErrorCode;
  message: string;
  status: number;
  field?: string;
  details?: ApiError['details'];
}

// The backend wraps 409-on-duplicate-SKU with a `{ field: 'sku' }` in the
// response. `ApiError` exposes the raw shape via `code` + `details` — this
// helper normalizes it so callers can switch on `code` without re-parsing.
export function toProductsApiError(err: unknown): ProductsApiError {
  if (err instanceof ApiError) {
    const field =
      err.details && err.details.length > 0 && typeof err.details[0]?.field === 'string'
        ? err.details[0]?.field
        : undefined;
    return {
      code: (err.code as ProductsApiErrorCode) ?? 'UNKNOWN_ERROR',
      message: err.message,
      status: err.status,
      field,
      details: err.details,
    };
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: err instanceof Error ? err.message : 'Unknown error',
    status: 0,
  };
}

function buildListQuery(params: ListProductsParams): string {
  const qs = new URLSearchParams();
  qs.set('branchId', params.branchId);
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.includeInactive) qs.set('includeInactive', 'true');
  if (params.businessId) qs.set('businessId', params.businessId);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  if (params.activeNow) qs.set('activeNow', 'true');
  if (params.featuredIn) qs.set('featuredIn', params.featuredIn);
  return qs.toString();
}

export function listProducts(params: ListProductsParams): Promise<PaginatedResult<Product>> {
  return apiJsonPaginated<Product>(`/api/products?${buildListQuery(params)}`);
}

export function getProduct(id: string): Promise<Product> {
  return apiJson<Product>(`/api/products/${id}`);
}

export function setProductFeatured(
  id: string,
  input: { branchId: string; featured: boolean },
): Promise<ProductPreference> {
  return apiJson<ProductPreference>(`/api/products/${id}/feature`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}
