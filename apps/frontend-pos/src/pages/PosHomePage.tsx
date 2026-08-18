import type { Product } from '@kaipos/shared';
import { Alert, Box, EmptyState, Snackbar, Stack } from '@kaipos/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useActiveBranch, useAuth } from '@kaipos/app-runtime';
import { ActiveNowToggle } from '../components/ActiveNowToggle.js';
import {
  CategoryTabs,
  TAB_ALL,
  TAB_FEATURED,
  type CategoryTabValue,
} from '../components/CategoryTabs.js';
import { CatalogSearch } from '../components/CatalogSearch.js';
import { ProductGrid } from '../components/ProductGrid.js';
import { useCart } from '../context/CartContext.js';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { listProducts } from '../lib/products-api.js';
import { logger } from '../lib/logger.js';
import { useCatalog, type CatalogQuery } from '../state/CatalogProvider.js';

interface SnackbarState {
  message: string;
  severity: 'info' | 'warning' | 'success';
}

// Fallback used only when the active session has no business (super_admin) or
// the tenant document somehow lacks a currency. Real tenants ship
// `business.currency` (ISO 4217) on the auth payload.
const FALLBACK_CURRENCY = 'MXN';

export function PosHomePage() {
  const { user, business } = useAuth();
  const { branchId } = useActiveBranch();
  const { addItem } = useCart();

  const [activeTab, setActiveTab] = useState<CategoryTabValue>(TAB_ALL);
  const [searchValue, setSearchValue] = useState('');
  // Debounce here (not inside `CatalogSearch`) so the parent owns the timing
  // contract. Lets the scanner-success path clear the field immediately
  // without waiting for a debounce window to flush a stale query.
  const debouncedSearch = useDebouncedValue(searchValue, 150);
  const [hideUnavailable, setHideUnavailable] = useState(true);
  const [snackbar, setSnackbar] = useState<SnackbarState | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  // Translate the active tab into request params.
  const { category, featuredIn } = useMemo(() => {
    if (activeTab === TAB_ALL) return { category: undefined, featuredIn: undefined };
    if (activeTab === TAB_FEATURED) {
      return { category: undefined, featuredIn: branchId ?? undefined };
    }
    return { category: activeTab, featuredIn: undefined };
  }, [activeTab, branchId]);

  const query: CatalogQuery = useMemo(
    () => ({
      branchId: branchId ?? '',
      category,
      q: debouncedSearch,
      activeNow: hideUnavailable,
      featuredIn,
    }),
    [branchId, category, debouncedSearch, hideUnavailable, featuredIn],
  );

  const entry = useCatalog(query);

  // Highlight a tile after a successful scan, briefly. The grid scrolls the
  // tile into view via a ref lookup; the visual ring expires after 1 s so
  // the user can scan multiple items in rapid succession without lingering UI.
  const highlightTile = useCallback((productId: string) => {
    setHighlightedId(productId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => {
      setHighlightedId(null);
    }, 1000);
    // Defer the scroll so the DOM has the new `data-highlighted` attribute.
    queueMicrotask(() => {
      const el = document.querySelector(`[data-product-id="${productId}"]`);
      if (el && 'scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  const handleSelect = useCallback(
    (product: Product, opts: { requiresConfig: boolean }) => {
      addItem(product, opts);
      if (opts.requiresConfig) {
        setSnackbar({ message: 'Configuración pendiente (Paso 3)', severity: 'info' });
      }
    },
    [addItem],
  );

  // Scanner side-effect. We use the active branch id stashed in a ref so the
  // callback identity stays stable across re-renders.
  const branchIdRef = useRef(branchId);
  useEffect(() => {
    branchIdRef.current = branchId;
  }, [branchId]);

  const handleScan = useCallback(
    async (code: string) => {
      const branch = branchIdRef.current;
      if (!branch) return;
      // If the scanner's first character leaked into the search field, clear
      // it now so a stale `q=<first-char>` doesn't fire after the debounce.
      setSearchValue('');
      try {
        const res = await listProducts({ branchId: branch, q: code, limit: 2 });
        if (res.data.length === 0) {
          setSnackbar({ message: `Sin coincidencias para "${code}"`, severity: 'warning' });
          return;
        }
        const [first, ...rest] = res.data;
        if (!first) return;
        if (rest.length === 0) {
          handleSelect(first, {
            requiresConfig: (first.modifierGroups ?? []).some((g) => g.required),
          });
          highlightTile(first._id);
        } else {
          setSnackbar({
            message: 'Múltiples coincidencias, selecciona manualmente',
            severity: 'info',
          });
          highlightTile(first._id);
        }
      } catch (error) {
        logger.error('scanner.lookup failed', {
          code,
          message: error instanceof Error ? error.message : 'unknown',
        });
        setSnackbar({ message: 'No pudimos buscar el código', severity: 'warning' });
      }
    },
    [handleSelect, highlightTile],
  );

  useBarcodeScanner({ onScan: handleScan });

  if (!branchId) {
    return <EmptyState title="Selecciona una sucursal para ver el catálogo" />;
  }

  const currency = business?.currency ?? FALLBACK_CURRENCY;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', sm: 'center' }}
        sx={{
          p: 2,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <CatalogSearch value={searchValue} onChange={setSearchValue} />
        </Box>
        <ActiveNowToggle
          role={user?.role}
          hideUnavailable={hideUnavailable}
          onChange={setHideUnavailable}
        />
      </Stack>

      <CategoryTabs value={activeTab} onChange={setActiveTab} />

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <ProductGrid
          status={entry.status}
          items={entry.data}
          error={entry.error}
          currency={currency}
          highlightedId={highlightedId}
          onSelect={handleSelect}
        />
      </Box>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert
            severity={snackbar.severity}
            variant="filled"
            onClose={() => setSnackbar(null)}
            data-testid="pos-snackbar"
          >
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
