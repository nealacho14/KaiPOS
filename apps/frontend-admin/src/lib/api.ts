import type { ApiErrorDetail, RefreshResponse } from '@kaipos/shared';
import { clearSession, getSession, setSession } from './auth-storage.js';

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
type RetryFlagged = ApiInit & { [RETRIED]?: true };

let inflightRefresh: Promise<RefreshResponse> | null = null;

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
  } catch {
    clearSession();
    redirectToLogin();
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
