import { IconButton, InputAdornment, TextField } from '@kaipos/ui';
import { X } from '@kaipos/ui/icons';
import { useEffect, useRef } from 'react';

export interface CatalogSearchProps {
  /** Raw input value. Parents debounce upstream before using it for queries. */
  value: string;
  onChange: (next: string) => void;
}

// Controlled input only. We intentionally do **not** debounce here — the
// parent owns debounced state via `useDebouncedValue` so a scanner-driven
// reset (`setSearchValue('')`) clears the field immediately instead of
// waiting for a debounce window to expire.
export function CatalogSearch({ value, onChange }: CatalogSearchProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global `/` shortcut focuses the search input when no other field has focus.
  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (event.key !== '/') return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  return (
    <TextField
      size="small"
      fullWidth
      placeholder="Buscar producto, SKU o código…"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputRef={inputRef}
      autoFocus
      inputProps={{
        inputMode: 'search',
        enterKeyHint: 'search',
        'aria-label': 'Buscar producto',
        // Marks this input as scanner-aware: useBarcodeScanner treats events
        // here as "redirect to the search query" rather than "swallow the
        // scan completely".
        'data-scanner-target': 'true',
        'data-testid': 'catalog-search-input',
      }}
      InputProps={{
        endAdornment: value ? (
          <InputAdornment position="end">
            <IconButton
              aria-label="Limpiar búsqueda"
              onClick={handleClear}
              size="small"
              edge="end"
              data-testid="catalog-search-clear"
            >
              <X />
            </IconButton>
          </InputAdornment>
        ) : null,
      }}
    />
  );
}
