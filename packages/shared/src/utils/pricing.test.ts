import { describe, expect, it } from 'vitest';
import type { Product, ModifierGroup, ModifierOption, ProductVariant } from '../types/index.js';
import { computeEffectivePrice, type ModifierSelection } from './pricing.js';

function makeOption(id: string, priceDelta: number, label = id): ModifierOption {
  return { id, label, priceDelta };
}

function makeGroup(
  id: string,
  options: ModifierOption[],
  overrides: Partial<ModifierGroup> = {},
): ModifierGroup {
  return {
    id,
    name: overrides.name ?? id,
    required: overrides.required ?? false,
    maxSelectable: overrides.maxSelectable ?? options.length,
    options,
  };
}

function makeVariant(id: string, priceDelta: number, sku = `SKU-${id}`): ProductVariant {
  return { id, name: id, sku, priceDelta };
}

function makeProduct(overrides: Partial<Product> = {}): Product {
  const base: Product = {
    _id: 'p-1',
    businessId: 'b-1',
    branchId: 'br-1',
    name: 'Burger',
    description: '',
    price: 10,
    category: 'Mains',
    sku: 'SKU-1',
    stock: 0,
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
    createdAt: new Date(0),
    updatedAt: new Date(0),
    createdBy: 'u-1',
  };
  return { ...base, ...overrides };
}

describe('computeEffectivePrice', () => {
  it('returns base price when no variant and no selections', () => {
    const product = makeProduct({ price: 12.5 });
    const result = computeEffectivePrice(product, undefined);
    expect(result).toEqual({ basePrice: 12.5, modifiersTotal: 0, total: 12.5 });
  });

  it("applies the matching variant's priceDelta", () => {
    const product = makeProduct({
      price: 10,
      variants: [makeVariant('v-large', 3.5)],
    });
    const result = computeEffectivePrice(product, 'v-large');
    expect(result.basePrice).toBe(13.5);
    expect(result.total).toBe(13.5);
  });

  it('ignores unknown variantId and returns base price', () => {
    const product = makeProduct({
      price: 10,
      variants: [makeVariant('v-large', 3.5)],
    });
    const result = computeEffectivePrice(product, 'v-missing');
    expect(result.basePrice).toBe(10);
  });

  it('sums priceDelta of selected modifier options', () => {
    const product = makeProduct({
      price: 10,
      modifierGroups: [
        makeGroup('g-cheese', [makeOption('o-cheddar', 1.25), makeOption('o-blue', 1.5)]),
      ],
    });
    const selections: ModifierSelection[] = [
      { groupId: 'g-cheese', optionIds: ['o-cheddar', 'o-blue'] },
    ];
    const result = computeEffectivePrice(product, undefined, selections);
    expect(result.modifiersTotal).toBe(2.75);
    expect(result.total).toBe(12.75);
  });

  it('ignores unknown group or option ids', () => {
    const product = makeProduct({
      price: 10,
      modifierGroups: [makeGroup('g-cheese', [makeOption('o-cheddar', 1.25)])],
    });
    const selections: ModifierSelection[] = [
      { groupId: 'g-ghost', optionIds: ['o-cheddar'] },
      { groupId: 'g-cheese', optionIds: ['o-missing'] },
    ];
    const result = computeEffectivePrice(product, undefined, selections);
    expect(result.modifiersTotal).toBe(0);
    expect(result.total).toBe(10);
  });

  it('rounds to 2 decimals to avoid float drift', () => {
    const product = makeProduct({
      price: 0.1,
      modifierGroups: [makeGroup('g', [makeOption('o', 0.2)])],
    });
    const result = computeEffectivePrice(product, undefined, [{ groupId: 'g', optionIds: ['o'] }]);
    expect(result.total).toBe(0.3);
  });

  it('combines variant and modifier selections', () => {
    const product = makeProduct({
      price: 10,
      variants: [makeVariant('v-large', 2)],
      modifierGroups: [makeGroup('g', [makeOption('o-extra', 1.5)])],
    });
    const result = computeEffectivePrice(product, 'v-large', [
      { groupId: 'g', optionIds: ['o-extra'] },
    ]);
    expect(result).toEqual({ basePrice: 12, modifiersTotal: 1.5, total: 13.5 });
  });

  it('supports negative priceDelta (e.g. half-size)', () => {
    const product = makeProduct({
      price: 10,
      variants: [makeVariant('v-half', -2)],
    });
    const result = computeEffectivePrice(product, 'v-half');
    expect(result.basePrice).toBe(8);
    expect(result.total).toBe(8);
  });
});
