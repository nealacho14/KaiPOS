export {
  computeEffectivePrice,
  type EffectivePriceBreakdown,
  type ModifierSelection,
} from './pricing.js';

export const API_VERSION = '1.0.2';

// KaiPOS operates in Colombia, so money defaults to Colombian pesos rendered
// with Colombian conventions ("$ 1.234,50"). The locale matters as much as the
// code: formatting COP with an en-US locale yields "COP 1,234.50", and the old
// MXN/en-US pairing rendered the confusing "MX$1,234.50".
export const DEFAULT_CURRENCY = 'COP';
export const DEFAULT_LOCALE = 'es-CO';

export function formatCurrency(
  amount: number,
  currency = DEFAULT_CURRENCY,
  locale = DEFAULT_LOCALE,
): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    // An unknown/invalid ISO code throws. Fall back to the default so a bad
    // business.currency degrades to a readable price instead of a blank tile.
    return new Intl.NumberFormat(locale, { style: 'currency', currency: DEFAULT_CURRENCY }).format(
      amount,
    );
  }
}

export function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export function calculateOrderTotal(
  items: { quantity: number; unitPrice: number }[],
  taxRate = 0,
): { subtotal: number; tax: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;
  return { subtotal, tax, total };
}
