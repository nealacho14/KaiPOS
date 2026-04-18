import type { User } from '@kaipos/shared';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../context/AuthContext.js';
import { clearSession, setSession } from '../../lib/auth-storage.js';
import { RequirePermission } from './RequirePermission.js';

type SafeUser = Omit<User, 'passwordHash'>;

function makeUser(overrides: Partial<User> = {}): SafeUser {
  return {
    _id: 'u1',
    businessId: 'b1',
    email: 'u@x.com',
    name: 'Tester',
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    ...overrides,
  };
}

function mockMe(user: SafeUser) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: { user, business: { _id: 'b1', name: 'Biz', slug: 'biz' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/users" element={<RequirePermission permission="users:read" />}>
            <Route index element={<div>users list</div>} />
          </Route>
          <Route path="/dashboard" element={<div>dashboard</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

afterEach(() => {
  clearSession();
});

describe('RequirePermission', () => {
  it('renders outlet for admin with users:read', async () => {
    const user = makeUser({ role: 'admin' });
    mockMe(user);
    setSession({ accessToken: 'a', refreshToken: 'r', user });

    renderAt('/users');
    await waitFor(() => {
      expect(screen.getByText('users list')).toBeInTheDocument();
    });
  });

  it('redirects cashier without users:read to /dashboard', async () => {
    const user = makeUser({ role: 'cashier' });
    mockMe(user);
    setSession({ accessToken: 'a', refreshToken: 'r', user });

    renderAt('/users');
    await waitFor(() => {
      expect(screen.getByText('dashboard')).toBeInTheDocument();
    });
    expect(screen.queryByText('users list')).not.toBeInTheDocument();
  });
});
