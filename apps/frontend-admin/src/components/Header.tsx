import type { UserRole } from '@kaipos/shared';
import {
  Box,
  Chip,
  ColorSchemeToggle,
  Divider,
  IconButton,
  KaiPOSLogo,
  MenuIcon,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@kaipos/ui';
import { useAuth } from '../context/AuthContext.js';
import { UserMenu } from './UserMenu.js';
import { WsStatusChip, type WsStatusChipStatus } from './WsStatusChip.js';

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

export interface HeaderProps {
  wsStatus: WsStatusChipStatus;
  onMenuToggle?: () => void;
}

export function Header({ wsStatus, onMenuToggle }: HeaderProps) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { user, business } = useAuth();

  const businessName = business?.name ?? 'Admin global';
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
      {!isDesktop && onMenuToggle && (
        <IconButton
          onClick={onMenuToggle}
          aria-label="Abrir navegación"
          edge="start"
          sx={{ mr: 0.5 }}
        >
          <MenuIcon size={20} />
        </IconButton>
      )}

      <Stack direction="row" spacing={2} alignItems="center" sx={{ minWidth: 0, flexShrink: 0 }}>
        <KaiPOSLogo variant={isDesktop ? 'horizontal' : 'icon'} size="sm" />
        {isDesktop && <Divider orientation="vertical" flexItem sx={{ my: 1.5 }} />}
        {isDesktop && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
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
          />
        )}
      </Stack>

      <Box sx={{ flexGrow: 1 }} />

      <Stack direction="row" spacing={1} alignItems="center">
        <WsStatusChip status={wsStatus} />
        <ColorSchemeToggle />
        <UserMenu />
      </Stack>
    </Box>
  );
}
