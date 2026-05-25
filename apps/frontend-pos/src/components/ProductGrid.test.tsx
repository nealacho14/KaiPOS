import type { Product } from '@kaipos/shared';
import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductGrid } from './ProductGrid.js';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    _id: 'p1',
    businessId: 'b1',
    branchId: 'br1',
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

describe('ProductGrid', () => {
  it('shows the Configurable chip only on products with required modifier groups', () => {
    const items: Product[] = [
      makeProduct({ _id: 'p1', name: 'Café Americano', price: 50 }),
      makeProduct({
        _id: 'p2',
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
      makeProduct({
        _id: 'p3',
        name: 'Limonada',
        price: 40,
        modifierGroups: [
          {
            id: 'm2',
            name: 'Tamaño',
            required: false,
            maxSelectable: 1,
            options: [{ id: 'o1', label: 'Chica', priceDelta: 0 }],
          },
        ],
      }),
    ];

    render(
      <KaiPOSThemeProvider>
        <ProductGrid status="ready" items={items} currency="MXN" onSelect={() => {}} />
      </KaiPOSThemeProvider>,
    );

    const p1 = screen.getByTestId('product-tile-p1');
    const p2 = screen.getByTestId('product-tile-p2');
    const p3 = screen.getByTestId('product-tile-p3');
    expect(within(p1).queryByText(/configurable/i)).toBeNull();
    expect(within(p2).getByText(/configurable/i)).toBeInTheDocument();
    expect(within(p3).queryByText(/configurable/i)).toBeNull();
  });

  it('renders the empty state when ready with no items', () => {
    render(
      <KaiPOSThemeProvider>
        <ProductGrid status="ready" items={[]} currency="MXN" onSelect={() => {}} />
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByText(/sin productos/i)).toBeInTheDocument();
  });

  it('renders the error state with the message and a retry button', () => {
    const retry = () => {};
    render(
      <KaiPOSThemeProvider>
        <ProductGrid
          status="error"
          items={[]}
          error="boom"
          currency="MXN"
          onSelect={() => {}}
          onRetry={retry}
        />
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument();
  });

  it('renders skeletons during initial load', () => {
    render(
      <KaiPOSThemeProvider>
        <ProductGrid status="loading" items={[]} currency="MXN" onSelect={() => {}} />
      </KaiPOSThemeProvider>,
    );
    expect(screen.getByTestId('product-grid-skeleton')).toBeInTheDocument();
  });
});
