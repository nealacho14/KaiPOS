import type { UserRole } from './types/index.js';

export type Permission =
  | 'products:read'
  | 'products:write'
  | 'products:delete'
  | 'orders:create'
  | 'orders:read'
  | 'orders:update'
  | 'orders:cancel'
  | 'users:read'
  | 'users:write'
  | 'users:delete'
  | 'reports:view'
  | 'business:manage'
  | 'branches:manage'
  | 'kitchen_stations:read'
  | 'kitchen_stations:write'
  | 'platform:manage';

export const SUPER_ADMIN_BUSINESS_ID = '*';

const ADMIN_PERMISSIONS: Permission[] = [
  'products:read',
  'products:write',
  'products:delete',
  'orders:create',
  'orders:read',
  'orders:update',
  'orders:cancel',
  'users:read',
  'users:write',
  'users:delete',
  'reports:view',
  'business:manage',
  'branches:manage',
  'kitchen_stations:read',
  'kitchen_stations:write',
];

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [...ADMIN_PERMISSIONS, 'platform:manage'],
  admin: ADMIN_PERMISSIONS,
  manager: [
    'products:read',
    'products:write',
    'orders:read',
    'orders:update',
    'orders:cancel',
    'users:read',
    'users:write',
    'reports:view',
    'kitchen_stations:read',
    'kitchen_stations:write',
  ],
  supervisor: ['products:read', 'orders:read', 'orders:update', 'orders:cancel', 'reports:view'],
  cashier: [
    'products:read',
    'orders:create',
    'orders:read',
    'orders:update',
    'kitchen_stations:read',
  ],
  waiter: ['products:read', 'orders:create', 'orders:read', 'kitchen_stations:read'],
  kitchen: ['orders:read', 'orders:update', 'kitchen_stations:read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  if (role === 'super_admin') return true;
  const grants = ROLE_PERMISSIONS[role];
  if (!grants) return false;
  return grants.includes(permission);
}
