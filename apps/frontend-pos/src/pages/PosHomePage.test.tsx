import type { Product, User } from '@kaipos/shared';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  AuthProvider,
  clearSession,
  RequireAuth,
  RequirePermission,
  setSession,
} from '@kaipos/app-runtime';
import { PosLayout } from '../layouts/PosLayout.js';
import { PosHomePage } from './PosHomePage.js';

type SafeUser = Omit<User, 'passwordHash'>;

function makeUser(role: User['role']): SafeUser {
  return {
    _id: `u-${role}`,
    businessId: 'b1',
    email: `${role}@x.com`,
    name: 'Admin User',
    role,
    isActive: true,
    branchIds: ['branch-1'],
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
  };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    businessId: 'b1',
    branchId: 'branch-1',
    name: 'Pizza Margarita',
    description: '',
    price: 120,
    category: 'comida',
    sku: 'PZ-1',
    stock: 10,
    trackStock: false,
    stockUnit: 'unit',
    availability: { pos: true, online: true, kiosk: true },
    serviceSchedules: [],
    allergens: [],
    dietaryTags: [],
    modifierGroups: [],
    kitchenStationIds: [],
    sortOrder: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    ...overrides,
  };
}

interface ProductsCall {
  url: string;
  params: Record<string, string>;
}

interface MockState {
  productsCalls: ProductsCall[];
  productsResponse: (params: Record<string, string>) => {
    data: Product[];
    totalCount: number;
    totalPages: number;
  };
}

function setupMockFetch(state: MockState, user: SafeUser) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();

    if (url === '/api/auth/me') {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user,
            business: { _id: 'b1', name: 'La Cocina', slug: 'la-cocina', currency: 'MXN' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url.startsWith('/api/branches')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { branches: [{ _id: 'branch-1', name: 'Sucursal Centro' }] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url.startsWith('/api/categories')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ _id: 'cat-comida', name: 'Comida', sortOrder: 1 }],
          pagination: { totalPages: 1, page: 1, limit: 100, totalCount: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (url.startsWith('/api/products')) {
      const qs = new URLSearchParams(url.split('?')[1] ?? '');
      const params: Record<string, string> = {};
      qs.forEach((value, key) => {
        params[key] = value;
      });
      state.productsCalls.push({ url, params });
      const { data, totalCount, totalPages } = state.productsResponse(params);
      return new Response(
        JSON.stringify({
          success: true,
          data,
          pagination: {
            totalPages,
            page: Number(params.page ?? '1'),
            limit: Number(params.limit ?? '100'),
            totalCount,
          },
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

function renderApp() {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={['/']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>login page</div>} />
            <Route element={<RequireAuth />}>
              <Route element={<PosLayout />}>
                <Route element={<RequirePermission permission="products:read" fallbackPath="/" />}>
                  <Route path="/" element={<PosHomePage />} />
                </Route>
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
});

describe('PosHomePage', () => {
  it('renders the catalog grid with products fetched for the active branch', async () => {
    const admin = makeUser('admin');
    const state: MockState = {
      productsCalls: [],
      productsResponse: () => ({
        data: [
          makeProduct({ _id: 'p1', name: 'Café Americano', price: 50 }),
          makeProduct({ _id: 'p2', name: 'Pizza Margarita', price: 120 }),
        ],
        totalCount: 2,
        totalPages: 1,
      }),
    };
    setupMockFetch(state, admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderApp();

    // First test in the file pays the module-load cost (Vitest cold-starts
    // each test file). The default 1s timeout is enough locally but flakes in
    // CI now that AuthProvider + ActiveBranchProvider + CatalogProvider come
    // from a separate workspace package (extra resolution + chained effects
    // before the first products fetch resolves). 3s leaves margin.
    await waitFor(
      () => {
        expect(screen.getByTestId('product-tile-p1')).toBeInTheDocument();
        expect(screen.getByTestId('product-tile-p2')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    const firstCall = state.productsCalls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall!.params.branchId).toBe('branch-1');
    expect(firstCall!.params.activeNow).toBe('true');
  });

  it('passes featuredIn=<branchId> when the Destacados tab is selected', async () => {
    const admin = makeUser('admin');
    const state: MockState = {
      productsCalls: [],
      productsResponse: () => ({
        data: [makeProduct({ _id: 'p1', name: 'Café Americano', price: 50 })],
        totalCount: 1,
        totalPages: 1,
      }),
    };
    setupMockFetch(state, admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderApp();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Destacados' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Destacados' }));

    await waitFor(() => {
      expect(state.productsCalls.some((c) => c.params.featuredIn === 'branch-1')).toBe(true);
    });
  });

  it('shows a "Configuración pendiente" snackbar when a configurable tile is tapped', async () => {
    const admin = makeUser('admin');
    const state: MockState = {
      productsCalls: [],
      productsResponse: () => ({
        data: [
          makeProduct({
            _id: 'p1',
            name: 'Hamburguesa',
            price: 130,
            modifierGroups: [
              {
                id: 'm1',
                name: 'Carne',
                required: true,
                maxSelectable: 1,
                options: [{ id: 'o1', label: 'Res', priceDelta: 0 }],
              },
            ],
          }),
        ],
        totalCount: 1,
        totalPages: 1,
      }),
    };
    setupMockFetch(state, admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderApp();

    const tile = await screen.findByTestId('product-tile-p1');
    fireEvent.click(tile);

    await waitFor(() => {
      const sb = screen.getByTestId('pos-snackbar');
      expect(within(sb).getByText(/configuración pendiente \(paso 3\)/i)).toBeInTheDocument();
    });
  });

  it('shows the "Sin coincidencias" snackbar when a scan returns no matches', async () => {
    const admin = makeUser('admin');
    const state: MockState = {
      productsCalls: [],
      productsResponse: (params) => {
        if (params.q === 'NOMATCHCODE') {
          return { data: [], totalCount: 0, totalPages: 1 };
        }
        return {
          data: [makeProduct({ _id: 'p1', name: 'Pizza', price: 100 })],
          totalCount: 1,
          totalPages: 1,
        };
      },
    };
    setupMockFetch(state, admin);
    setSession({ accessToken: 'a', refreshToken: 'r', user: admin });

    renderApp();
    await screen.findByTestId('product-tile-p1');

    // Dispatch a barcode-style burst targeting the body so the hook accepts it.
    let ts = 5000;
    for (const ch of 'NOMATCHCODE') {
      const evt = new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true });
      Object.defineProperty(evt, 'timeStamp', { value: ts });
      window.dispatchEvent(evt);
      ts += 10;
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    Object.defineProperty(enter, 'timeStamp', { value: ts + 10 });
    window.dispatchEvent(enter);

    await waitFor(() => {
      const sb = screen.getByTestId('pos-snackbar');
      expect(within(sb).getByText(/sin coincidencias/i)).toBeInTheDocument();
    });
  });
});
