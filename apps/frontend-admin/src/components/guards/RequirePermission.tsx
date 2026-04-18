import type { Permission } from '@kaipos/shared';
import { hasPermission } from '@kaipos/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';

export interface RequirePermissionProps {
  permission: Permission;
}

export function RequirePermission({ permission }: RequirePermissionProps) {
  const { user } = useAuth();

  if (!user || !hasPermission(user.role, permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
