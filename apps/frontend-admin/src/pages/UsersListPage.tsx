import { hasPermission, type User, type UserRole } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  Edit,
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
} from '@kaipos/ui';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { PageHeader, PaginationFooter } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { ApiError, type Pagination } from '../lib/api.js';
import { listUsers } from '../lib/users-api.js';

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

  const canWrite = actor ? hasPermission(actor.role, 'users:write') : false;

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

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
          <UsersTable users={state.data} canWrite={canWrite} />
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

function UsersTable({ users, canWrite }: { users: SafeUser[]; canWrite: boolean }) {
  const navigate = useNavigate();
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
            {canWrite && <TableCell align="right">Acciones</TableCell>}
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
              {canWrite && (
                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="small"
                    variant="text"
                    startIcon={<Edit size={14} aria-hidden />}
                    component={RouterLink}
                    to={`/users/${user._id}/edit`}
                  >
                    Editar
                  </Button>
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
  if (!branchIds || branchIds.length === 0) {
    return (
      <Box component="span" sx={{ color: 'text.disabled' }}>
        —
      </Box>
    );
  }
  if (branchIds.length <= 2) {
    return <>{branchIds.join(', ')}</>;
  }
  return <>{`${branchIds.length} sucursales`}</>;
}
