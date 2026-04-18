import type { User } from '@kaipos/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, getSession, setSession } from '../lib/auth-storage.js';
import { AuthProvider, useAuth } from './AuthContext.js';

type SafeUser = Omit<User, 'passwordHash'>;

function makeUser(role: User['role'] = 'admin'): SafeUser {
  return {
    _id: 'u1',
    businessId: 'b1',
    email: 'u@x.com',
    name: 'Tester',
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  };
}

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
    </div>
  );
}

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  clearSession();
});

describe('AuthProvider hydration', () => {
  it('clears the session when /me rejects with 401', async () => {
    const user = makeUser();
    setSession({ accessToken: 'a', refreshToken: 'r', user });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'bad', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(getSession()).toBeNull();
  });

  it('keeps the cached session on transient network errors (no forced logout)', async () => {
    const user = makeUser();
    setSession({ accessToken: 'a', refreshToken: 'r', user });
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('user').textContent).toBe(user.email);
    expect(getSession()).not.toBeNull();
  });

  it('keeps the session when /me returns a 5xx', async () => {
    const user = makeUser();
    setSession({ accessToken: 'a', refreshToken: 'r', user });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'boom', code: 'SERVER_ERROR' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      }),
    );

    renderWithProvider();

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(getSession()).not.toBeNull();
  });
});
