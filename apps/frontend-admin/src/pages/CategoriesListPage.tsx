import type { Category } from '@kaipos/shared';
import { hasPermission } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  EmptyState,
  Inbox,
  Plus,
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
import { useCallback, useEffect, useId, useState } from 'react';
import { type Pagination, useAuth } from '@kaipos/app-runtime';
import { PageHeader, PaginationFooter } from '../components/index.js';
import {
  createCategory,
  deactivateCategory,
  listCategories,
  toCategoriesApiError,
  type CreateCategoryPayload,
} from '../lib/categories-api.js';

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Category[]; pagination: Pagination };

function mapError(err: unknown): string {
  const mapped = toCategoriesApiError(err);
  if (mapped.status === 403) return 'No tienes permiso para administrar categorías.';
  if (mapped.status === 401) return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
  return 'No pudimos cargar las categorías. Inténtalo de nuevo.';
}

export function CategoriesListPage() {
  const { user } = useAuth();
  const canWrite = user ? hasPermission(user.role, 'categories:write') : false;
  const canDelete = user ? hasPermission(user.role, 'categories:delete') : false;

  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const nameId = useId();

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listCategories({ includeInactive: true, page: page + 1, limit })
      .then(({ data, pagination }) => {
        if (!cancelled) setState({ status: 'success', data, pagination });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: mapError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey, page, limit]);

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) return;
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const payload: CreateCategoryPayload = { name: createName.trim() };
      await createCategory(payload);
      setCreateName('');
      setCreating(false);
      // If we're already on page 0, just retry — otherwise setPage(0)
      // triggers the refetch on its own (don't double-fetch).
      if (page !== 0) {
        setPage(0);
      } else {
        retry();
      }
    } catch (err) {
      const mapped = toCategoriesApiError(err);
      if (mapped.code === 'DUPLICATE_CATEGORY_NAME') {
        setCreateError('Ya existe una categoría con este nombre.');
      } else {
        setCreateError('No pudimos crear la categoría. Inténtalo de nuevo.');
      }
    } finally {
      setCreateSubmitting(false);
    }
  }, [createName, retry, page]);

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deactivateCategory(id);
        retry();
      } catch {
        // Best-effort UI; surfacing per-row errors would expand scope.
      } finally {
        setDeletingId(null);
      }
    },
    [retry],
  );

  return (
    <>
      <PageHeader
        title="Categorías"
        subtitle="Organiza tu catálogo en grupos"
        actions={
          canWrite ? (
            <Button
              variant="contained"
              startIcon={<Plus size={16} aria-hidden />}
              onClick={() => setCreating(true)}
            >
              Nueva categoría
            </Button>
          ) : undefined
        }
      />

      {state.status === 'loading' && (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nombre</TableCell>
                <TableCell>Estado</TableCell>
                {canDelete && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton variant="text" width="40%" />
                  </TableCell>
                  <TableCell>
                    <Skeleton variant="rounded" width={70} height={24} />
                  </TableCell>
                  {canDelete && (
                    <TableCell align="right">
                      <Skeleton variant="rounded" width={80} height={28} sx={{ ml: 'auto' }} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {state.status === 'error' && (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">{state.message}</Alert>
          <Button variant="outlined" onClick={retry}>
            Reintentar
          </Button>
        </Stack>
      )}

      {state.status === 'success' && state.data.length === 0 && (
        <EmptyState
          icon={<Inbox size={28} aria-hidden />}
          title="Aún no tienes categorías"
          subtitle="Las categorías agrupan productos en el menú y los reportes."
          action={
            canWrite ? (
              <Button
                variant="contained"
                startIcon={<Plus size={16} aria-hidden />}
                onClick={() => setCreating(true)}
              >
                Crear primera categoría
              </Button>
            ) : undefined
          }
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Estado</TableCell>
                  {canDelete && <TableCell align="right">Acciones</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {state.data.map((cat) => (
                  <TableRow key={cat._id} hover>
                    <TableCell sx={(theme) => ({ ...theme.typography.subtitle2 })}>
                      {cat.name}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={cat.isActive ? 'success' : 'default'}
                        variant={cat.isActive ? 'filled' : 'outlined'}
                        label={cat.isActive ? 'Activa' : 'Inactiva'}
                      />
                    </TableCell>
                    {canDelete && (
                      <TableCell align="right">
                        <Button
                          size="small"
                          color="error"
                          variant="text"
                          startIcon={<Trash2 size={14} aria-hidden />}
                          onClick={() => handleDelete(cat._id)}
                          disabled={!cat.isActive || deletingId === cat._id}
                        >
                          {deletingId === cat._id ? 'Desactivando…' : 'Desactivar'}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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
        </>
      )}

      <Dialog
        open={creating}
        onClose={() => (createSubmitting ? undefined : setCreating(false))}
        aria-labelledby="create-category-title"
      >
        <DialogTitle id="create-category-title">Nueva categoría</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <TextField
              id={nameId}
              label="Nombre"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              autoFocus
              fullWidth
              error={Boolean(createError)}
              helperText={createError ?? ' '}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreating(false)} disabled={createSubmitting}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={createSubmitting || !createName.trim()}
          >
            {createSubmitting ? 'Creando…' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
