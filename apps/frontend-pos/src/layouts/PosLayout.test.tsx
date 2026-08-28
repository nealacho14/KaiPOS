import type { User } from '@kaipos/shared';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { resetViewport, setViewport, VIEWPORT } from '@kaipos/ui/testing';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  AuthProvider,
  clearSession,
  RequireAuth,
  RequirePermission,
  setSession,
} from '@kaipos/app-runtime';
import { NoBranchPage } from '../pages/NoBranchPage.js';
import { PosHomePage } from '../pages/PosHomePage.js';
import { SelectBusinessPage } from '../pages/SelectBusinessPage.js';
import { PosLayout } from './PosLayout.js';

type SafeUser = Omit<User, 'passwordHash'>;

function makeUser(role: User['role'], overrides: Partial<SafeUser> = {}): SafeUser {
  return {
    _id: `u-${role}`,
    businessId: 'b1',
    email: `${role}@x.com`,
    name: role === 'admin' ? 'Admin User' : 'Cashier User',
    role,
    isActive: true,
    branchIds: ['branch-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    ...overrides,
  };
}

function mockFetch(user: SafeUser, includeBusiness = true) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user,
            business: includeBusiness ? { _id: 'b1', name: 'La Cocina', slug: 'la-cocina' } : null,
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === '/api/branches' || url.startsWith('/api/branches?')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { branches: [{ _id: 'branch-1', name: 'Sucursal Centro' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url === '/api/businesses') {
      return new Response(
        JSON.stringify({
          success: true,
          data: includeBusiness ? [{ _id: 'b1', name: 'La Cocina', slug: 'la-cocina' }] : [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith('/api/categories')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { totalPages: 1, page: 1, limit: 100, totalCount: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.startsWith('/api/products')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
          pagination: { totalPages: 1, page: 1, limit: 100, totalCount: 0 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ success: true, data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

function renderShell(initialEntries: string[] = ['/']) {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<PosLayout />}>
                <Route element={<RequirePermission permission="products:read" fallbackPath="/" />}>
                  <Route path="/" element={<PosHomePage />} />
                </Route>
                <Route path="/no-branch" element={<NoBranchPage />} />
                <Route path="/select-business" element={<SelectBusinessPage />} />
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
  window.sessionStorage.clear();
});

afterEach(() => {
  clearSession();
  vi.unstubAllEnvs();
  window.sessionStorage.clear();
  // happy-dom's default is 1024x768 (desktop); the layout cases below move it.
  resetViewport();
});

describe('PosLayout', () => {
  it('renders the POS header and the catalog shell when the user has products:read', async () => {
    const admin = makeUser('admin');
    mockFetch(admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderShell();

    // First test in the file pays the module-load cost (Vitest cold-starts
    // each test file), so the default 1s waitFor timeout flakes in CI — the
    // same failure mode already fixed for PosHomePage. 3s leaves margin.
    await waitFor(
      () => {
        expect(screen.getByTestId('catalog-search-input')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir menú de usuario/i })).toBeInTheDocument();
    // Cart panel placeholder is mounted in the layout.
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
  });

  it('redirects super_admin without selected business to /select-business', async () => {
    const superAdmin = makeUser('super_admin', { businessId: '*' });
    mockFetch(superAdmin, false);
    setSession({ accessToken: 'a', refreshToken: 'r', user: superAdmin });

    renderShell();

    await waitFor(() => {
      expect(screen.getByText(/selecciona un negocio para operar/i)).toBeInTheDocument();
    });
  });

  it('redirects a non-super_admin without branches to /no-branch', async () => {
    const cashier = makeUser('cashier', { branchIds: [] });
    mockFetch(cashier);
    setSession({ accessToken: 'a', refreshToken: 'r', user: cashier });

    renderShell();

    await waitFor(() => {
      expect(screen.getByText(/sin sucursales asignadas/i)).toBeInTheDocument();
    });
  });

  describe('layout modes', () => {
    async function renderAt(size: { width: number; height: number }) {
      setViewport(size);
      const admin = makeUser('admin');
      mockFetch(admin);
      setSession({ accessToken: 'a', refreshToken: 'r', user: admin });
      renderShell();
      await waitFor(
        () => {
          expect(screen.getByTestId('catalog-search-input')).toBeInTheDocument();
        },
        { timeout: 3000 },
      );
    }

    it('pins the cart beside the catalog on a tablet in portrait', async () => {
      // 768x1024 used to fall below `md` and get the phone drawer, even though
      // there is room for both panes. This is the regression this guards.
      await renderAt(VIEWPORT.tabletPortrait);

      expect(screen.getByTestId('pos-cart-pane-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('pos-open-cart')).not.toBeInTheDocument();
    });

    it('pins the cart on a tablet in landscape', async () => {
      await renderAt(VIEWPORT.tabletLandscape);

      expect(screen.getByTestId('pos-cart-pane-desktop')).toBeInTheDocument();
      expect(screen.queryByTestId('pos-open-cart')).not.toBeInTheDocument();
    });

    it('collapses the cart into a drawer on a handset', async () => {
      await renderAt(VIEWPORT.phone);

      expect(screen.queryByTestId('pos-cart-pane-desktop')).not.toBeInTheDocument();
      expect(screen.getByTestId('pos-open-cart')).toBeInTheDocument();
    });

    it('collapses the cart on a handset in landscape despite the width', async () => {
      // 932x430 is wider than a tablet in portrait but has no vertical room, so
      // it must stay on the drawer layout.
      await renderAt(VIEWPORT.phoneLandscape);

      expect(screen.queryByTestId('pos-cart-pane-desktop')).not.toBeInTheDocument();
      expect(screen.getByTestId('pos-open-cart')).toBeInTheDocument();
    });
  });
});
