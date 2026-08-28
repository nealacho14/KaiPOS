import type { Product } from '@kaipos/shared';
import { Box, Button, EmptyState, Skeleton } from '@kaipos/ui';
import type { CatalogStatus } from '../state/CatalogProvider.js';
import { ProductTile } from './ProductTile.js';

export interface ProductGridProps {
  status: CatalogStatus;
  items: Product[];
  error?: string;
  currency: string;
  highlightedId?: string | null;
  onSelect: (product: Product, opts: { requiresConfig: boolean }) => void;
  onRetry?: () => void;
}

const SKELETON_COUNT = 12;

// Shared by the skeleton and the real grid so the two can't drift — they were
// previously two copies of the same literal.
//
// The tablet floor is deliberately *smaller* than the phone one: the tablet
// layout gives ~40% of the width to the cart pane, so tiles must be narrower to
// still fit three across. Keys are width-only, which is all tile sizing needs.
const GRID_SX = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'repeat(auto-fill, minmax(140px, 1fr))',
    sm: 'repeat(auto-fill, minmax(150px, 1fr))',
    md: 'repeat(auto-fill, minmax(180px, 1fr))',
    lg: 'repeat(auto-fill, minmax(200px, 1fr))',
  },
  gap: 1.5,
  p: 2,
} as const;

export function ProductGrid({
  status,
  items,
  error,
  currency,
  highlightedId,
  onSelect,
  onRetry,
}: ProductGridProps) {
  // Initial load — no rows yet. Show skeletons so the grid doesn't pop in
  // empty. After first page lands we render real rows and let the rest of
  // the pages merge in without a re-skeleton.
  if (status === 'loading' && items.length === 0) {
    return (
      <Box sx={GRID_SX} data-testid="product-grid-skeleton">
        {Array.from({ length: SKELETON_COUNT }, (_, idx) => (
          <Skeleton key={idx} variant="rounded" height={220} />
        ))}
      </Box>
    );
  }

  if (status === 'error') {
    return (
      <Box sx={{ p: 2 }} data-testid="product-grid-error">
        <EmptyState
          title="No pudimos cargar el catálogo"
          subtitle={error}
          action={
            onRetry ? (
              <Button variant="outlined" onClick={onRetry}>
                Reintentar
              </Button>
            ) : undefined
          }
        />
      </Box>
    );
  }

  if (items.length === 0) {
    return (
      <Box sx={{ p: 2 }} data-testid="product-grid-empty">
        <EmptyState title="Sin productos" subtitle="Ajusta la búsqueda o cambia de categoría." />
      </Box>
    );
  }

  return (
    <Box sx={GRID_SX} data-testid="product-grid">
      {items.map((product) => (
        <ProductTile
          key={product._id}
          product={product}
          currency={currency}
          onSelect={onSelect}
          highlighted={product._id === highlightedId}
        />
      ))}
    </Box>
  );
}
