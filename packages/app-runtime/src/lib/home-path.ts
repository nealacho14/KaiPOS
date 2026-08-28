import type { UserRole } from '@kaipos/shared';

// Where a role lands when it has nowhere else to go: the post-login default
// and the redirect target of every `RequirePermission` guard.
//
// This cannot be a single app-wide constant. `/dashboard` now requires
// `business:manage`, so a manager bounced off `/users` to `/dashboard` would be
// bounced straight back — an infinite redirect. Each role instead resolves to
// the first route it can actually see.
export function resolveHomePath(role: UserRole): string {
  if (role === 'super_admin' || role === 'admin') return '/dashboard';
  // `kitchen` holds only order/station grants — nothing in the admin SPA is
  // reachable for it, so it gets an explicit dead end instead of a bounce loop.
  if (role === 'kitchen') return '/no-access';
  return '/products';
}
