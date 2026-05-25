import type { UserRole } from '@kaipos/shared';
import {
  Box,
  Chip,
  ColorSchemeToggle,
  Divider,
  KaiPOSLogo,
  Stack,
  Typography,
  WsStatusChip,
  type WsStatusChipStatus,
  useMediaQuery,
  useTheme,
} from '@kaipos/ui';
import { useAuth } from '../context/AuthContext.js';
import { ActiveBranchSwitcher } from './ActiveBranchSwitcher.js';
import { BusinessPicker } from './BusinessPicker.js';
import { UserMenu } from './UserMenu.js';

interface RoleChip {
  label: string;
  color: 'primary' | 'secondary' | 'success' | 'default';
}

const ROLE_CHIPS: Record<UserRole, RoleChip> = {
  super_admin: { label: 'Super Admin', color: 'primary' },
  admin: { label: 'Admin', color: 'primary' },
  manager: { label: 'Manager', color: 'success' },
  supervisor: { label: 'Supervisor', color: 'success' },
  cashier: { label: 'Cajero', color: 'secondary' },
  waiter: { label: 'Mesero', color: 'secondary' },
  kitchen: { label: 'Cocina', color: 'default' },
};

export interface PosHeaderProps {
  wsStatus: WsStatusChipStatus;
}

export function PosHeader({ wsStatus }: PosHeaderProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  // `sm` (600px) gates the compact WsStatusChip / hidden role chip — below
  // that the labeled chip eats too much header width on a phone.
  const isXs = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, business } = useAuth();

  const isSuperAdmin = user?.role === 'super_admin';
  const businessName = business?.name ?? (isSuperAdmin ? null : 'Admin global');
  const role = user?.role;
  const roleChip = role ? ROLE_CHIPS[role] : null;

  return (
    <Box
      component="header"
      sx={{
        height: 64,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        px: { xs: 2, md: 3 },
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderColor: 'divider',
        gap: 2,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0, flexShrink: 0 }}>
        <KaiPOSLogo variant={isDesktop ? 'horizontal' : 'icon'} size="sm" />
        {isDesktop && <Divider orientation="vertical" flexItem sx={{ my: 1.5 }} />}
        {isDesktop && isSuperAdmin && <BusinessPicker />}
        {isDesktop && !isSuperAdmin && businessName && (
          <Typography
            variant="subtitle2"
            sx={{
              color: 'text.primary',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 220,
            }}
          >
            {businessName}
          </Typography>
        )}
        {roleChip && (
          <Chip
            size="small"
            color={roleChip.color}
            label={roleChip.label}
            variant={roleChip.color === 'default' ? 'outlined' : 'filled'}
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          />
        )}
      </Stack>

      <Box sx={{ flexGrow: 1 }} />

      <Stack
        direction="row"
        spacing={{ xs: 0.5, sm: 1 }}
        alignItems="center"
        sx={{ flexShrink: 0 }}
      >
        {user && <ActiveBranchSwitcher />}
        <WsStatusChip status={wsStatus} compact={isXs} />
        <ColorSchemeToggle />
        <UserMenu />
      </Stack>
    </Box>
  );
}
