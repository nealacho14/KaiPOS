import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryTabs, TAB_ALL } from './CategoryTabs.js';

function mockCategoriesFetch(categories: Array<{ _id: string; name: string; sortOrder: number }>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url.startsWith('/api/categories')) {
      return new Response(
        JSON.stringify({
          success: true,
          data: categories,
          pagination: { totalPages: 1, page: 1, limit: 100, totalCount: categories.length },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CategoryTabs', () => {
  it('renders pinned tabs first, then categories sorted by sortOrder', async () => {
    mockCategoriesFetch([
      { _id: 'c-comida', name: 'Comida', sortOrder: 2 },
      { _id: 'c-bebidas', name: 'Bebidas', sortOrder: 1 },
    ]);

    render(
      <KaiPOSThemeProvider>
        <CategoryTabs value={TAB_ALL} onChange={() => {}} />
      </KaiPOSThemeProvider>,
    );

    // Pinned tabs render synchronously.
    expect(screen.getByRole('tab', { name: 'Todas' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Destacados' })).toBeInTheDocument();

    // Dynamic categories arrive once the fetch resolves.
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Bebidas' })).toBeInTheDocument();
    });

    const tabs = screen.getAllByRole('tab').map((el) => el.textContent?.trim());
    expect(tabs).toEqual(['Todas', 'Destacados', 'Bebidas', 'Comida']);
  });
});
