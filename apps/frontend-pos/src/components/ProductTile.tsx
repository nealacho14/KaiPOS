import type { Allergen, Product } from '@kaipos/shared';
import { formatCurrency } from '@kaipos/shared';
import { PosProductCard, type PosProductCardChip } from '@kaipos/ui';

export interface ProductTileProps {
  product: Product;
  currency: string;
  onSelect: (product: Product, opts: { requiresConfig: boolean }) => void;
  highlighted?: boolean;
}

// Spanish allergen labels — duplicated from the admin form. This belongs in
// `@kaipos/shared` long-term so both apps render the same chip text; tracked
// in the runtime-extraction follow-up.
const ALLERGEN_LABELS: Record<Allergen, string> = {
  gluten: 'Gluten',
  dairy: 'Lácteos',
  egg: 'Huevo',
  peanut: 'Maní',
  'tree-nut': 'Frutos secos',
  soy: 'Soya',
  fish: 'Pescado',
  shellfish: 'Mariscos',
  sesame: 'Ajonjolí',
};

function isConfigurable(product: Product): boolean {
  // `modifierGroups` is required on the canonical type, but older seeded
  // products / Mongo docs may omit it. Treat missing as "no modifier groups".
  return (product.modifierGroups ?? []).some((g) => g.required);
}

export function ProductTile({ product, currency, onSelect, highlighted }: ProductTileProps) {
  const requiresConfig = isConfigurable(product);
  // Shared with the admin surfaces so both render the same string; it already
  // handles an unknown currency code internally.
  const formattedPrice = formatCurrency(product.price, currency);
  const allergens = product.allergens ?? [];

  const topChips: PosProductCardChip[] = allergens.slice(0, 3).map((a) => ({
    key: a,
    label: `⚠ ${ALLERGEN_LABELS[a] ?? a}`,
    color: 'warning',
    variant: 'outlined',
  }));

  return (
    <PosProductCard
      name={product.name}
      price={formattedPrice}
      imageUrl={product.imageUrl}
      topChips={topChips.length > 0 ? topChips : undefined}
      trailingChip={
        requiresConfig ? { key: 'config', label: 'Configurable', variant: 'outlined' } : undefined
      }
      interactive
      onClick={() => onSelect(product, { requiresConfig })}
      highlighted={highlighted}
      productId={product._id}
      testId={`product-tile-${product._id}`}
      ariaLabel={`${product.name} ${formattedPrice}`}
    />
  );
}
