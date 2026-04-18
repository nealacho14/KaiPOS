import type { User, UserRole } from '@kaipos/shared';
import {
  Alert,
  Box,
  Button,
  Chip,
  Inbox,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@kaipos/ui';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, PageHeader } from '../components/index.js';
import { ApiError, apiJson } from '../lib/api.js';

type SafeUser = Omit<User, 'passwordHash'>;

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: SafeUser[] };

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
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiJson<SafeUser[]>('/api/users')
      .then((data) => {
        if (!cancelled) setState({ status: 'success', data });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: 'error', message: mapError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return (
    <>
      <PageHeader title="Usuarios" subtitle="Equipo de tu negocio" />

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
        />
      )}

      {state.status === 'success' && state.data.length > 0 && <UsersTable users={state.data} />}
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

function UsersTable({ users }: { users: SafeUser[] }) {
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
          {users.map((user) => (
            <TableRow key={user._id} hover>
              <TableCell sx={{ fontWeight: 550 }}>{user.name}</TableCell>
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
