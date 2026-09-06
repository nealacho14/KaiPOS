import { describe, it, expect } from 'vitest';
import { createProductSchema } from '@kaipos/shared/schemas/products';
import { PRODUCT_REQUIRED_FIELDS } from '../setup.js';
import {
  MURA_ADMIN_USER_ID,
  MURA_BRANCH_ID,
  MURA_BUSINESS_ID,
  MURA_CATEGORIES,
  MURA_PRODUCTS,
  MURA_SLUG,
  buildMuraDocuments,
  featuredProducts,
  foodExtrasGroup,
  methodGroup,
  micheladaGroup,
  milkGroup,
  syrupGroup,
} from './mura-menu.js';

const SKU_RE = /^[a-z0-9-]+$/;
const FIXED_ID_RE = /^00000000-0000-4000-8000-[0-9a-f]{12}$/;

const ALCOHOL_SKUS = ['stella-artois', 'tumbao', 'club-colombia', 'copa-de-vino'];
const FEATURED_SKUS = ['flat-white', 'tropico', 'dirty-chai', 'burger', 'filtrado-lavado'];

function bySku(sku: string) {
  const product = MURA_PRODUCTS.find((p) => p.sku === sku);
  if (!product) throw new Error(`Missing product ${sku}`);
  return product;
}

describe('MURA_PRODUCTS', () => {
  it('has exactly 64 products', () => {
    expect(MURA_PRODUCTS).toHaveLength(64);
  });

  it('every product passes createProductSchema', () => {
    for (const { _id: _id, featured: _featured, ...product } of MURA_PRODUCTS) {
      const result = createProductSchema.safeParse({ branchId: MURA_BRANCH_ID, ...product });
      expect(result.success, `${product.sku}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
  });

  it('SKUs are unique kebab-case slugs', () => {
    const skus = MURA_PRODUCTS.map((p) => p.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of skus) expect(sku).toMatch(SKU_RE);
  });

  it('_ids are unique and follow the fixed-UUID pattern', () => {
    const ids = MURA_PRODUCTS.map((p) => p._id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(FIXED_ID_RE);
  });

  it('variant SKUs are unique globally, including against product SKUs', () => {
    const all = MURA_PRODUCTS.map((p) => p.sku);
    for (const p of MURA_PRODUCTS) {
      for (const v of p.variants ?? []) {
        expect(v.sku).toMatch(SKU_RE);
        all.push(v.sku);
      }
    }
    expect(new Set(all).size).toBe(all.length);
  });

  it('every category name exists in MURA_CATEGORIES', () => {
    const names = new Set(MURA_CATEGORIES.map((c) => c.name));
    for (const p of MURA_PRODUCTS) expect(names.has(p.category), p.sku).toBe(true);
  });

  it('descriptions are never empty', () => {
    for (const p of MURA_PRODUCTS) expect(p.description.trim().length, p.sku).toBeGreaterThan(0);
  });

  it('modifier groups respect maxSelectable <= options.length with unique option ids', () => {
    for (const p of MURA_PRODUCTS) {
      const groupIds = p.modifierGroups.map((g) => g.id);
      expect(new Set(groupIds).size, p.sku).toBe(groupIds.length);
      for (const g of p.modifierGroups) {
        expect(g.maxSelectable, `${p.sku}/${g.id}`).toBeLessThanOrEqual(g.options.length);
        const optionIds = g.options.map((o) => o.id);
        expect(new Set(optionIds).size, `${p.sku}/${g.id}`).toBe(optionIds.length);
      }
    }
  });

  it('reproduces the Filtrados price table from the menu', () => {
    const table: Record<string, [number, number, number]> = {
      'filtrado-lavado': [12000, 20000, 30000],
      'filtrado-honey': [15000, 26000, 38000],
      'filtrado-natural': [16000, 29000, 39000],
    };
    for (const [sku, expected] of Object.entries(table)) {
      const p = bySku(sku);
      const variants = p.variants ?? [];
      expect(variants.map((v) => v.id)).toEqual(['1-taza', '2-tazas', '3-tazas']);
      expect(variants.map((v) => p.price + v.priceDelta)).toEqual(expected);
      expect(p.modifierGroups.map((g) => g.id)).toEqual(['metodo']);
    }
  });

  it('featuredProducts() returns exactly the 5 featured SKUs', () => {
    expect(
      featuredProducts()
        .map((p) => p.sku)
        .sort(),
    ).toEqual([...FEATURED_SKUS].sort());
  });

  it('alcohol is POS-only, everything else is online', () => {
    for (const p of MURA_PRODUCTS) {
      const expectedOnline = !ALCOHOL_SKUS.includes(p.sku);
      expect(p.availability.online, p.sku).toBe(expectedOnline);
      expect(p.availability.pos, p.sku).toBe(true);
      expect(p.availability.kiosk, p.sku).toBe(false);
    }
  });

  it('applies the common defaults explicitly', () => {
    for (const p of MURA_PRODUCTS) {
      expect(p.trackStock, p.sku).toBe(false);
      expect(p.stock, p.sku).toBe(0);
      expect(p.stockUnit, p.sku).toBe('unit');
      expect(p.serviceSchedules, p.sku).toEqual([]);
      expect(p.kitchenStationIds, p.sku).toEqual([]);
    }
  });

  it('numbers sortOrder 10, 20, 30... within each category, in menu order', () => {
    const perCategory = new Map<string, number[]>();
    for (const p of MURA_PRODUCTS) {
      const list = perCategory.get(p.category) ?? [];
      list.push(p.sortOrder);
      perCategory.set(p.category, list);
    }
    for (const [category, orders] of perCategory) {
      expect(orders, category).toEqual(orders.map((_, i) => (i + 1) * 10));
    }
    // Product ids follow menu order 01..64.
    expect(MURA_PRODUCTS.map((p) => p._id.slice(-2))).toEqual(
      MURA_PRODUCTS.map((_, i) => String(i + 1).padStart(2, '0')),
    );
  });

  it('cordial exposes the five flavours as variants', () => {
    expect(bySku('cordial').variants?.map((v) => v.sku)).toEqual([
      'cordial-costa-dorada',
      'cordial-valle-de-las-rosas',
      'cordial-japon-tropical',
      'cordial-mexico-ardiente',
      'cordial-vinas-de-francia',
    ]);
  });

  it('wires milk + extras on milk drinks and food extras on plates', () => {
    expect(bySku('latte').modifierGroups.map((g) => g.id)).toEqual(['leche', 'extras']);
    expect(bySku('espresso').modifierGroups.map((g) => g.id)).toEqual(['extras']);
    expect(bySku('infusion').modifierGroups).toEqual([]);
    expect(bySku('burger').modifierGroups.map((g) => g.id)).toEqual(['adiciones-comida']);
    expect(bySku('stella-artois').modifierGroups.map((g) => g.id)).toEqual(['michelada']);
    expect(bySku('copa-de-vino').modifierGroups).toEqual([]);
  });
});

describe('MURA_CATEGORIES', () => {
  it('has 13 categories with sortOrder 1..13 in menu order', () => {
    expect(MURA_CATEGORIES.map((c) => c.name)).toEqual([
      'Filtrados',
      'Café',
      'Ice',
      'Cold Brew',
      'Frappé',
      'Tés',
      'Jugos',
      'Fizz',
      'Otros',
      'Cervezas',
      'Desayunos',
      'Bowls',
      'All Day',
    ]);
    expect(MURA_CATEGORIES.map((c) => c.sortOrder)).toEqual(MURA_CATEGORIES.map((_, i) => i + 1));
    const ids = MURA_CATEGORIES.map((c) => c._id);
    expect(new Set(ids).size).toBe(13);
    for (const id of ids) expect(id).toMatch(FIXED_ID_RE);
  });
});

describe('modifier group builders', () => {
  it('return fresh objects on every call with the contracted ids', () => {
    for (const build of [methodGroup, milkGroup, syrupGroup, micheladaGroup, foodExtrasGroup]) {
      const a = build();
      const b = build();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      expect(a.options).not.toBe(b.options);
    }
    expect(methodGroup().id).toBe('metodo');
    expect(milkGroup().id).toBe('leche');
    expect(syrupGroup().id).toBe('extras');
    expect(micheladaGroup().id).toBe('michelada');
    expect(foodExtrasGroup().id).toBe('adiciones-comida');
  });
});

describe('buildMuraDocuments', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const docs = buildMuraDocuments({
    now,
    imageBaseUrl: 'https://cdn.example.com/',
    createdBy: MURA_ADMIN_USER_ID,
  });

  it('builds business and branch with the fixed ids', () => {
    expect(docs.business).toMatchObject({
      _id: MURA_BUSINESS_ID,
      slug: MURA_SLUG,
      currency: 'COP',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    expect(docs.branch).toMatchObject({
      _id: MURA_BRANCH_ID,
      businessId: MURA_BUSINESS_ID,
      timezone: 'America/Bogota',
      isActive: true,
      createdBy: MURA_ADMIN_USER_ID,
    });
  });

  it('products carry every key the products validator requires', () => {
    expect(docs.products).toHaveLength(64);
    for (const product of docs.products) {
      for (const key of PRODUCT_REQUIRED_FIELDS) {
        expect(product, `${product.sku} missing ${key}`).toHaveProperty(key);
      }
      expect(product).not.toHaveProperty('featured');
      expect(product.imageUrl).toBe(
        `https://cdn.example.com/products/${MURA_BRANCH_ID}/placeholder.webp`,
      );
      expect(product.businessId).toBe(MURA_BUSINESS_ID);
      expect(product.branchId).toBe(MURA_BRANCH_ID);
      expect(product.isActive).toBe(true);
    }
    expect(docs.products.map((p) => p.sku)).toEqual(MURA_PRODUCTS.map((p) => p.sku));
  });

  it('categories are fully-formed documents', () => {
    expect(docs.categories).toHaveLength(13);
    for (const c of docs.categories) {
      expect(c).toMatchObject({
        businessId: MURA_BUSINESS_ID,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdBy: MURA_ADMIN_USER_ID,
      });
      expect(typeof c.sortOrder).toBe('number');
    }
  });

  it('emits 5 featured preferences pointing at the featured products', () => {
    expect(docs.productPreferences).toHaveLength(5);
    const featuredIds = new Set(featuredProducts().map((p) => p._id));
    for (const pref of docs.productPreferences) {
      expect(pref).toMatchObject({
        businessId: MURA_BUSINESS_ID,
        branchId: MURA_BRANCH_ID,
        featured: true,
        updatedAt: now,
        updatedBy: MURA_ADMIN_USER_ID,
      });
      expect(pref._id).toMatch(FIXED_ID_RE);
      expect(featuredIds.has(pref.productId), pref.productId).toBe(true);
    }
  });

  it('is deterministic and does not share modifier group references between calls', () => {
    const again = buildMuraDocuments({
      now,
      imageBaseUrl: 'https://cdn.example.com',
      createdBy: MURA_ADMIN_USER_ID,
    });
    expect(again).toEqual(docs);
    expect(again.products[0]!.modifierGroups).not.toBe(docs.products[0]!.modifierGroups);
  });
});
