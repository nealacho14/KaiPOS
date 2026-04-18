import type { User } from '@kaipos/shared/types';

export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Returns a copy of the user record with `passwordHash` stripped.
 * Use at every boundary that serializes a user back to the client.
 */
export function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
