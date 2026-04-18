import type { UserRole } from '@kaipos/shared';
import {
  Avatar,
  Box,
  ChevronDown,
  Divider,
  IconButton,
  ListItemIcon,
  LogOut,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@kaipos/ui';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

function avatarBg(role: UserRole): string {
  switch (role) {
    case 'super_admin':
    case 'admin':
      return 'primary.main';
    case 'manager':
    case 'supervisor':
      return 'secondary.main';
    default:
      return 'grey.600';
  }
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const open = Boolean(anchorEl);

  if (!user) return null;

  const handleLogout = async () => {
    setAnchorEl(null);
    await logout();
  };

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Abrir menú de usuario"
        sx={{ borderRadius: 999, p: 0.5, gap: 0.5 }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: avatarBg(user.role),
            color: 'primary.contrastText',
            fontSize: 13,
            fontWeight: 650,
          }}
        >
          {initialsOf(user.name)}
        </Avatar>
        <ChevronDown size={16} aria-hidden />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Stack spacing={0.25}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {user.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user.email}
            </Typography>
          </Stack>
        </Box>
        <Divider />
        <MenuItem onClick={handleLogout}>
          <ListItemIcon>
            <LogOut size={16} aria-hidden />
          </ListItemIcon>
          Cerrar sesión
        </MenuItem>
      </Menu>
    </>
  );
}
