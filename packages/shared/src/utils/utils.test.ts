import { describe, it, expect } from 'vitest';
import { formatCurrency, generateOrderNumber, calculateOrderTotal, API_VERSION } from './index.js';

describe('API_VERSION', () => {
  it('is a semver string', () => {
    expect(API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('formatCurrency', () => {
  it('formats USD by default', () => {
    expect(formatCurrency(10)).toBe('$10.00');
  });

  it('formats cents correctly', () => {
    expect(formatCurrency(9.99)).toBe('$9.99');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats large amounts with commas', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
  });

  it('supports custom currency', () => {
    expect(formatCurrency(10, 'EUR', 'de-DE')).toContain('10,00');
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
