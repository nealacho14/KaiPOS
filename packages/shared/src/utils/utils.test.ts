import { describe, it, expect } from 'vitest';
import { formatCurrency, generateOrderNumber, calculateOrderTotal, API_VERSION } from './index.js';

describe('API_VERSION', () => {
  it('is a semver string', () => {
    expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('formatCurrency', () => {
  // Intl separates the symbol from the digits with a non-breaking space and the
  // exact spacing has shifted between ICU versions. Normalise it so these
  // assertions test the format we care about, not the runtime's whitespace.
  const norm = (s: string) => s.replace(/\u00a0/g, ' ');

  it('formats Colombian pesos by default', () => {
    expect(norm(formatCurrency(10))).toBe('$ 10,00');
  });

  it('formats cents correctly', () => {
    expect(norm(formatCurrency(9.99))).toBe('$ 9,99');
  });

  it('formats zero', () => {
    expect(norm(formatCurrency(0))).toBe('$ 0,00');
  });

  it('uses dots for thousands and a comma for decimals', () => {
    expect(norm(formatCurrency(1234.5))).toBe('$ 1.234,50');
  });

  it('never renders the MX$ prefix that the old MXN/en-US pairing produced', () => {
    expect(formatCurrency(1234.5)).not.toContain('MX');
  });

  it('supports custom currency', () => {
    expect(formatCurrency(10, 'EUR', 'de-DE')).toContain('10,00');
  });

  it('falls back to the default currency when the code is malformed', () => {
    // A non-ISO code makes Intl throw; the price must still render.
    expect(norm(formatCurrency(10, 'MX'))).toBe('$ 10,00');
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
