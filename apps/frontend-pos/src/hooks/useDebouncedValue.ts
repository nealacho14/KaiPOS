import { useEffect, useState } from 'react';

// Generic debounced value hook. We re-implement (rather than reuse the
// `useDebounced` inside admin's ProductsListPage) because the admin copy is
// page-local and not exported. The eventual home for this is the
// `app-runtime` extraction follow-up.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}
