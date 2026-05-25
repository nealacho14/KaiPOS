import type { Product } from '@kaipos/shared';
import { Box, Button, Skeleton } from '@kaipos/ui';
import type { CatalogStatus } from '../state/CatalogProvider.js';
import { ProductTile } from './ProductTile.js';
import { EmptyState } from './EmptyState.js';

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
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 1.5,
          p: 2,
        }}
        data-testid="product-grid-skeleton"
      >
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
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 1.5,
        p: 2,
      }}
      data-testid="product-grid"
    >
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
