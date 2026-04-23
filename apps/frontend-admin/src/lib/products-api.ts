import type { Product } from '@kaipos/shared';
import { api, ApiError, apiJson } from './api.js';

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

export interface ListProductsParams {
  branchId: string;
  q?: string;
  category?: string;
  includeInactive?: boolean;
  businessId?: string;
}

export type CreateProductPayload = Omit<
  Product,
  '_id' | 'businessId' | 'isActive' | 'createdAt' | 'updatedAt'
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
  return qs.toString();
}

export function listProducts(params: ListProductsParams): Promise<Product[]> {
  return apiJson<Product[]>(`/api/products?${buildListQuery(params)}`);
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
