import type { Product } from '@kaipos/shared';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { logger } from '../lib/logger.js';

export interface AddItemOptions {
  requiresConfig?: boolean;
}

export interface CartContextValue {
  items: never[];
  addItem: (product: Product, opts?: AddItemOptions) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// Paso 2 placeholder: `addItem` and `clear` are no-ops. Paso 3 (KAI2-3) wires
// in real state + totals + modifier modal + persistence + WS publish.
export function CartProvider({ children }: { children: ReactNode }) {
  const addItem = useCallback((product: Product, opts?: AddItemOptions) => {
    logger.info('cart.addItem (no-op in Paso 2)', {
      productId: product._id,
      name: product.name,
      requiresConfig: opts?.requiresConfig ?? false,
    });
  }, []);

  const clear = useCallback(() => {
    logger.info('cart.clear (no-op in Paso 2)');
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({ items: [] as never[], addItem, clear }),
    [addItem, clear],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a <CartProvider>');
  }
  return ctx;
}
