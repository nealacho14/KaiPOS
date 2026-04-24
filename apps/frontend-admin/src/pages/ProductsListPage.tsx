import type { Product } from '@kaipos/shared';
import { formatCurrency, hasPermission } from '@kaipos/shared';
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
  FormControl,
  FormControlLabel,
  IconButton,
  ImageIcon,
  Inbox,
  InputLabel,
  MenuItem,
  Plus,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Trash2,
} from '@kaipos/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { useActiveBranch } from '../hooks/useActiveBranch.js';
import { useBranches } from '../hooks/useBranches.js';
import { ApiError } from '../lib/api.js';
import { deleteProduct, listProducts } from '../lib/products-api.js';

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Product[] };

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
  const { branchId, branchIds } = useActiveBranch({ syncToSearchParam: true });
  const { branches } = useBranches();

  const branchName = useMemo(() => {
    if (!branchId) return null;
    const match = branches.find((b) => b._id === branchId);
    return match?.name ?? null;
  }, [branches, branchId]);

  const canWrite = user ? hasPermission(user.role, 'products:write') : false;
  const canDelete = user ? hasPermission(user.role, 'products:delete') : false;

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 300);
  const [category, setCategory] = useState<string>('');
  const [includeInactive, setIncludeInactive] = useState(false);

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    listProducts({
      branchId,
      q: debouncedQuery.trim() || undefined,
      category: category || undefined,
      includeInactive: includeInactive || undefined,
    })
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: mapError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, debouncedQuery, category, includeInactive, reloadKey]);

  const categoryOptions = useMemo(() => {
    if (state.status !== 'success') return [];
    const set = new Set(state.data.map((p) => p.category));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [state]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProduct(pendingDelete._id);
      setPendingDelete(null);
      // If we are currently showing active-only, drop the row locally; otherwise
      // refetch so the server's soft-delete state (isActive=false) is authoritative.
      if (!includeInactive && state.status === 'success') {
        setState({
          status: 'success',
          data: state.data.filter((p) => p._id !== pendingDelete._id),
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
    <Stack direction="row" spacing={2} alignItems="center">
      {branchId && (
        <Chip size="small" label={`Sucursal: ${branchName ?? '—'}`} variant="outlined" />
      )}
      {canWrite && (
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
            sx={{ mb: 3 }}
          >
            <TextField
              size="small"
              label="Buscar"
              placeholder="Nombre o SKU"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ minWidth: 240 }}
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
                  />
                }
                label="Incluir inactivos"
              />
            )}
          </Stack>

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
            <ProductsTable
              products={state.data}
              canWrite={canWrite}
              canDelete={canDelete}
              onEdit={(id) => navigate(`/products/${id}/edit`)}
              onDelete={(product) => {
                setDeleteError(null);
                setPendingDelete(product);
              }}
            />
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
  onEdit: (id: string) => void;
  onDelete: (product: Product) => void;
}

function ProductsTable({ products, canWrite, canDelete, onEdit, onDelete }: ProductsTableProps) {
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
            <TableCell align="right" sx={{ width: 120 }}>
              Acciones
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product._id} hover>
              <TableCell>
                <ProductThumb imageUrl={product.imageUrl} alt={product.name} />
              </TableCell>
              <TableCell sx={{ fontWeight: 550 }}>{product.name}</TableCell>
              <TableCell
                sx={{
                  display: { xs: 'none', sm: 'table-cell' },
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                  color: 'text.secondary',
                }}
              >
                {product.sku}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <Chip size="small" label={product.category} />
              </TableCell>
              <TableCell
                align="right"
                sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
              >
                {formatCurrency(product.price)}
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={product.isActive ? 'success' : 'default'}
                  variant={product.isActive ? 'filled' : 'outlined'}
                  label={product.isActive ? 'Activo' : 'Inactivo'}
                />
              </TableCell>
              <TableCell align="right">
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
          ))}
        </TableBody>
      </Table>
    </TableContainer>
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
        sx={{
          width: 40,
          height: 40,
          borderRadius: 1,
          objectFit: 'cover',
          border: '1px solid',
          borderColor: 'divider',
          display: 'block',
        }}
      />
    );
  }
  return (
    <Box
      aria-hidden
      sx={{
        width: 40,
        height: 40,
        borderRadius: 1,
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'action.hover',
        color: 'text.disabled',
      }}
    >
      <ImageIcon size={18} aria-hidden />
    </Box>
  );
}
