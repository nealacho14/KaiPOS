import { KaiPOSThemeProvider } from '@kaipos/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CartProvider } from '../context/CartContext.js';
import { CartPanel } from './CartPanel.js';

describe('CartPanel', () => {
  it('renders empty state, a zero total and a disabled Cobrar CTA in Paso 2', () => {
    render(
      <KaiPOSThemeProvider>
        <CartProvider>
          <CartPanel currency="COP" />
        </CartProvider>
      </KaiPOSThemeProvider>,
    );

    expect(screen.getByText(/orden actual/i)).toBeInTheDocument();
    expect(screen.getByText(/toca un producto para empezar/i)).toBeInTheDocument();

    const total = screen.getByTestId('cart-panel-total');
    // Normalize the non-breaking space Intl inserts. COP renders as "$ 0" or
    // "$ 0,00" depending on the runtime's CLDR data, so match either rather
    // than pinning the fraction digits of whichever ICU build runs the suite.
    expect(total.textContent?.replace(/\s/g, '')).toMatch(/^\$0(,00)?$/);

    const checkout = screen.getByTestId('cart-panel-checkout') as HTMLButtonElement;
    expect(checkout.textContent).toMatch(/cobrar/i);
    expect(checkout.disabled).toBe(true);
  });
});
