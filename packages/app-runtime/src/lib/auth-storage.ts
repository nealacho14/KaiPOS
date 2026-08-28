import type { User } from '@kaipos/shared';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../hooks/useActiveBranch.js';
import { clearCatalogCache } from './catalog-cache.js';

export type SessionUser = Omit<User, 'passwordHash'>;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user?: SessionUser;
}

const ACCESS_KEY = 'kaipos:accessToken';
const REFRESH_KEY = 'kaipos:refreshToken';
const USER_KEY = 'kaipos:user';
const SELECTED_BUSINESS_KEY = 'kaipos:selectedBusinessId';

type Listener = (session: StoredSession | null) => void;
const listeners = new Set<Listener>();

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function readUser(storage: Storage): SessionUser | undefined {
  const raw = storage.getItem(USER_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return undefined;
  }
}

export function getSession(): StoredSession | null {
  const storage = safeStorage();
  if (!storage) return null;

  const accessToken = storage.getItem(ACCESS_KEY);
  const refreshToken = storage.getItem(REFRESH_KEY);

  if (!accessToken || !refreshToken) {
    if (accessToken && !refreshToken) {
      storage.removeItem(ACCESS_KEY);
      storage.removeItem(USER_KEY);
    }
    return null;
  }

  const user = readUser(storage);
  return { accessToken, refreshToken, user };
}

export function setSession(next: StoredSession): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(ACCESS_KEY, next.accessToken);
  storage.setItem(REFRESH_KEY, next.refreshToken);
  if (next.user) {
    storage.setItem(USER_KEY, JSON.stringify(next.user));
  } else {
    storage.removeItem(USER_KEY);
  }
  notify(next);
}

// Selected business (super_admin only). Persisted across reloads so the
// picker remembers the last chosen business. Cleared on logout alongside
// the rest of the session.
export function getSelectedBusinessId(): string | null {
  const storage = safeStorage();
  return storage ? storage.getItem(SELECTED_BUSINESS_KEY) : null;
}

export function setSelectedBusinessId(id: string | null): void {
  const storage = safeStorage();
  if (!storage) return;
  // Switching business changes which tenant's catalog is correct, and the
  // cached responses are keyed only by URL.
  clearCatalogCache();
  if (id) {
    storage.setItem(SELECTED_BUSINESS_KEY, id);
  } else {
    storage.removeItem(SELECTED_BUSINESS_KEY);
  }
}

export function clearSession(): void {
  // Before the early return below: the catalog cache must be dropped on logout
  // even when localStorage is unavailable.
  clearCatalogCache();
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_KEY);
  storage.removeItem(REFRESH_KEY);
  storage.removeItem(USER_KEY);
  storage.removeItem(SELECTED_BUSINESS_KEY);
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
    }
  } catch {
    // sessionStorage may be unavailable (private mode, etc.)
  }
  notify(null);
}

export function onSessionChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function notify(session: StoredSession | null): void {
  for (const cb of listeners) {
    try {
      cb(session);
    } catch {
      // listener errors are swallowed so one bad subscriber can't break the rest
    }
  }
}
