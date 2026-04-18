import type { UserRole } from '@kaipos/shared';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@kaipos/ui';
import { PageHeader, WsStatusChip } from '../components/index.js';
import { useAuth } from '../context/AuthContext.js';
import { useWebSocketContext } from '../context/WebSocketContext.js';

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
  const ws = useWebSocketContext();

  if (!user) return null;

  const branchIds = user.branchIds ?? [];
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
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {user.name}
              </Typography>
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
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {business?.name ?? 'Admin global'}
              </Typography>
              {business && (
                <Typography variant="mono" color="text.secondary">
                  {business.slug}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                Sucursales asignadas:{' '}
                <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                  {branchIds.length || '—'}
                </Box>
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
                  <Chip key={id} size="small" label={id} variant="outlined" />
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
