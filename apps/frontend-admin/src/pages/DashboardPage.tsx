import type { UserRole } from '@kaipos/shared';
import { Box, Card, CardContent, Chip, Stack, Typography, WsStatusChip } from '@kaipos/ui';
import { useAuth, useBranches, useWebSocketState } from '@kaipos/app-runtime';
import { PageHeader } from '../components/index.js';

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Manager',
  supervisor: 'Supervisor',
  cashier: 'Cajero',
  waiter: 'Mesero',
  kitchen: 'Cocina',
};

export function DashboardPage() {
  const { user, business } = useAuth();
  const ws = useWebSocketState();
  const { branches } = useBranches();

  if (!user) return null;

  const branchIds = user.branchIds ?? [];
  // Branch ObjectIds mean nothing to a human — resolve them to names and only
  // fall back to the raw id while `/api/branches` is still in flight.
  const branchLabel = (id: string) => branches.find((b) => b._id === id)?.name ?? id;
  const chipStatus = ws.hasEndpoint ? ws.status : 'idle';

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Bienvenido, ${user.name}`} />

      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: {
            xs: '1fr',
            md: 'repeat(2, 1fr)',
            lg: 'repeat(3, 1fr)',
          },
        }}
      >
        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Usuario
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              <Typography variant="h6">{user.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {user.email}
              </Typography>
              <Box sx={{ mt: 1 }}>
                <Chip size="small" color="primary" label={ROLE_LABEL[user.role]} />
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Negocio
            </Typography>
            <Stack spacing={0.75} sx={{ mt: 1 }}>
              <Typography variant="h6">{business?.name ?? 'Admin global'}</Typography>
              {business && (
                <Typography variant="mono" color="text.secondary">
                  {business.slug}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Sucursales asignadas:{' '}
                <Typography component="span" variant="subtitle2" sx={{ color: 'text.primary' }}>
                  {branchIds.length || '—'}
                </Typography>
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Sucursales
            </Typography>
            {branchIds.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No hay sucursales asignadas.
              </Typography>
            ) : (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
                {branchIds.map((id) => (
                  <Chip key={id} size="small" label={branchLabel(id)} variant="outlined" />
                ))}
              </Stack>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Tiempo real
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <WsStatusChip status={chipStatus} />
              {ws.subscribedChannels.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  Sin canales suscritos.
                </Typography>
              ) : (
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap' }} useFlexGap>
                  {ws.subscribedChannels.map((channel) => (
                    <Chip
                      key={channel}
                      size="small"
                      label={channel}
                      variant="outlined"
                      sx={{ fontFamily: 'monospace' }}
                    />
                  ))}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </>
  );
}
