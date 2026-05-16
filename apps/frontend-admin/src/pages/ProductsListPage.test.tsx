import type { Product } from '@kaipos/shared';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api.js';
import { ProductsListPage } from './ProductsListPage.js';

// We mock the products-api module so each test controls the data flow without
// touching `fetch`. The contexts (Auth, ActiveBranch, WebSocket) are similarly
// mocked at the hook boundary to avoid pulling in the whole provider tree.
const listProductsMock = vi.fn();
const reorderProductsMock = vi.fn();
const setProductFeaturedMock = vi.fn();
const deleteProductMock = vi.fn();

vi.mock('../lib/products-api.js', async () => {
  const actual = await vi.importActual('../lib/products-api.js');
  return {
    ...actual,
    listProducts: (...args: unknown[]) => listProductsMock(...args),
    reorderProducts: (...args: unknown[]) => reorderProductsMock(...args),
    setProductFeatured: (...args: unknown[]) => setProductFeaturedMock(...args),
    deleteProduct: (...args: unknown[]) => deleteProductMock(...args),
  };
});

vi.mock('../context/AuthContext.js', () => ({
  useAuth: () => ({
    user: {
      _id: 'user-1',
      businessId: 'biz-1',
      email: 'admin@x.com',
      name: 'Admin',
      role: 'admin',
      branchIds: ['branch-1'],
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'system',
    },
  }),
}));

vi.mock('../hooks/useActiveBranch.js', () => ({
  useActiveBranch: () => ({
    branchId: 'branch-1',
    setBranchId: () => undefined,
    branchIds: ['branch-1'],
    canManage: true,
  }),
}));

vi.mock('../hooks/useBranches.js', () => ({
  useBranches: () => ({
    branches: [{ _id: 'branch-1', name: 'Centro' }],
    loading: false,
    error: null,
  }),
}));

vi.mock('../context/WebSocketContext.js', () => ({
  useWebSocketContext: () => ({
    status: 'closed',
    subscribe: () => undefined,
    unsubscribe: () => undefined,
    onMessage: () => () => undefined,
  }),
}));

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function makeProduct(overrides: Partial<Product>): Product {
  return {
    _id: overrides._id ?? 'p-1',
    businessId: 'biz-1',
    branchId: 'branch-1',
    name: overrides.name ?? 'Producto',
    description: '',
    price: 100,
    category: overrides.category ?? 'Bebidas',
    sku: overrides.sku ?? 'SKU-001',
    stock: 10,
    trackStock: true,
    stockUnit: 'unit',
    availability: { pos: true, online: false, kiosk: false },
    serviceSchedules: [],
    allergens: [],
    dietaryTags: [],
    modifierGroups: [],
    kitchenStationIds: [],
    sortOrder: overrides.sortOrder ?? 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    ...overrides,
  };
}

function renderPage() {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={['/products']}>
        <Routes>
          <Route path="/products" element={<ProductsListPage />} />
        </Routes>
      </MemoryRouter>
    </KaiPOSThemeProvider>,
  );
}

beforeEach(() => {
  listProductsMock.mockReset();
  reorderProductsMock.mockReset();
  setProductFeaturedMock.mockReset();
  deleteProductMock.mockReset();
  navigateMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductsListPage filters', () => {
  it('passes featuredIn and activeNow to listProducts when toggles are on', async () => {
    listProductsMock.mockResolvedValue({
      data: [makeProduct({ _id: 'p-1', name: 'Café' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });

    const user = userEvent.setup();
    renderPage();

    await waitFor(() => expect(listProductsMock).toHaveBeenCalled());
    expect(listProductsMock.mock.calls[0][0]).toMatchObject({
      branchId: 'branch-1',
      featuredIn: undefined,
      activeNow: undefined,
    });

    await user.click(screen.getByRole('switch', { name: /sólo destacados/i }));
    await waitFor(() => {
      const last = listProductsMock.mock.calls.at(-1)?.[0];
      expect(last?.featuredIn).toBe('branch-1');
    });

    await user.click(screen.getByRole('switch', { name: /sólo disponibles ahora/i }));
    await waitFor(() => {
      const last = listProductsMock.mock.calls.at(-1)?.[0];
      expect(last?.activeNow).toBe(true);
    });
  });
});

describe('ProductsListPage featured toggle', () => {
  it('calls setProductFeatured with branchId on star click', async () => {
    listProductsMock.mockResolvedValue({
      data: [makeProduct({ _id: 'p-1', name: 'Café' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    setProductFeaturedMock.mockResolvedValue({
      _id: 'pref-1',
      businessId: 'biz-1',
      branchId: 'branch-1',
      productId: 'p-1',
      featured: true,
      updatedAt: new Date(),
      updatedBy: 'user-1',
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Café');

    const starButton = screen.getByRole('button', { name: /destacar: café/i });
    await user.click(starButton);

    await waitFor(() => {
      expect(setProductFeaturedMock).toHaveBeenCalledWith('p-1', {
        branchId: 'branch-1',
        featured: true,
      });
    });
  });

  it('reverts optimistic state when setProductFeatured fails', async () => {
    listProductsMock.mockResolvedValue({
      data: [makeProduct({ _id: 'p-1', name: 'Café' })],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    setProductFeaturedMock.mockRejectedValue(new ApiError('forbidden', 403, 'FORBIDDEN'));

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Café');
    const starButton = screen.getByRole('button', { name: /destacar: café/i });
    await user.click(starButton);

    // After failure the optimistic toggle is reverted, so the button label is
    // back to "Destacar" (rather than "Quitar destacado").
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /destacar: café/i })).toBeInTheDocument();
    });
  });
});

describe('ProductsListPage reorder mode', () => {
  it('enters reorder mode and persists order via reorderProducts', async () => {
    const products = [
      makeProduct({ _id: 'p-1', name: 'Café' }),
      makeProduct({ _id: 'p-2', name: 'Té' }),
      makeProduct({ _id: 'p-3', name: 'Agua' }),
    ];
    listProductsMock.mockResolvedValue({
      data: products,
      pagination: { page: 1, limit: 50, total: 3, totalPages: 1 },
    });
    reorderProductsMock.mockResolvedValue({ matched: 3 });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Café');

    await user.click(screen.getByRole('button', { name: /reordenar/i }));

    // After entering reorder mode the order column is visible
    await screen.findByText(/arrastra para reordenar/i);

    // We can't realistically simulate pointer drag in jsdom, so we verify the
    // save path by triggering "Guardar orden" with the unchanged draft — the
    // call must include sequential sortOrder values (0..n-1) for the current
    // row order, proving the page wires the draft into the API correctly.
    await user.click(screen.getByRole('button', { name: /guardar orden/i }));

    await waitFor(() => {
      expect(reorderProductsMock).toHaveBeenCalledWith('branch-1', [
        { id: 'p-1', sortOrder: 0 },
        { id: 'p-2', sortOrder: 1 },
        { id: 'p-3', sortOrder: 2 },
      ]);
    });
  });

  it('shows an error toast when reorderProducts fails with REORDER_PRODUCT_NOT_FOUND', async () => {
    const products = [
      makeProduct({ _id: 'p-1', name: 'Café' }),
      makeProduct({ _id: 'p-2', name: 'Té' }),
    ];
    listProductsMock.mockResolvedValue({
      data: products,
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });
    reorderProductsMock.mockRejectedValue(
      new ApiError('not found', 400, 'REORDER_PRODUCT_NOT_FOUND'),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Café');
    await user.click(screen.getByRole('button', { name: /reordenar/i }));
    await user.click(screen.getByRole('button', { name: /guardar orden/i }));

    expect(await screen.findByText(/cambiaron mientras reordenabas/i)).toBeInTheDocument();
  });

  it('cancel exits reorder mode without calling reorderProducts', async () => {
    const products = [
      makeProduct({ _id: 'p-1', name: 'Café' }),
      makeProduct({ _id: 'p-2', name: 'Té' }),
    ];
    listProductsMock.mockResolvedValue({
      data: products,
      pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByText('Café');
    await user.click(screen.getByRole('button', { name: /reordenar/i }));
    await user.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(reorderProductsMock).not.toHaveBeenCalled();
    // The reorder banner should no longer be visible.
    expect(screen.queryByText(/arrastra para reordenar/i)).not.toBeInTheDocument();
  });
});
