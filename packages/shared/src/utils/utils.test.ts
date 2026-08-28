import { describe, it, expect } from 'vitest';
import { formatCurrency, generateOrderNumber, calculateOrderTotal, API_VERSION } from './index.js';

describe('API_VERSION', () => {
  it('is a semver string', () => {
    expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('formatCurrency', () => {
  // How many fraction digits a currency gets comes from the runtime's CLDR
  // data, and for COP it disagrees across ICU builds: older ones render
  // "$ 10,00", newer ones (CI, and every browser we ship to) render "$ 10".
  // Intl also separates symbol from digits with a non-breaking space. Pinning
  // exact strings here just encodes whichever ICU the author happened to run,
  // so assert the properties that actually matter instead.
  const norm = (s: string) => s.replace(/\u00a0/g, ' ');

  it('formats Colombian pesos with a $ symbol by default', () => {
    expect(norm(formatCurrency(10))).toMatch(/^\$ ?10(,00)?$/);
  });

  it('formats zero', () => {
    expect(norm(formatCurrency(0))).toMatch(/^\$ ?0(,00)?$/);
  });

  it('groups thousands with dots, not commas, per es-CO conventions', () => {
    // "$ 1.234,50" or "$ 1.235" depending on CLDR \u2014 but never the en-US
    // "1,234.50", which is the pairing that produced the old "MX$" bug.
    const formatted = norm(formatCurrency(1234.5));
    expect(formatted).toMatch(/1\.23[45]/);
    expect(formatted).not.toMatch(/1,234\.50/);
  });

  it('never renders the MX$ prefix that the old MXN/en-US pairing produced', () => {
    expect(formatCurrency(1234.5)).not.toContain('MX');
  });

  it('supports custom currency', () => {
    expect(formatCurrency(10, 'EUR', 'de-DE')).toContain('10,00');
  });

  it('falls back to the default currency when the code is malformed', () => {
    // A non-ISO code makes Intl throw; the price must still render, and render
    // exactly as the default would. Comparing against formatCurrency(10) keeps
    // this independent of the runtime's fraction-digit choice.
    expect(formatCurrency(10, 'MX')).toBe(formatCurrency(10));
  });
});

describe('generateOrderNumber', () => {
  it('starts with ORD-', () => {
    expect(generateOrderNumber()).toMatch(/^ORD-/);
  });

  it('generates unique numbers', () => {
    const a = generateOrderNumber();
    const b = generateOrderNumber();
    expect(a).not.toBe(b);
  });

  it('contains only uppercase alphanumeric and dashes', () => {
    expect(generateOrderNumber()).toMatch(/^ORD-[A-Z0-9]+-[A-Z0-9]+$/);
  });
});

describe('calculateOrderTotal', () => {
  it('calculates subtotal without tax', () => {
    const result = calculateOrderTotal([{ quantity: 2, unitPrice: 10 }]);
    expect(result).toEqual({ subtotal: 20, tax: 0, total: 20 });
  });

  it('calculates with tax', () => {
    const result = calculateOrderTotal([{ quantity: 1, unitPrice: 100 }], 0.08);
    expect(result).toEqual({ subtotal: 100, tax: 8, total: 108 });
  });

  it('handles multiple items', () => {
    const result = calculateOrderTotal([
      { quantity: 2, unitPrice: 5 },
      { quantity: 3, unitPrice: 10 },
    ]);
    expect(result).toEqual({ subtotal: 40, tax: 0, total: 40 });
  });

  it('handles empty items', () => {
    const result = calculateOrderTotal([]);
    expect(result).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });

  it('handles zero quantity', () => {
    const result = calculateOrderTotal([{ quantity: 0, unitPrice: 10 }]);
    expect(result).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});
