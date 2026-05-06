import type { User, UserRole } from '@kaipos/shared';
import { ApiError, apiJson } from './api.js';

export type SafeUser = Omit<User, 'passwordHash'>;

export interface CreateUserPayload {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  branchIds?: string[];
  businessId?: string;
}

export interface UpdateUserPayload {
  name?: string;
  role?: UserRole;
  branchIds?: string[];
  isActive?: boolean;
}

export type UsersApiErrorCode =
  | 'DUPLICATE_EMAIL'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'MISSING_TARGET_BUSINESS_ID'
  | 'INVALID_TARGET_BUSINESS_ID'
  | 'UNKNOWN_ERROR';

export interface UsersApiError {
  code: UsersApiErrorCode;
  message: string;
  status: number;
  field?: string;
  details?: ApiError['details'];
}

// Mirrors `toProductsApiError`: surfaces the first `{ field }` detail so the
// form can map `DUPLICATE_EMAIL` (and future field-targeted 409s) directly.
export function toUsersApiError(err: unknown): UsersApiError {
  if (err instanceof ApiError) {
    const field =
      err.details && err.details.length > 0 && typeof err.details[0]?.field === 'string'
        ? err.details[0]?.field
        : undefined;
    return {
      code: (err.code as UsersApiErrorCode) ?? 'UNKNOWN_ERROR',
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

export function getUser(id: string): Promise<SafeUser> {
  return apiJson<SafeUser>(`/api/users/${encodeURIComponent(id)}`);
}

export function createUser(payload: CreateUserPayload): Promise<SafeUser> {
  return apiJson<SafeUser>('/api/users', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateUser(id: string, payload: UpdateUserPayload): Promise<SafeUser> {
  return apiJson<SafeUser>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deactivateUser(id: string): Promise<SafeUser> {
  return apiJson<SafeUser>(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
