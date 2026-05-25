import type { Permission } from '@kaipos/shared';
import { hasPermission } from '@kaipos/shared';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';

export interface RequirePermissionProps {
  permission: Permission;
  // Where to send the user when they lack `permission`. App-specific: admin
  // sends to `/dashboard`, POS sends to `/`. Pass it explicitly so this
  // guard stays neutral and works inside any host app.
  fallbackPath: string;
}

export function RequirePermission({ permission, fallbackPath }: RequirePermissionProps) {
  const { user } = useAuth();

  if (!user || !hasPermission(user.role, permission)) {
    return <Navigate to={fallbackPath} replace />;
  }

  return <Outlet />;
}
