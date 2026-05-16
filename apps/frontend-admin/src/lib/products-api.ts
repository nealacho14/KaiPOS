import type { Product, ProductPreference } from '@kaipos/shared';
import { api, ApiError, apiJson, apiJsonPaginated, type PaginatedResult } from './api.js';

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

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

// `createdBy` is stamped on the server from the authenticated actor, never
// supplied from the client, so it is excluded here alongside the other
// server-managed fields.
export type CreateProductPayload = Omit<
  Product,
  '_id' | 'businessId' | 'isActive' | 'createdAt' | 'updatedAt' | 'createdBy'
>;

export type UpdateProductPayload = Partial<Omit<CreateProductPayload, 'branchId'>> & {
  isActive?: boolean;
};

export interface UploadUrlPayload {
  branchId: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
}

export interface UploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
  expiresIn: number;
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

export type ProductsApiErrorCode =
  | 'SKU_ALREADY_EXISTS'
  | 'VALIDATION_ERROR'
  | 'ASSETS_NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VARIANT_SKU_DUPLICATE'
  | 'MAX_SELECTABLE_EXCEEDS_OPTIONS'
  | 'REORDER_PRODUCT_NOT_FOUND'
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

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

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

export function createProduct(input: CreateProductPayload): Promise<Product> {
  return apiJson<Product>('/api/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateProduct(id: string, input: UpdateProductPayload): Promise<Product> {
  return apiJson<Product>(`/api/products/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  // DELETE returns 204 with no body, so `apiJson` can't be used directly — it
  // expects a `{ success: true, data }` envelope. Use the raw `api()` helper
  // and map any non-2xx response into an ApiError for consistent handling.
  const res = await api(`/api/products/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    let body: { error?: string; code?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string; code?: string };
    } catch {
      body = null;
    }
    throw new ApiError(
      body?.error ?? `Request failed with status ${res.status}`,
      res.status,
      body?.code ?? 'UNKNOWN_ERROR',
    );
  }
}

export function generateUploadUrl(input: UploadUrlPayload): Promise<UploadUrlResult> {
  return apiJson<UploadUrlResult>('/api/products/upload-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export interface ReorderProductsItem {
  id: string;
  sortOrder: number;
}

export interface ReorderProductsResult {
  matched: number;
}

export function reorderProducts(
  branchId: string,
  items: ReorderProductsItem[],
): Promise<ReorderProductsResult> {
  return apiJson<ReorderProductsResult>('/api/products/reorder', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branchId, items }),
  });
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
