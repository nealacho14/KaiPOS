import type { ApiErrorDetail, PaginatedResponse, RefreshResponse } from '@kaipos/shared';
import { clearSession, getSelectedBusinessId, getSession, setSession } from './auth-storage.js';

type AuthFailureHandler = () => void;

// Default behavior: when the refresh path gives up, hard-redirect to /login.
// `AuthProvider` replaces this at startup via `setAuthFailureHandler` so the
// handler can use the router instead of `window.location.assign`, which keeps
// this module decoupled from react-router and trivially testable.
let onAuthFailure: AuthFailureHandler = () => {
  if (typeof window !== 'undefined') {
    window.location.assign('/login');
  }
};

export function setAuthFailureHandler(handler: AuthFailureHandler): void {
  onAuthFailure = handler;
}

export function resetAuthFailureHandlerForTests(): void {
  onAuthFailure = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/login');
    }
  };
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: ApiErrorDetail[];

  constructor(message: string, status: number, code: string, details?: ApiErrorDetail[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface ApiInit extends RequestInit {
  skipAuth?: boolean;
}

const RETRIED = Symbol('api:retried');
const THROTTLE_RETRIES = Symbol('api:throttleRetries');
type RetryFlagged = ApiInit & { [RETRIED]?: true; [THROTTLE_RETRIES]?: number };

let inflightRefresh: Promise<RefreshResponse> | null = null;

// API Gateway returns this exact body when it can't reach the integration —
// either Lambda concurrency throttling or the integration target is briefly
// unhealthy. Both are transient on our side; retry once with a small backoff
// before surfacing the failure to the caller.
const APIGW_503_BODY = '{"message":"Service Unavailable"}';
const MAX_THROTTLE_RETRIES = 2;

async function isApiGatewayThrottle(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  try {
    const text = await res.clone().text();
    return text.trim() === APIGW_503_BODY;
  } catch {
    return false;
  }
}

function backoffMs(attempt: number): number {
  // 350ms, 800ms with ±20% jitter. Keeps total max wait ~1.4s across attempts.
  const base = attempt === 0 ? 350 : 800;
  const jitter = (Math.random() - 0.5) * 0.4 * base;
  return Math.round(base + jitter);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function performRefresh(refreshToken: string): Promise<RefreshResponse> {
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const body = (await res.json().catch(() => null)) as
    | { success: true; data: RefreshResponse }
    | { success: false; error: string; code: string }
    | null;

  if (!res.ok || !body || body.success !== true) {
    const code = body && body.success === false ? body.code : 'REFRESH_FAILED';
    const message = body && body.success === false ? body.error : 'Refresh failed';
    throw new ApiError(message, res.status, code);
  }

  return body.data;
}

function refreshOnce(refreshToken: string): Promise<RefreshResponse> {
  if (!inflightRefresh) {
    inflightRefresh = performRefresh(refreshToken).finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

function buildHeaders(init: ApiInit | undefined, accessToken?: string): Headers {
  const headers = new Headers(init?.headers);
  if (accessToken && !init?.skipAuth) {
    headers.set('authorization', `Bearer ${accessToken}`);
    // Super_admin in-app business picker. The backend's `requireAuth` reads
    // `x-business-id` and narrows the in-request user.businessId to the
    // selected one. Regular users have no selectedBusinessId and the header
    // is absent, so this is a no-op for them.
    const selectedBusinessId = getSelectedBusinessId();
    if (selectedBusinessId) {
      headers.set('x-business-id', selectedBusinessId);
    }
  }
  return headers;
}

function redirectToLogin(): void {
  onAuthFailure();
}

export async function api(input: RequestInfo | URL, init?: ApiInit): Promise<Response> {
  const flagged = init as RetryFlagged | undefined;
  const session = getSession();

  const headers = buildHeaders(init, session?.accessToken);
  const res = await fetch(input, { ...init, headers });

  // Transparent retry on API Gateway throttle 503s. Capped at MAX_THROTTLE_RETRIES
  // so a genuinely down service surfaces quickly instead of hanging the UI.
  if (await isApiGatewayThrottle(res)) {
    const attempts = flagged?.[THROTTLE_RETRIES] ?? 0;
    if (attempts < MAX_THROTTLE_RETRIES) {
      await delay(backoffMs(attempts));
      const nextInit: RetryFlagged = { ...init };
      nextInit[THROTTLE_RETRIES] = attempts + 1;
      return api(input, nextInit);
    }
  }

  if (res.status !== 401 || init?.skipAuth || flagged?.[RETRIED]) {
    return res;
  }

  // Peek at the body to determine whether this is a TOKEN_EXPIRED case.
  // We must clone first so callers still get a usable body if we don't refresh.
  let code: string | undefined;
  try {
    const peek = (await res.clone().json()) as { code?: string } | null;
    code = peek?.code;
  } catch {
    code = undefined;
  }

  if (code !== 'TOKEN_EXPIRED') {
    return res;
  }

  const currentSession = getSession();
  if (!currentSession?.refreshToken) {
    clearSession();
    redirectToLogin();
    return res;
  }

  let refreshed: RefreshResponse;
  try {
    refreshed = await refreshOnce(currentSession.refreshToken);
  } catch (err) {
    // Only purge the session when the server *explicitly* rejected the refresh
    // token (401 / 403). Transient failures (5xx throttle, network error) must
    // NOT clear the session — that just creates a re-login loop that further
    // saturates the API. Surface the original 401 instead so the caller
    // handles it; on the next request the user can retry.
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      clearSession();
      redirectToLogin();
    }
    return res;
  }

  setSession({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    user: currentSession.user,
  });

  const retryInit: RetryFlagged = { ...init };
  retryInit[RETRIED] = true;
  const retryHeaders = buildHeaders(retryInit, refreshed.accessToken);
  return fetch(input, { ...retryInit, headers: retryHeaders });
}

export async function apiJson<T>(input: RequestInfo | URL, init?: ApiInit): Promise<T> {
  const res = await api(input, init);

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (
    !res.ok ||
    !body ||
    typeof body !== 'object' ||
    (body as { success?: boolean }).success !== true
  ) {
    const errorBody = body as {
      success: false;
      error?: string;
      code?: string;
      details?: ApiErrorDetail[];
    } | null;
    throw new ApiError(
      errorBody?.error ?? `Request failed with status ${res.status}`,
      res.status,
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.details,
    );
  }

  return (body as { success: true; data: T }).data;
}

export type Pagination = PaginatedResponse<unknown>['pagination'];

export interface PaginatedResult<T> {
  data: T[];
  pagination: Pagination;
}

// Identical to apiJson but also surfaces the `pagination` envelope sibling.
// Use for list endpoints that returned `{ success, data, pagination }`.
export async function apiJsonPaginated<T>(
  input: RequestInfo | URL,
  init?: ApiInit,
): Promise<PaginatedResult<T>> {
  const res = await api(input, init);

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (
    !res.ok ||
    !body ||
    typeof body !== 'object' ||
    (body as { success?: boolean }).success !== true
  ) {
    const errorBody = body as {
      success: false;
      error?: string;
      code?: string;
      details?: ApiErrorDetail[];
    } | null;
    throw new ApiError(
      errorBody?.error ?? `Request failed with status ${res.status}`,
      res.status,
      errorBody?.code ?? 'UNKNOWN_ERROR',
      errorBody?.details,
    );
  }

  const ok = body as { success: true; data: T[]; pagination?: Pagination };
  if (ok.pagination) {
    return { data: ok.data, pagination: ok.pagination };
  }
  // Should never happen — every list endpoint goes through `toPaginatedResponse`
  // on the server. Surface it loudly so a regression doesn't silently truncate
  // results, and synthesise a single-page envelope so the UI keeps working.
  // eslint-disable-next-line no-console
  console.warn('[api] paginated endpoint returned no pagination envelope', {
    input,
    dataLength: ok.data.length,
  });
  return {
    data: ok.data,
    pagination: { page: 1, limit: ok.data.length, total: ok.data.length, totalPages: 1 },
  };
}
