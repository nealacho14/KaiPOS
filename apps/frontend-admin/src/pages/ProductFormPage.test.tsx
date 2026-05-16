import { KaiPOSThemeProvider } from '@kaipos/ui';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type * as ReactRouter from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductFormPage } from './ProductFormPage.js';

// Mock the API client. Each test sets up which calls it expects so we don't
// touch the global fetch boundary and our assertions stay tightly scoped to
// what the component sends.
const createProductMock = vi.fn();
const updateProductMock = vi.fn();
const getProductMock = vi.fn();
const generateUploadUrlMock = vi.fn();
const setProductFeaturedMock = vi.fn();
const listCategoriesMock = vi.fn();
const createCategoryMock = vi.fn();
const listKitchenStationsMock = vi.fn();

vi.mock('../lib/products-api.js', async () => {
  const actual = await vi.importActual('../lib/products-api.js');
  return {
    ...actual,
    createProduct: (...args: unknown[]) => createProductMock(...args),
    updateProduct: (...args: unknown[]) => updateProductMock(...args),
    getProduct: (...args: unknown[]) => getProductMock(...args),
    generateUploadUrl: (...args: unknown[]) => generateUploadUrlMock(...args),
    setProductFeatured: (...args: unknown[]) => setProductFeaturedMock(...args),
  };
});

vi.mock('../lib/categories-api.js', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
}));

vi.mock('../lib/kitchen-stations-api.js', () => ({
  listKitchenStations: (...args: unknown[]) => listKitchenStationsMock(...args),
}));

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

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof ReactRouter>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

function renderAt(url: string) {
  return render(
    <KaiPOSThemeProvider>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/products/new" element={<ProductFormPage />} />
          <Route path="/products/:id/edit" element={<ProductFormPage />} />
        </Routes>
      </MemoryRouter>
    </KaiPOSThemeProvider>,
  );
}

// happy-dom + MUI re-renders a controlled TextField per keystroke. A long
// `user.type('Vino tinto')` triggers ~10 renders that each round-trip through
// the React scheduler — fine locally, but accumulates to 10+ seconds in CI.
// `fireEvent.change` sets the value in one render via React's synthetic
// onChange, which is exactly what the component's state updater needs.
function setInputValue(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

// MUI Select expects a mouseDown to open the dropdown, then a click on the
// option. userEvent emulates the same dance through the pointer-events API
// which is heavy under happy-dom; fireEvent is enough here.
async function selectCategory(name: string): Promise<void> {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /categoría/i }));
  const option = await screen.findByRole('option', { name });
  fireEvent.click(option);
}

beforeEach(() => {
  createProductMock.mockReset();
  updateProductMock.mockReset();
  getProductMock.mockReset();
  generateUploadUrlMock.mockReset();
  setProductFeaturedMock.mockReset();
  listCategoriesMock.mockReset().mockResolvedValue({ data: [{ _id: 'c-1', name: 'Bebidas' }] });
  createCategoryMock.mockReset();
  listKitchenStationsMock.mockReset().mockResolvedValue({ data: [] });
  navigateMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductFormPage variants', () => {
  it('adds a variant, fills it in, and includes it in the create payload', async () => {
    createProductMock.mockResolvedValue({ _id: 'p-new' });
    const user = userEvent.setup({ delay: null });
    renderAt('/products/new');

    // Required basic fields. Setting SKU manually flips the form's
    // `skuTouched` flag so we don't have to wait for the auto-SKU effect.
    setInputValue(screen.getByLabelText(/nombre del producto/i), 'Vino tinto');
    await selectCategory('Bebidas');
    setInputValue(screen.getAllByRole('textbox', { name: /^sku$/i })[0]!, 'VINO-001');
    setInputValue(screen.getByLabelText(/precio de venta/i), '500');

    // Add a variant. findAllByRole waits for the new row to mount.
    await user.click(screen.getByRole('button', { name: 'Variante' }));
    const nameFields = await screen.findAllByRole('textbox', { name: /^nombre$/i });
    // index 0 = product name; the appended variant adds a second.
    setInputValue(nameFields[nameFields.length - 1]!, '750 ml');
    const skuFields = await screen.findAllByRole('textbox', { name: /^sku$/i });
    setInputValue(skuFields[skuFields.length - 1]!, 'VIN-750');

    await user.click(screen.getByRole('button', { name: /publicar producto/i }));

    await waitFor(() => expect(createProductMock).toHaveBeenCalled());
    const payload = createProductMock.mock.calls[0][0] as {
      variants?: Array<{ name: string; sku: string }>;
    };
    expect(payload.variants).toHaveLength(1);
    expect(payload.variants?.[0]).toMatchObject({ name: '750 ml', sku: 'VIN-750' });
  });

  it('flags duplicate variant SKUs inline', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/products/new');

    // The "+ Variante" add button is rendered before any rows exist. Once we
    // start adding, each variant row also has an Eliminar button whose
    // aria-label contains "variante", so we match the add button by exact name.
    await user.click(screen.getByRole('button', { name: 'Variante' }));
    await user.click(screen.getByRole('button', { name: 'Variante' }));

    // findAllByRole waits for both variant rows to render before we slice.
    const skuFields = await screen.findAllByRole('textbox', { name: /^sku$/i });
    // First SKU field is the product-level SKU; the next two are variant SKUs.
    const [variantA, variantB] = skuFields.slice(1);
    setInputValue(variantA!, 'DUPSKU');
    setInputValue(variantB!, 'DUPSKU');

    expect(await screen.findByText(/sku duplicado entre variantes/i)).toBeInTheDocument();
  });
});

describe('ProductFormPage modifier groups', () => {
  it('flags maxSelectable greater than options.length', async () => {
    const user = userEvent.setup({ delay: null });
    renderAt('/products/new');

    // Add a modifier group with one option, then bump maxSelectable to 2
    await user.click(screen.getByRole('button', { name: /grupo nuevo/i }));
    await user.click(screen.getByRole('button', { name: /^opción$/i }));

    const maxField = await screen.findByRole('spinbutton', { name: /máx/i });
    setInputValue(maxField, '2');

    // The TextField is in error state and shows a "≤ 1" helper text.
    expect(await screen.findByText(/≤ 1/)).toBeInTheDocument();
  });
});

describe('ProductFormPage availability window', () => {
  it('sends availabilityWindow when enabled', async () => {
    createProductMock.mockResolvedValue({ _id: 'p-new' });
    const user = userEvent.setup({ delay: null });
    renderAt('/products/new');

    setInputValue(screen.getByLabelText(/nombre del producto/i), 'Almuerzo');
    await selectCategory('Bebidas');
    setInputValue(screen.getAllByRole('textbox', { name: /^sku$/i })[0]!, 'ALM-001');
    setInputValue(screen.getByLabelText(/precio de venta/i), '300');

    // Enable the per-product availability window. The Switch is wrapped in a
    // FormControlLabel whose label text is the switch's accessible name.
    await user.click(screen.getByRole('switch', { name: /activar disponibilidad por horario/i }));

    await user.click(screen.getByRole('button', { name: /publicar producto/i }));

    await waitFor(() => expect(createProductMock).toHaveBeenCalled());
    const payload = createProductMock.mock.calls[0][0] as {
      availabilityWindow?: { daysOfWeek: number[]; from: string; to: string };
    };
    expect(payload.availabilityWindow).toBeDefined();
    expect(payload.availabilityWindow?.daysOfWeek.length).toBeGreaterThan(0);
    expect(payload.availabilityWindow?.from).toMatch(/^\d{2}:\d{2}$/);
    expect(payload.availabilityWindow?.to).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('ProductFormPage barcode', () => {
  it('includes barcode in payload when provided', async () => {
    createProductMock.mockResolvedValue({ _id: 'p-new' });
    const user = userEvent.setup({ delay: null });
    renderAt('/products/new');

    setInputValue(screen.getByLabelText(/nombre del producto/i), 'Cerveza');
    await selectCategory('Bebidas');
    setInputValue(screen.getAllByRole('textbox', { name: /^sku$/i })[0]!, 'CER-001');
    setInputValue(screen.getByLabelText(/precio de venta/i), '120');
    setInputValue(screen.getByLabelText(/código de barras/i), '750ml-rubia');

    await user.click(screen.getByRole('button', { name: /publicar producto/i }));

    await waitFor(() => expect(createProductMock).toHaveBeenCalled());
    const payload = createProductMock.mock.calls[0][0] as { barcode?: string };
    expect(payload.barcode).toBe('750ml-rubia');
  });
});
