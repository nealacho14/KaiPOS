import type { User } from '@kaipos/shared';

export type SessionUser = Omit<User, 'passwordHash'>;

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user?: SessionUser;
}

const ACCESS_KEY = 'kaipos:accessToken';
const REFRESH_KEY = 'kaipos:refreshToken';
const USER_KEY = 'kaipos:user';

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

export function clearSession(): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.removeItem(ACCESS_KEY);
  storage.removeItem(REFRESH_KEY);
  storage.removeItem(USER_KEY);
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

// Legacy compatibility shims — the WS debug page still calls these.
// They operate on the access token slot of the new session contract.

export function getToken(): string | null {
  return getSession()?.accessToken ?? null;
}

export function setToken(token: string): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(ACCESS_KEY, token);
  notify(getSession());
}

export function clearToken(): void {
  clearSession();
}
