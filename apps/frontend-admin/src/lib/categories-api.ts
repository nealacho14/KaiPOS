import type { Category } from '@kaipos/shared';
import { ApiError, apiJson, apiJsonPaginated, type PaginatedResult } from '@kaipos/app-runtime';

export interface CreateCategoryPayload {
  name: string;
  description?: string;
  sortOrder?: number;
  businessId?: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  description?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export type CategoriesApiErrorCode =
  | 'DUPLICATE_CATEGORY_NAME'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'UNKNOWN_ERROR';

export interface CategoriesApiError {
  code: CategoriesApiErrorCode;
  message: string;
  status: number;
  field?: string;
  details?: ApiError['details'];
}

export function toCategoriesApiError(err: unknown): CategoriesApiError {
  if (err instanceof ApiError) {
    const field =
      err.details && err.details.length > 0 && typeof err.details[0]?.field === 'string'
        ? err.details[0]?.field
        : undefined;
    return {
      code: (err.code as CategoriesApiErrorCode) ?? 'UNKNOWN_ERROR',
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

export interface ListCategoriesParams {
  includeInactive?: boolean;
  page?: number;
  limit?: number;
}

export function listCategories(
  params: ListCategoriesParams = {},
): Promise<PaginatedResult<Category>> {
  const qs = new URLSearchParams();
  if (params.includeInactive) qs.set('includeInactive', 'true');
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  const s = qs.toString();
  return apiJsonPaginated<Category>(`/api/categories${s ? `?${s}` : ''}`);
}

export function createCategory(payload: CreateCategoryPayload): Promise<Category> {
  return apiJson<Category>('/api/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateCategory(id: string, payload: UpdateCategoryPayload): Promise<Category> {
  return apiJson<Category>(`/api/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deactivateCategory(id: string): Promise<Category> {
  return apiJson<Category>(`/api/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
