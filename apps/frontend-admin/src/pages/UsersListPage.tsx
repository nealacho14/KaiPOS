import { hasPermission, type User, type UserRole } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Edit,
  IconButton,
  Inbox,
  Plus,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  EmptyState,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Trash2,
} from '@kaipos/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { ApiError, type Pagination, useAuth, useBranches } from '@kaipos/app-runtime';
import { PageHeader, PaginationFooter } from '../components/index.js';
import { deactivateUser, listUsers, toUsersApiError } from '../lib/users-api.js';

type SafeUser = Omit<User, 'passwordHash'>;

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: SafeUser[]; pagination: Pagination };

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  cashier: 'Cajero',
  waiter: 'Mesero',
  kitchen: 'Cocina',
};

function mapError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return 'No tienes permiso para ver esta información.';
    if (err.status === 401) return 'Tu sesión ha expirado. Vuelve a iniciar sesión.';
    return 'No pudimos cargar los usuarios. Inténtalo de nuevo.';
  }
  if (err instanceof TypeError) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.';
  }
  return 'Algo salió mal. Inténtalo de nuevo.';
}

export function UsersListPage() {
  const { user: actor } = useAuth();
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);

  const [pendingDelete, setPendingDelete] = useState<SafeUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canWrite = actor ? hasPermission(actor.role, 'users:write') : false;
  // `users:delete` is admin-only: a manager holds users:read/users:write but
  // must not be able to deactivate anyone.
  const canDelete = actor ? hasPermission(actor.role, 'users:delete') : false;

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deactivateUser(pendingDelete._id);
      setPendingDelete(null);
      setState({ status: 'loading' });
      setReloadKey((n) => n + 1);
    } catch (err) {
      const mapped = toUsersApiError(err);
      setDeleteError(
        mapped.code === 'CANNOT_DEACTIVATE_SELF'
          ? 'No puedes desactivar tu propia cuenta.'
          : mapped.status === 403
            ? 'No tienes permiso para desactivar a este usuario.'
            : mapped.message || 'No pudimos desactivar al usuario.',
      );
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete]);

  useEffect(() => {
    let cancelled = false;
    listUsers({ page: page + 1, limit })
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

  return (
    <>
      <PageHeader
        title="Usuarios"
        subtitle="Equipo de tu negocio"
        actions={
          canWrite ? (
            <Button
              variant="contained"
              startIcon={<Plus size={16} aria-hidden />}
              component={RouterLink}
              to="/users/new"
            >
              Nuevo usuario
            </Button>
          ) : undefined
        }
      />

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
          title="Aún no hay miembros"
          subtitle="Invita a tu equipo cuando esté listo."
          action={
            canWrite ? (
              <Button
                variant="contained"
                startIcon={<Plus size={16} aria-hidden />}
                component={RouterLink}
                to="/users/new"
              >
                Nuevo usuario
              </Button>
            ) : undefined
          }
        />
      )}

      {state.status === 'success' && state.data.length > 0 && (
        <>
          <UsersTable
            users={state.data}
            canWrite={canWrite}
            canDelete={canDelete}
            onRequestDelete={(user) => {
              setDeleteError(null);
              setPendingDelete(user);
            }}
          />
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
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        aria-labelledby="delete-user-title"
      >
        <DialogTitle id="delete-user-title">Desactivar usuario</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingDelete
              ? `${pendingDelete.name} se marcará como inactivo y no podrá iniciar sesión. Puedes reactivarlo desde su ficha.`
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
            onClick={() => void handleConfirmDelete()}
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
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Email</TableCell>
            <TableCell>Rol</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Sucursales</TableCell>
            <TableCell>Estado</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <Skeleton variant="text" width="60%" />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                <Skeleton variant="text" width="80%" />
              </TableCell>
              <TableCell>
                <Skeleton variant="rounded" width={80} height={24} />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                <Skeleton variant="text" width="40%" />
              </TableCell>
              <TableCell>
                <Skeleton variant="rounded" width={70} height={24} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UsersTable({
  users,
  canWrite,
  canDelete,
  onRequestDelete,
}: {
  users: SafeUser[];
  canWrite: boolean;
  canDelete: boolean;
  onRequestDelete: (user: SafeUser) => void;
}) {
  const navigate = useNavigate();
  const showActions = canWrite || canDelete;
  return (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Nombre</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Email</TableCell>
            <TableCell>Rol</TableCell>
            <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Sucursales</TableCell>
            <TableCell>Estado</TableCell>
            {showActions && <TableCell align="right">Acciones</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {users.map((user) => (
            <TableRow
              key={user._id}
              hover
              onClick={canWrite ? () => navigate(`/users/${user._id}/edit`) : undefined}
              sx={canWrite ? { cursor: 'pointer' } : undefined}
            >
              <TableCell sx={(theme) => ({ ...theme.typography.subtitle2 })}>{user.name}</TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>{user.email}</TableCell>
              <TableCell>
                <Chip size="small" color="primary" label={ROLE_LABEL[user.role]} />
              </TableCell>
              <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                <BranchesCell branchIds={user.branchIds} />
              </TableCell>
              <TableCell>
                <Chip
                  size="small"
                  color={user.isActive ? 'success' : 'default'}
                  variant={user.isActive ? 'filled' : 'outlined'}
                  label={user.isActive ? 'Activo' : 'Inactivo'}
                />
              </TableCell>
              {showActions && (
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {canWrite && (
                      <Button
                        size="small"
                        variant="text"
                        startIcon={<Edit size={14} aria-hidden />}
                        component={RouterLink}
                        to={`/users/${user._id}/edit`}
                      >
                        Editar
                      </Button>
                    )}
                    {canDelete && user.isActive && (
                      <Tooltip title="Desactivar usuario">
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Desactivar ${user.name}`}
                          onClick={() => onRequestDelete(user)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </IconButton>
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

function BranchesCell({ branchIds }: { branchIds?: string[] }) {
  const { branches } = useBranches();

  if (!branchIds || branchIds.length === 0) {
    return (
      <Box component="span" sx={{ color: 'text.disabled' }}>
        —
      </Box>
    );
  }
  if (branchIds.length <= 2) {
    // A branch ObjectId means nothing to whoever is reading this table. Fall
    // back to the raw id only while `/api/branches` is still in flight.
    const names = branchIds.map((id) => branches.find((b) => b._id === id)?.name ?? id);
    return <>{names.join(', ')}</>;
  }
  return <>{`${branchIds.length} sucursales`}</>;
}
