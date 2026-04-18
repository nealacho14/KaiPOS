import type { LoginResponse, MeResponse } from '@kaipos/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { apiJson } from '../lib/api.js';
import { clearSession, getSession, setSession, type SessionUser } from '../lib/auth-storage.js';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

export type AuthBusiness = { _id: string; name: string; slug: string } | null;

export interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  business: AuthBusiness;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Set initial status synchronously: 'loading' if there's a session to hydrate,
  // 'unauthenticated' otherwise. Avoids the cascade-render of toggling in an effect.
  const [status, setStatus] = useState<AuthStatus>(() =>
    getSession() ? 'loading' : 'unauthenticated',
  );
  const [user, setUser] = useState<SessionUser | null>(() => getSession()?.user ?? null);
  const [business, setBusiness] = useState<AuthBusiness>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const session = getSession();
    if (!session) return;

    apiJson<MeResponse>('/api/auth/me')
      .then((data) => {
        setSession({
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          user: data.user,
        });
        setUser(data.user);
        setBusiness(data.business);
        setStatus('authenticated');
      })
      .catch(() => {
        clearSession();
        setUser(null);
        setBusiness(null);
        setStatus('unauthenticated');
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiJson<LoginResponse>('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      skipAuth: true,
    });

    setSession({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });
    setUser(data.user);

    try {
      const me = await apiJson<MeResponse>('/api/auth/me');
      setBusiness(me.business);
    } catch {
      setBusiness(null);
    }

    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    const session = getSession();
    if (session?.refreshToken) {
      try {
        await apiJson('/api/auth/logout', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
      } catch {
        // Best-effort: even if the API call fails, we drop local state below.
      }
    }
    clearSession();
    setUser(null);
    setBusiness(null);
    setStatus('unauthenticated');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, business, login, logout }),
    [status, user, business, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an <AuthProvider>');
  }
  return ctx;
}
