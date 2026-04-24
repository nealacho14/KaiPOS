import type { Permission } from '@kaipos/shared';
import { hasPermission } from '@kaipos/shared';
import {
  Box,
  Drawer,
  LayoutDashboard,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Package,
  Radio,
  UsersIcon,
  type LucideIcon,
} from '@kaipos/ui';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export const SIDEBAR_WIDTH = 240;

interface SidebarItem {
  label: string;
  to: string;
  icon: LucideIcon;
  permission?: Permission;
}

const ITEMS: SidebarItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Productos', to: '/products', icon: Package, permission: 'products:read' },
  { label: 'Usuarios', to: '/users', icon: UsersIcon, permission: 'users:read' },
  { label: 'Debug · WebSocket', to: '/debug/ws', icon: Radio },
];

export interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isDesktop: boolean;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const visibleItems = ITEMS.filter(
    (item) => !item.permission || (user && hasPermission(user.role, item.permission)),
  );

  return (
    <Box
      component="nav"
      aria-label="Navegación principal"
      sx={{
        width: SIDEBAR_WIDTH,
        height: '100%',
        bgcolor: 'background.paper',
        borderRight: '1px solid',
        borderColor: 'divider',
        pt: 2,
        overflowY: 'auto',
      }}
    >
      <List sx={{ px: 1.5 }}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              onClick={onNavigate}
              sx={{
                position: 'relative',
                borderRadius: 1,
                mb: 0.5,
                '&.active': {
                  bgcolor: 'action.selected',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: -6,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 1,
                    bgcolor: 'primary.main',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                <Icon size={18} aria-hidden />
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{ primary: { sx: { fontSize: 14, fontWeight: 550 } } }}
              />
            </ListItemButton>
          );
        })}
      </List>
    </Box>
  );
}

export function Sidebar({ open, onClose, isDesktop }: SidebarProps): ReactNode {
  if (isDesktop) {
    return (
      <Drawer
        variant="permanent"
        open
        slotProps={{
          paper: {
            sx: {
              width: SIDEBAR_WIDTH,
              boxSizing: 'border-box',
              position: 'static',
              borderRight: 'none',
            },
          },
        }}
        sx={{
          width: SIDEBAR_WIDTH,
          flexShrink: 0,
        }}
      >
        <SidebarContent />
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      slotProps={{
        paper: {
          sx: { width: SIDEBAR_WIDTH, boxSizing: 'border-box' },
        },
      }}
    >
      <SidebarContent onNavigate={onClose} />
    </Drawer>
  );
}
