import type { Product } from '@kaipos/shared';
import { formatCurrency, hasPermission } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Inbox,
  MenuItem,
  Pencil,
  Plus,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Trash2,
  Tooltip,
} from '@kaipos/ui';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { ApiError, apiJson } from '../lib/api.js';

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Product[] };

interface ListFilters {
  q: string;
  category: string;
  includeInactive: boolean;
}

function mapListError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'No tienes permiso para ver esta información.';
    if (err.status === 401) return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
    return 'No pudimos cargar los productos. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

function buildQueryString(filters: ListFilters): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.includeInactive) params.set('includeInactive', 'true');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function ProductsListPage() {
  const { user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'products:write') : false;
  const canDelete = user ? hasPermission(user.role, 'products:delete') : false;

  const [qInput, setQInput] = useState('');
  const [category, setCategory] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const debouncedQ = useDebouncedValue(qInput, 300);

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [dialog, setDialog] = useState<
    { mode: 'create' } | { mode: 'edit'; product: Product } | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  // Freeze the first successful data set's categories so the Select options
  // don't flicker as the user filters. A new created product may introduce
  // a new category — the pool refreshes next full reload.
  const [categoryPool, setCategoryPool] = useState<string[] | null>(null);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  const refresh = useCallback(() => {
    setReloadKey((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const qs = buildQueryString({ q: debouncedQ, category, includeInactive });
    apiJson<Product[]>(`/api/products${qs}`)
      .then((data) => {
        if (cancelled) return;
        setCategoryPool((prev) => prev ?? Array.from(new Set(data.map((p) => p.category))).sort());
        setState({ status: 'success', data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: mapListError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, category, includeInactive, reloadKey]);

  const categoryOptions = ['', ...(categoryPool ?? [])];

  const handleDelete = useCallback(
    async (product: Product) => {
      const ok = window.confirm(
        `¿Eliminar "${product.name}"? Se marcará como inactivo y podrás recuperarlo con el filtro.`,
      );
      if (!ok) return;
      setDeletingId(product._id);
      setRowError(null);
      try {
        await apiJson(`/api/products/${product._id}`, { method: 'DELETE' });
        refresh();
      } catch (err) {
        setRowError(mapListError(err));
      } finally {
        setDeletingId(null);
      }
    },
    [refresh],
  );

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle="Catálogo del negocio"
        actions={
          canWrite && (
            <Button
              variant="contained"
              startIcon={<Plus size={16} aria-hidden />}
              onClick={() => setDialog({ mode: 'create' })}
            >
              Nuevo producto
            </Button>
          )
        }
      />

      <Toolbar
        qInput={qInput}
        onQChange={setQInput}
        category={category}
        onCategoryChange={setCategory}
        categoryOptions={categoryOptions}
        includeInactive={includeInactive}
        onIncludeInactiveChange={setIncludeInactive}
      />

      {rowError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setRowError(null)}>
          {rowError}
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
          title="Sin productos"
          subtitle={
            debouncedQ || category || includeInactive
              ? 'Ningún producto coincide con los filtros.'
              : 'Crea tu primer producto para empezar.'
          }
          action={
            canWrite &&
            !(debouncedQ || category || includeInactive) && (
              <Button
                variant="contained"
                startIcon={<Plus size={16} aria-hidden />}
                onClick={() => setDialog({ mode: 'create' })}
              >
                Nuevo producto
              </Button>
            )
          }
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <ProductsTable
          products={state.data}
          canWrite={canWrite}
          canDelete={canDelete}
          deletingId={deletingId}
          onEdit={(product) => setDialog({ mode: 'edit', product })}
          onDelete={handleDelete}
        />
      )}

      {dialog && (
        <ProductFormDialog
          open
          mode={dialog.mode}
          initial={dialog.mode === 'edit' ? dialog.product : undefined}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

interface ToolbarProps {
  qInput: string;
  onQChange: (value: string) => void;
  category: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: string[];
  includeInactive: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
}

function Toolbar({
  qInput,
  onQChange,
  category,
  onCategoryChange,
  categoryOptions,
  includeInactive,
  onIncludeInactiveChange,
}: ToolbarProps) {
  return (
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
        value={qInput}
        onChange={(e) => onQChange(e.target.value)}
        sx={{ minWidth: { sm: 260 } }}
      />
      <TextField
        size="small"
        select
        label="Categoría"
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        sx={{ minWidth: { sm: 200 } }}
      >
        {categoryOptions.map((opt) => (
          <MenuItem key={opt || '__all__'} value={opt}>
            {opt || 'Todas'}
          </MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={
          <Switch
            checked={includeInactive}
            onChange={(e) => onIncludeInactiveChange(e.target.checked)}
          />
        }
        label="Incluir inactivos"
      />
    </Stack>
  );
}

function LoadingTable() {
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SKU</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Categoría</TableCell>
            <TableCell align="right">Precio</TableCell>
            <TableCell>Estado</TableCell>
            <TableCell align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton variant="text" width="70%" />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                <Skeleton variant="text" width="50%" />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                <Skeleton variant="text" width="40%" />
              </TableCell>
              <TableCell align="right">
                <Skeleton variant="text" width={60} sx={{ ml: 'auto' }} />
              </TableCell>
              <TableCell>
                <Skeleton variant="rounded" width={70} height={24} />
              </TableCell>
              <TableCell />
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
  deletingId: string | null;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function ProductsTable({
  products,
  canWrite,
  canDelete,
  deletingId,
  onEdit,
  onDelete,
}: ProductsTableProps) {
  const showActions = canWrite || canDelete;
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>SKU</TableCell>
            <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Categoría</TableCell>
            <TableCell align="right">Precio</TableCell>
            <TableCell>Estado</TableCell>
            {showActions && <TableCell align="right">Acciones</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product._id} hover>
              <TableCell sx={{ fontWeight: 550 }}>{product.name}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                {product.sku}
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                {product.category}
              </TableCell>
              <TableCell align="right">{formatCurrency(product.price)}</TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={product.isActive ? 'success' : 'default'}
                  variant={product.isActive ? 'filled' : 'outlined'}
                  label={product.isActive ? 'Activo' : 'Inactivo'}
                />
              </TableCell>
              {showActions && (
                <TableCell align="right">
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canWrite && (
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          aria-label={`Editar ${product.name}`}
                          onClick={() => onEdit(product)}
                        >
                          <Pencil size={16} aria-hidden />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canDelete && product.isActive && (
                      <Tooltip title="Eliminar">
                        <span>
                          <IconButton
                            size="small"
                            aria-label={`Eliminar ${product.name}`}
                            onClick={() => onDelete(product)}
                            disabled={deletingId === product._id}
                          >
                            <Trash2 size={16} aria-hidden />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </Stack>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ---------------------------------------------------------------------------
// ProductFormDialog — co-located; extract to its own file when a second caller
// appears.
// ---------------------------------------------------------------------------

interface ProductFormDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: Product;
  onClose: () => void;
  onSaved: () => void;
}

interface FormValues {
  name: string;
  sku: string;
  category: string;
  price: string;
  stock: string;
  description: string;
  imageUrl: string;
}

type FieldErrors = Partial<Record<keyof FormValues, string>>;

function initialFormValues(initial?: Product): FormValues {
  return {
    name: initial?.name ?? '',
    sku: initial?.sku ?? '',
    category: initial?.category ?? '',
    price: initial ? String(initial.price) : '',
    stock: initial ? String(initial.stock) : '',
    description: initial?.description ?? '',
    imageUrl: initial?.imageUrl ?? '',
  };
}

function validateForm(values: FormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (!values.sku.trim()) errors.sku = 'El SKU es obligatorio.';
  if (!values.category.trim()) errors.category = 'La categoría es obligatoria.';

  const priceNum = Number(values.price);
  if (values.price === '' || Number.isNaN(priceNum)) {
    errors.price = 'Ingresa un precio válido.';
  } else if (priceNum < 0) {
    errors.price = 'El precio no puede ser negativo.';
  }

  const stockNum = Number(values.stock);
  if (values.stock === '' || Number.isNaN(stockNum)) {
    errors.stock = 'Ingresa un stock válido.';
  } else if (!Number.isInteger(stockNum) || stockNum < 0) {
    errors.stock = 'El stock debe ser un entero no negativo.';
  }

  if (values.imageUrl.trim()) {
    try {
      new URL(values.imageUrl.trim());
    } catch {
      errors.imageUrl = 'Ingresa una URL válida.';
    }
  }

  return errors;
}

const FIELD_ALIASES: Record<string, keyof FormValues> = {
  name: 'name',
  sku: 'sku',
  category: 'category',
  price: 'price',
  stock: 'stock',
  description: 'description',
  imageUrl: 'imageUrl',
};

function mapApiErrorToFields(err: ApiError): { fieldErrors: FieldErrors; formError?: string } {
  if (err.status === 409 && err.code === 'DUPLICATE_SKU') {
    return { fieldErrors: { sku: 'Ya existe un producto con ese SKU.' } };
  }
  if (err.status === 400 && err.details?.length) {
    const fieldErrors: FieldErrors = {};
    for (const detail of err.details) {
      const key = FIELD_ALIASES[detail.field];
      if (key && !fieldErrors[key]) fieldErrors[key] = detail.message;
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
    return { fieldErrors: {}, formError: err.message };
  }
  if (err.status === 403) {
    return { fieldErrors: {}, formError: 'No tienes permiso para esta acción.' };
  }
  if (err.status === 401) {
    return {
      fieldErrors: {},
      formError: 'Tu sesión ha expirado. Vuelve a iniciar sesión.',
    };
  }
  return { fieldErrors: {}, formError: err.message || 'No pudimos guardar el producto.' };
}

function ProductFormDialog({ open, mode, initial, onClose, onSaved }: ProductFormDialogProps) {
  const [values, setValues] = useState<FormValues>(() => initialFormValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const setField = useCallback(<K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const clientErrors = validateForm(values);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const payload: Record<string, unknown> = {
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category.trim(),
      price: Number(values.price),
      stock: Number(values.stock),
      description: values.description,
    };
    if (values.imageUrl.trim()) payload.imageUrl = values.imageUrl.trim();

    try {
      if (mode === 'create') {
        await apiJson<Product>('/api/products', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else if (initial) {
        // On edit, only send changed fields to keep `updatedAt` honest and
        // avoid tripping the backend's SKU pre-check unnecessarily.
        const patch: Record<string, unknown> = {};
        if (payload.name !== initial.name) patch.name = payload.name;
        if (payload.sku !== initial.sku) patch.sku = payload.sku;
        if (payload.category !== initial.category) patch.category = payload.category;
        if (payload.price !== initial.price) patch.price = payload.price;
        if (payload.stock !== initial.stock) patch.stock = payload.stock;
        if (payload.description !== initial.description) patch.description = payload.description;
        const newImageUrl = values.imageUrl.trim();
        if (newImageUrl !== (initial.imageUrl ?? '')) {
          if (newImageUrl) patch.imageUrl = newImageUrl;
        }
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await apiJson<Product>(`/api/products/${initial._id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(patch),
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError) {
        const { fieldErrors, formError: topError } = mapApiErrorToFields(err);
        setErrors(fieldErrors);
        setFormError(topError ?? null);
      } else if (err instanceof TypeError) {
        setFormError('No pudimos conectar. Revisa tu conexión e inténtalo otra vez.');
      } else {
        setFormError('Algo salió mal. Inténtalo de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle>{mode === 'create' ? 'Nuevo producto' : 'Editar producto'}</DialogTitle>
        <DialogContent dividers>
          {formError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {formError}
            </Alert>
          )}
          <Stack spacing={2}>
            <TextField
              label="Nombre"
              value={values.name}
              onChange={(e) => setField('name', e.target.value)}
              error={Boolean(errors.name)}
              helperText={errors.name}
              required
              fullWidth
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="SKU"
                value={values.sku}
                onChange={(e) => setField('sku', e.target.value)}
                error={Boolean(errors.sku)}
                helperText={errors.sku}
                required
                fullWidth
              />
              <TextField
                label="Categoría"
                value={values.category}
                onChange={(e) => setField('category', e.target.value)}
                error={Boolean(errors.category)}
                helperText={errors.category}
                required
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Precio"
                type="number"
                value={values.price}
                onChange={(e) => setField('price', e.target.value)}
                error={Boolean(errors.price)}
                helperText={errors.price}
                required
                fullWidth
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              />
              <TextField
                label="Stock"
                type="number"
                value={values.stock}
                onChange={(e) => setField('stock', e.target.value)}
                error={Boolean(errors.stock)}
                helperText={errors.stock}
                required
                fullWidth
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
              />
            </Stack>
            <TextField
              label="Descripción"
              value={values.description}
              onChange={(e) => setField('description', e.target.value)}
              error={Boolean(errors.description)}
              helperText={errors.description}
              multiline
              minRows={2}
              fullWidth
            />
            <TextField
              label="URL de imagen"
              type="url"
              value={values.imageUrl}
              onChange={(e) => setField('imageUrl', e.target.value)}
              error={Boolean(errors.imageUrl)}
              helperText={errors.imageUrl ?? 'Opcional'}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Guardando…' : mode === 'create' ? 'Crear' : 'Guardar'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
