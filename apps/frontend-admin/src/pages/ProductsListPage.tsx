import type { Product, WSChannel } from '@kaipos/shared';
import { channelFor, formatCurrency, hasPermission } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Edit,
  EmptyState,
  FormControl,
  FormControlLabel,
  GripVertical,
  IconButton,
  ImageIcon,
  Inbox,
  InputLabel,
  MenuItem,
  Plus,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Star,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Trash2,
} from '@kaipos/ui';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ApiError,
  type Pagination,
  useActiveBranch,
  useAuth,
  useWebSocketActions,
  useWebSocketState,
} from '@kaipos/app-runtime';
import { PageHeader, PaginationFooter } from '../components/index.js';
import {
  deleteProduct,
  listProducts,
  reorderProducts,
  setProductFeatured,
  toProductsApiError,
} from '../lib/products-api.js';

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Product[]; pagination: Pagination };

function mapError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'No tienes permiso para ver productos de esta sucursal.';
    if (err.status === 401) return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
    return 'No pudimos cargar los productos. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

export function ProductsListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { branchId, branchIds } = useActiveBranch();

  const canWrite = user ? hasPermission(user.role, 'products:write') : false;
  const canDelete = user ? hasPermission(user.role, 'products:delete') : false;

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [category, setCategory] = useState<string>('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [onlyFeatured, setOnlyFeatured] = useState(false);
  const [onlyActiveNow, setOnlyActiveNow] = useState(false);

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lowStockToast, setLowStockToast] = useState<string | null>(null);

  // Reorder mode. When active, the row click → edit interaction is replaced
  // with drag handles. Filters that change result-set membership (search,
  // includeInactive, featured) are locked while reordering — but the category
  // filter stays available because reordering is typically scoped per-category.
  const [reorderMode, setReorderMode] = useState(false);
  const [reorderDraft, setReorderDraft] = useState<Product[] | null>(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [reorderToast, setReorderToast] = useState<{
    severity: 'success' | 'error';
    message: string;
  } | null>(null);

  // Set of product IDs locally known to be featured for the active branch.
  // Toggled via the per-row star button; persisted via setProductFeatured.
  // We treat the local set as optimistic — revert on error.
  // Initial load: empty (no batched "is featured?" lookup exists yet). The
  // user can switch on the "Sólo destacados" filter to scope the fetch to
  // already-featured rows, which then seeds the set.
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [featuredPending, setFeaturedPending] = useState<Set<string>>(new Set());

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  // Live updates: subscribe to the active branch channel and refetch on any
  // product event from peers (or this same client). We refetch rather than
  // patch local state because the WS payload only carries identifiers — the
  // canonical product shape stays one source of truth (the API).
  //
  // `wsActions` is identity-stable by contract (see WebSocketContext), so it
  // is safe in the dependency arrays — only a channel change or a connection
  // status transition re-fires the subscribe effect.
  const wsActions = useWebSocketActions();
  const { status: wsStatus } = useWebSocketState();
  const branchChannel: WSChannel | null = useMemo(() => {
    if (!user || !branchId) return null;
    if (user.businessId === '*') return null;
    return channelFor.branch(user.businessId, branchId);
  }, [user, branchId]);

  useEffect(() => {
    if (!branchChannel) return;
    if (wsStatus !== 'open') return;
    wsActions.subscribe(branchChannel);
    return () => {
      wsActions.unsubscribe(branchChannel);
    };
  }, [branchChannel, wsStatus, wsActions]);

  useEffect(() => {
    return wsActions.onMessage((message) => {
      if (!message.channel || message.channel !== branchChannel) return;
      if (
        message.type === 'product.created' ||
        message.type === 'product.updated' ||
        message.type === 'product.deleted' ||
        message.type === 'product.reordered'
      ) {
        // While the user is mid-reorder, skip the refetch — otherwise we'd
        // discard the in-progress draft. The save handler will refetch after
        // a successful flush.
        if (!reorderMode) setReloadKey((n) => n + 1);
      } else if (message.type === 'product.featured') {
        // `product.featured` is decoupled from `product.updated` so we can
        // patch the local featured Set without a full refetch — only the
        // per-branch preference changed, not the product doc. We still
        // refetch when the user is filtering by `onlyFeatured`, because a
        // row may now enter or leave the visible list.
        const payload = message.payload as { productId?: string; featured?: boolean } | undefined;
        if (payload?.productId && typeof payload.featured === 'boolean') {
          setFeaturedIds((prev) => {
            const next = new Set(prev);
            if (payload.featured) next.add(payload.productId!);
            else next.delete(payload.productId!);
            return next;
          });
        }
        if (onlyFeatured && !reorderMode) setReloadKey((n) => n + 1);
      } else if (message.type === 'product.low-stock') {
        const payload = message.payload as { name?: string } | undefined;
        const name = payload?.name ?? 'Un producto';
        setLowStockToast(`${name} está bajo de stock`);
      }
    });
  }, [branchChannel, reorderMode, onlyFeatured, wsActions]);

  // Reset to first page whenever the filter/sucursal changes — otherwise the
  // request asks for `page=3` of a result set that may now have one page.
  useEffect(() => {
    setPage(0);
  }, [branchId, debouncedQuery, category, includeInactive, onlyFeatured, onlyActiveNow]);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    listProducts({
      branchId,
      q: debouncedQuery.trim() || undefined,
      category: category || undefined,
      includeInactive: includeInactive || undefined,
      activeNow: onlyActiveNow || undefined,
      featuredIn: onlyFeatured ? branchId : undefined,
      page: page + 1,
      limit,
    })
      .then(({ data, pagination }) => {
        if (cancelled) return;
        setState({ status: 'success', data, pagination });
        // Seed the local featured set when the request was scoped to featured
        // products — anything that came back is featured by definition.
        if (onlyFeatured) {
          setFeaturedIds((prev) => {
            const next = new Set(prev);
            for (const p of data) next.add(p._id);
            return next;
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: mapError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [
    branchId,
    debouncedQuery,
    category,
    includeInactive,
    onlyFeatured,
    onlyActiveNow,
    reloadKey,
    page,
    limit,
  ]);

  const categoryOptions = useMemo(() => {
    if (state.status !== 'success') return [];
    const set = new Set(state.data.map((p) => p.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [state]);

  const startReorder = useCallback(() => {
    if (state.status !== 'success') return;
    setReorderDraft([...state.data]);
    setReorderMode(true);
  }, [state]);

  const cancelReorder = useCallback(() => {
    setReorderDraft(null);
    setReorderMode(false);
  }, []);

  const saveReorder = useCallback(async () => {
    if (!branchId || !reorderDraft) return;
    setReorderSaving(true);
    try {
      // Persist the new top-to-bottom order using the index as `sortOrder`.
      // The backend bulkWrite enforces matchedCount === items.length and
      // returns a 400 with the missing IDs if any row went stale (e.g. a peer
      // deleted a product mid-reorder). We surface that as a snackbar so the
      // user knows to refetch and try again.
      const items = reorderDraft.map((p, idx) => ({ id: p._id, sortOrder: idx }));
      await reorderProducts(branchId, items);
      setReorderToast({ severity: 'success', message: 'Orden actualizado.' });
      setReorderDraft(null);
      setReorderMode(false);
      retry();
    } catch (err) {
      const mapped = toProductsApiError(err);
      const message =
        mapped.code === 'REORDER_PRODUCT_NOT_FOUND'
          ? 'Algunos productos cambiaron mientras reordenabas. Refresca y vuelve a intentar.'
          : mapped.status === 403
            ? 'No tienes permiso para reordenar productos en esta sucursal.'
            : mapped.message || 'No pudimos guardar el orden.';
      setReorderToast({ severity: 'error', message });
    } finally {
      setReorderSaving(false);
    }
  }, [branchId, reorderDraft, retry]);

  const handleDraftReorder = useCallback((fromId: string, toId: string) => {
    setReorderDraft((draft) => {
      if (!draft) return draft;
      const fromIdx = draft.findIndex((p) => p._id === fromId);
      const toIdx = draft.findIndex((p) => p._id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return draft;
      return arrayMove(draft, fromIdx, toIdx);
    });
  }, []);

  const handleToggleFeatured = useCallback(
    async (product: Product) => {
      if (!branchId) return;
      const wasFeatured = featuredIds.has(product._id);
      const next = !wasFeatured;
      setFeaturedIds((prev) => {
        const cp = new Set(prev);
        if (next) cp.add(product._id);
        else cp.delete(product._id);
        return cp;
      });
      setFeaturedPending((prev) => {
        const cp = new Set(prev);
        cp.add(product._id);
        return cp;
      });
      try {
        await setProductFeatured(product._id, { branchId, featured: next });
      } catch (err) {
        // Revert and surface
        setFeaturedIds((prev) => {
          const cp = new Set(prev);
          if (wasFeatured) cp.add(product._id);
          else cp.delete(product._id);
          return cp;
        });
        const mapped = toProductsApiError(err);
        setReorderToast({
          severity: 'error',
          message:
            mapped.status === 403
              ? 'No tienes permiso para destacar productos en esta sucursal.'
              : mapped.message || 'No pudimos actualizar el destacado.',
        });
      } finally {
        setFeaturedPending((prev) => {
          const cp = new Set(prev);
          cp.delete(product._id);
          return cp;
        });
      }
    },
    [branchId, featuredIds],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(pendingDelete._id);
      setPendingDelete(null);
      // If we are currently showing active-only, drop the row locally; otherwise
      // refetch so the server's soft-delete state (isActive=false) is authoritative.
      // If the delete leaves the current page empty there may still be more
      // rows on earlier pages — refetch to avoid showing a blank table. Same
      // for the includeInactive path which always refetches anyway.
      const remaining =
        state.status === 'success' ? state.data.filter((p) => p._id !== pendingDelete._id) : [];
      if (!includeInactive && state.status === 'success' && remaining.length > 0) {
        setState({
          status: 'success',
          data: remaining,
          pagination: {
            ...state.pagination,
            total: Math.max(0, state.pagination.total - 1),
          },
        });
      } else {
        retry();
      }
    } catch (err) {
      setDeleteError(mapError(err));
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, includeInactive, state, retry]);

  const actions = (
    // Up to three controls live here; without wrapping they push past the
    // viewport on a phone.
    <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
      {canWrite && !reorderMode && state.status === 'success' && state.data.length > 1 && (
        <Button variant="outlined" onClick={startReorder} disabled={reorderSaving}>
          Reordenar
        </Button>
      )}
      {reorderMode && (
        <>
          <Button onClick={cancelReorder} disabled={reorderSaving}>
            Cancelar
          </Button>
          <Button variant="contained" onClick={saveReorder} disabled={reorderSaving}>
            {reorderSaving ? 'Guardando…' : 'Guardar orden'}
          </Button>
        </>
      )}
      {canWrite && !reorderMode && (
        <Button
          variant="contained"
          startIcon={<Plus size={16} aria-hidden />}
          onClick={() => {
            const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
            navigate(`/products/new${qs}`);
          }}
        >
          Nuevo producto
        </Button>
      )}
    </Stack>
  );

  if (branchIds.length === 0) {
    return (
      <>
        <PageHeader title="Productos" subtitle="Catálogo de la sucursal" />
        <Alert severity="info">
          No tienes sucursales asignadas. Pide a un administrador que te agregue a una sucursal.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Productos" subtitle="Catálogo de la sucursal" actions={actions} />

      {!branchId ? (
        <Alert severity="info">Selecciona una sucursal para ver sus productos.</Alert>
      ) : (
        <>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            sx={{ mb: 3, flexWrap: 'wrap', gap: 2 }}
          >
            <TextField
              size="small"
              label="Buscar"
              placeholder="Nombre, SKU o código de barras"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ minWidth: 240 }}
              disabled={reorderMode}
            />
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="category-filter-label">Categoría</InputLabel>
              <Select
                labelId="category-filter-label"
                label="Categoría"
                value={category}
                onChange={(e) =>
                  setCategory(typeof e.target.value === 'string' ? e.target.value : '')
                }
              >
                <MenuItem value="">Todas</MenuItem>
                {categoryOptions.map((c) => (
                  <MenuItem key={c} value={c}>
                    {c}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {canWrite && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={includeInactive}
                    onChange={(e) => setIncludeInactive(e.target.checked)}
                    disabled={reorderMode}
                  />
                }
                label="Incluir inactivos"
              />
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={onlyFeatured}
                  onChange={(e) => setOnlyFeatured(e.target.checked)}
                  disabled={reorderMode}
                />
              }
              label="Sólo destacados"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={onlyActiveNow}
                  onChange={(e) => setOnlyActiveNow(e.target.checked)}
                  disabled={reorderMode}
                />
              }
              label="Sólo disponibles ahora"
            />
          </Stack>
          {onlyActiveNow && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Mostrando solo los productos disponibles ahora según la zona horaria de la sucursal.
            </Alert>
          )}
          {reorderMode && (
            <Alert severity="info" sx={{ mb: 2 }}>
              Arrastra para reordenar dentro de la sucursal. Los filtros están deshabilitados
              mientras reordenas, excepto la categoría.
            </Alert>
          )}

          {state.status === 'loading' && <LoadingTable />}

          {state.status === 'error' && (
            <Stack spacing={2} alignItems="flex-start">
              <Alert severity="error" sx={{ width: '100%' }}>
                {state.message}
              </Alert>
              <Button variant="outlined" onClick={retry}>
                Reintentar
              </Button>
            </Stack>
          )}

          {state.status === 'success' && state.data.length === 0 && (
            <EmptyState
              icon={<Inbox size={28} aria-hidden />}
              title="No hay productos que coincidan"
              subtitle={
                query || category || !includeInactive
                  ? 'Ajusta los filtros o crea un producto nuevo.'
                  : 'Crea el primer producto de esta sucursal.'
              }
              action={
                canWrite ? (
                  <Button
                    variant="contained"
                    startIcon={<Plus size={16} aria-hidden />}
                    onClick={() => {
                      const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
                      navigate(`/products/new${qs}`);
                    }}
                  >
                    Nuevo producto
                  </Button>
                ) : undefined
              }
            />
          )}

          {state.status === 'success' && state.data.length > 0 && (
            <>
              {reorderMode && reorderDraft ? (
                <ReorderableProductsTable products={reorderDraft} onReorder={handleDraftReorder} />
              ) : (
                <ProductsTable
                  products={state.data}
                  canWrite={canWrite}
                  canDelete={canDelete}
                  featuredIds={featuredIds}
                  featuredPending={featuredPending}
                  onEdit={(id) => navigate(`/products/${id}/edit`)}
                  onToggleFeatured={canWrite ? handleToggleFeatured : undefined}
                  onDelete={(product) => {
                    setDeleteError(null);
                    setPendingDelete(product);
                  }}
                />
              )}
              {!reorderMode && (
                <PaginationFooter
                  count={state.pagination.total}
                  page={page}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={(next) => {
                    setLimit(next);
                    setPage(0);
                  }}
                />
              )}
            </>
          )}
        </>
      )}

      <Dialog
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        aria-labelledby="delete-product-title"
      >
        <DialogTitle id="delete-product-title">Desactivar producto</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingDelete
              ? `El producto "${pendingDelete.name}" se marcará como inactivo y dejará de aparecer en el catálogo. Puedes restaurarlo usando "Incluir inactivos".`
              : ''}
          </DialogContentText>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingDelete(null)} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleConfirmDelete}
            disabled={deleting}
          >
            {deleting ? 'Desactivando…' : 'Desactivar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={lowStockToast !== null}
        autoHideDuration={6000}
        onClose={() => setLowStockToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="warning" variant="filled" onClose={() => setLowStockToast(null)}>
          {lowStockToast}
        </Alert>
      </Snackbar>

      <Snackbar
        open={reorderToast !== null}
        autoHideDuration={5000}
        onClose={() => setReorderToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={reorderToast?.severity ?? 'success'}
          variant="filled"
          onClose={() => setReorderToast(null)}
        >
          {reorderToast?.message}
        </Alert>
      </Snackbar>
    </>
  );
}

function LoadingTable() {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 64 }}>Imagen</TableCell>
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SKU</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Categoría</TableCell>
            <TableCell align="right">Precio</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="center" sx={{ width: 64 }}>
              Destacado
            </TableCell>
            <TableCell align="right" sx={{ width: 120 }}>
              Acciones
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton variant="rounded" width={40} height={40} />
              </TableCell>
              <TableCell>
                <Skeleton variant="text" width="70%" />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                <Skeleton variant="text" width="60%" />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <Skeleton variant="rounded" width={72} height={24} />
              </TableCell>
              <TableCell align="right">
                <Skeleton variant="text" width={60} sx={{ ml: 'auto' }} />
              </TableCell>
              <TableCell>
                <Skeleton variant="rounded" width={64} height={24} />
              </TableCell>
              <TableCell align="center">
                <Skeleton variant="circular" width={24} height={24} sx={{ mx: 'auto' }} />
              </TableCell>
              <TableCell align="right">
                <Skeleton variant="rounded" width={80} height={28} sx={{ ml: 'auto' }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

interface ProductsTableProps {
  products: Product[];
  canWrite: boolean;
  canDelete: boolean;
  featuredIds: Set<string>;
  featuredPending: Set<string>;
  onEdit: (id: string) => void;
  onDelete: (product: Product) => void;
  onToggleFeatured?: (product: Product) => void;
}

function ProductsTable({
  products,
  canWrite,
  canDelete,
  featuredIds,
  featuredPending,
  onEdit,
  onDelete,
  onToggleFeatured,
}: ProductsTableProps) {
  const { business } = useAuth();
  const currency = business?.currency ?? 'MXN';
  // On xs the row is the click target; the explicit Acciones column is hidden
  // because it doesn't fit alongside name + price + status chip at 375 px.
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 64, display: { xs: 'none', sm: 'table-cell' } }}>
              Imagen
            </TableCell>
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SKU</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Categoría</TableCell>
            <TableCell align="right">Precio</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="center" sx={{ width: 64 }}>
              Destacado
            </TableCell>
            <TableCell align="right" sx={{ width: 120, display: { xs: 'none', sm: 'table-cell' } }}>
              Acciones
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => {
            const isFeatured = featuredIds.has(product._id);
            const pending = featuredPending.has(product._id);
            return (
              <TableRow
                key={product._id}
                hover
                onClick={canWrite ? () => onEdit(product._id) : undefined}
                sx={canWrite ? { cursor: 'pointer' } : undefined}
              >
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                  <ProductThumb imageUrl={product.imageUrl} alt={product.name} />
                </TableCell>
                <TableCell sx={(theme) => ({ ...theme.typography.subtitle2 })}>
                  {product.name}
                </TableCell>
                <TableCell
                  sx={(theme) => ({
                    display: { xs: 'none', sm: 'table-cell' },
                    ...theme.typography.mono,
                    fontSize: theme.typography.body2.fontSize,
                    color: 'text.secondary',
                  })}
                >
                  {product.sku}
                </TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                  <Chip size="small" label={product.category} />
                </TableCell>
                <TableCell align="right" sx={(theme) => ({ ...theme.typography.mono })}>
                  {formatCurrency(product.price, currency)}
                </TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    color={product.isActive ? 'success' : 'default'}
                    variant={product.isActive ? 'filled' : 'outlined'}
                    label={product.isActive ? 'Activo' : 'Inactivo'}
                  />
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                  {onToggleFeatured ? (
                    <Tooltip
                      title={
                        isFeatured
                          ? 'Quitar destacado en esta sucursal'
                          : 'Destacar en esta sucursal'
                      }
                    >
                      <span>
                        <IconButton
                          size="small"
                          aria-label={
                            isFeatured
                              ? `Quitar destacado: ${product.name}`
                              : `Destacar: ${product.name}`
                          }
                          aria-pressed={isFeatured}
                          color={isFeatured ? 'warning' : 'default'}
                          disabled={pending}
                          onClick={() => onToggleFeatured(product)}
                        >
                          <Star size={16} aria-hidden fill={isFeatured ? 'currentColor' : 'none'} />
                        </IconButton>
                      </span>
                    </Tooltip>
                  ) : (
                    <Star
                      size={16}
                      aria-hidden
                      fill={isFeatured ? 'currentColor' : 'none'}
                      style={{ color: isFeatured ? undefined : 'transparent' }}
                    />
                  )}
                </TableCell>
                <TableCell
                  align="right"
                  onClick={(e) => e.stopPropagation()}
                  sx={{ display: { xs: 'none', sm: 'table-cell' } }}
                >
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canWrite && (
                      <IconButton
                        size="small"
                        aria-label={`Editar ${product.name}`}
                        onClick={() => onEdit(product._id)}
                      >
                        <Edit size={16} aria-hidden />
                      </IconButton>
                    )}
                    {canDelete && product.isActive && (
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Desactivar ${product.name}`}
                        onClick={() => onDelete(product)}
                      >
                        <Trash2 size={16} aria-hidden />
                      </IconButton>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

interface ReorderableProductsTableProps {
  products: Product[];
  onReorder: (fromId: string, toId: string) => void;
}

function ReorderableProductsTable({ products, onReorder }: ReorderableProductsTableProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={products.map((p) => p._id)} strategy={verticalListSortingStrategy}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48 }}>Orden</TableCell>
                <TableCell sx={{ width: 64, display: { xs: 'none', sm: 'table-cell' } }}>
                  Imagen
                </TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SKU</TableCell>
                <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Categoría</TableCell>
                <TableCell align="right">Precio</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {products.map((product, index) => (
                <SortableProductRow key={product._id} product={product} index={index} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </SortableContext>
    </DndContext>
  );
}

function SortableProductRow({ product, index }: { product: Product; index: number }) {
  const { business } = useAuth();
  const currency = business?.currency ?? 'MXN';
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: product._id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} hover>
      <TableCell sx={{ width: 48 }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <IconButton
            size="small"
            aria-label={`Reordenar ${product.name}`}
            {...attributes}
            {...listeners}
            sx={{ cursor: 'grab', touchAction: 'none', color: 'text.disabled' }}
          >
            <GripVertical size={16} aria-hidden />
          </IconButton>
          <Box
            component="span"
            sx={(theme) => ({
              ...theme.typography.mono,
              color: 'text.disabled',
              fontSize: theme.typography.caption.fontSize,
            })}
          >
            {index + 1}
          </Box>
        </Stack>
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
        <ProductThumb imageUrl={product.imageUrl} alt={product.name} />
      </TableCell>
      <TableCell sx={(theme) => ({ ...theme.typography.subtitle2 })}>{product.name}</TableCell>
      <TableCell
        sx={(theme) => ({
          display: { xs: 'none', sm: 'table-cell' },
          ...theme.typography.mono,
          fontSize: theme.typography.body2.fontSize,
          color: 'text.secondary',
        })}
      >
        {product.sku}
      </TableCell>
      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
        <Chip size="small" label={product.category} />
      </TableCell>
      <TableCell align="right" sx={(theme) => ({ ...theme.typography.mono })}>
        {formatCurrency(product.price, currency)}
      </TableCell>
    </TableRow>
  );
}

function ProductThumb({ imageUrl, alt }: { imageUrl?: string; alt: string }) {
  if (imageUrl) {
    return (
      <Box
        component="img"
        src={imageUrl}
        alt={alt}
        loading="lazy"
        sx={(theme) => ({
          width: 40,
          height: 40,
          borderRadius: `${theme.radii.sm}px`,
          objectFit: 'cover',
          border: '1px solid',
          borderColor: 'divider',
          display: 'block',
        })}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={(theme) => ({
        width: 40,
        height: 40,
        borderRadius: `${theme.radii.sm}px`,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'action.hover',
        color: 'text.disabled',
      })}
    >
      <ImageIcon size={18} aria-hidden />
    </Box>
  );
}
