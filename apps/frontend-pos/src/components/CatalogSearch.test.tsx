import { KaiPOSThemeProvider } from '@kaipos/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CatalogSearch } from './CatalogSearch.js';

describe('CatalogSearch', () => {
  it('emits onChange on every keystroke (parent owns the debounce)', () => {
    const onChange = vi.fn();
    render(
      <KaiPOSThemeProvider>
        <CatalogSearch value="" onChange={onChange} />
      </KaiPOSThemeProvider>,
    );

    const input = screen.getByTestId('catalog-search-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'b' } });
    fireEvent.change(input, { target: { value: 'bu' } });
    fireEvent.change(input, { target: { value: 'bur' } });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenLastCalledWith('bur');
  });

  it('clear button resets the input and refocuses', () => {
    const onChange = vi.fn();
    render(
      <KaiPOSThemeProvider>
        <CatalogSearch value="pizza" onChange={onChange} />
      </KaiPOSThemeProvider>,
    );

    const input = screen.getByTestId('catalog-search-input') as HTMLInputElement;
    const clear = screen.getByTestId('catalog-search-clear');
    fireEvent.click(clear);

    expect(onChange).toHaveBeenLastCalledWith('');
    expect(document.activeElement).toBe(input);
  });
});
