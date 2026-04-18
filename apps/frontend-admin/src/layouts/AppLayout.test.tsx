import { KaiPOSThemeProvider } from '@kaipos/ui';
import type { User } from '@kaipos/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../components/guards/index.js';
import { AuthProvider } from '../context/AuthContext.js';
import { clearSession, getSession, setSession } from '../lib/auth-storage.js';
import { AppLayout } from './AppLayout.js';

type SafeUser = Omit<User, 'passwordHash'>;

function makeUser(role: User['role']): SafeUser {
  return {
    _id: `u-${role}`,
    businessId: 'b1',
    email: `${role}@x.com`,
    name: role === 'admin' ? 'Admin User' : 'Cashier User',
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  };
}

function mockFetch(user: SafeUser) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          success: true,
          data: { user, business: { _id: 'b1', name: 'La Cocina', slug: 'la-cocina' } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === '/api/auth/logout') {
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

function renderShell(initialEntries: string[] = ['/dashboard']) {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<div>dashboard content</div>} />
                <Route path="/users" element={<div>users content</div>} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </KaiPOSThemeProvider>,
  );
}

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
  vi.stubEnv('VITE_WS_ENDPOINT', '');
});

afterEach(() => {
  clearSession();
  vi.unstubAllEnvs();
});

describe('AppLayout', () => {
  it('shows Dashboard, Usuarios and Debug · WebSocket nav items for admin', async () => {
    const admin = makeUser('admin');
    mockFetch(admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderShell();

    await waitFor(() => {
      expect(screen.getByText('dashboard content')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /usuarios/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /debug · websocket/i })).toBeInTheDocument();
  });

  it('hides Usuarios nav for cashier', async () => {
    const cashier = makeUser('cashier');
    mockFetch(cashier);
    setSession({ accessToken: 'a', refreshToken: 'r', user: cashier });

    renderShell();

    await waitFor(() => {
      expect(screen.getByText('dashboard content')).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /usuarios/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /debug · websocket/i })).toBeInTheDocument();
  });

  it('logout clears session and navigates to /login', async () => {
    const admin = makeUser('admin');
    mockFetch(admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    const user = userEvent.setup();
    renderShell();

    await waitFor(() => {
      expect(screen.getByText('dashboard content')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /abrir menú de usuario/i }));
    await user.click(await screen.findByRole('menuitem', { name: /cerrar sesión/i }));

    await waitFor(() => {
      expect(getSession()).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText('login page')).toBeInTheDocument();
    });
  });
});
