const TOKEN_KEY = 'kaipos:accessToken';

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return safeStorage()?.getItem(TOKEN_KEY) ?? null;
}

export function setToken(token: string): void {
  safeStorage()?.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  safeStorage()?.removeItem(TOKEN_KEY);
}
