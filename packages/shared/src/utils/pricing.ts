import type { ModifierGroup, ModifierOption, Product, ProductVariant } from '../types/index.js';

export interface ModifierSelection {
  /** ModifierGroup.id */
  groupId: string;
  /** Selected ModifierOption.id values within the group. */
  optionIds: string[];
}

export interface EffectivePriceBreakdown {
  /** Product.price + selected variant priceDelta. */
  basePrice: number;
  /** Sum of priceDelta across every selected modifier option. */
  modifiersTotal: number;
  /** basePrice + modifiersTotal. Rounded to 2 decimals to avoid float drift. */
  total: number;
}

const TWO_DECIMALS = 100;

function roundCurrency(amount: number): number {
  return Math.round(amount * TWO_DECIMALS) / TWO_DECIMALS;
}

function resolveVariant(product: Product, variantId: string | undefined): ProductVariant | null {
  if (!variantId) return null;
  const variants = product.variants ?? [];
  return variants.find((v) => v.id === variantId) ?? null;
}

function resolveOptions(group: ModifierGroup, optionIds: string[]): ModifierOption[] {
  if (optionIds.length === 0) return [];
  return group.options.filter((opt) => optionIds.includes(opt.id));
}

/**
 * Computes the effective unit price for a product given an optional variant
 * and the customer's modifier selections. Single source of truth used by POS,
 * kiosk, and online checkout — keep order math here so the three surfaces can
 * never disagree on the same cart line.
 *
 * Behavior:
 * - Unknown `variantId` is ignored (returns base price). The caller is the one
 *   that validates the variant exists; ignoring it here keeps pricing tolerant
 *   to partial UI state during a render race.
 * - Unknown `groupId` / `optionId` entries in `selections` are ignored for the
 *   same reason.
 * - `total` is rounded to 2 decimals because Mongo persists doubles and naive
 *   `+ priceDelta` chains produce `0.30000000000000004`-style noise.
 */
export function computeEffectivePrice(
  product: Product,
  variantId: string | undefined,
  selections: ModifierSelection[] = [],
): EffectivePriceBreakdown {
  const variant = resolveVariant(product, variantId);
  const basePrice = roundCurrency(product.price + (variant?.priceDelta ?? 0));

  let modifiersTotal = 0;
  for (const selection of selections) {
    const group = product.modifierGroups.find((g) => g.id === selection.groupId);
    if (!group) continue;
    for (const option of resolveOptions(group, selection.optionIds)) {
      modifiersTotal += option.priceDelta;
    }
  }
  modifiersTotal = roundCurrency(modifiersTotal);

  return {
    basePrice,
    modifiersTotal,
    total: roundCurrency(basePrice + modifiersTotal),
  };
}
