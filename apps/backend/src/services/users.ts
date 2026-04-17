import type { Filter } from 'mongodb';
import type { TokenPayload, User, UserRole } from '@kaipos/shared/types';
import { getUsersCollection } from '../db/collections.js';
import { hashPassword } from '../lib/password.js';
import { AppError, ForbiddenError, NotFoundError } from '../lib/errors.js';
import { createLogger } from '../lib/logger.js';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from '../schemas/users.js';
import { logAuditEvent } from './audit.js';

const log = createLogger({ module: 'users-service' });

type SafeUser = Omit<User, 'passwordHash'>;

const MANAGER_ASSIGNABLE_ROLES: ReadonlySet<UserRole> = new Set([
  'supervisor',
  'cashier',
  'waiter',
  'kitchen',
]);

function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}

function buildScopeFilter(actor: TokenPayload, query?: ListUsersQuery): Filter<User> {
  if (actor.role === 'super_admin') {
    return query?.businessId ? { businessId: query.businessId } : {};
  }
  return { businessId: actor.businessId };
}

function assertManagerCanAssign(
  actor: TokenPayload,
  targetRole: UserRole,
  context: { route: string; method: string },
): void {
  if (actor.role !== 'manager') return;
  if (MANAGER_ASSIGNABLE_ROLES.has(targetRole)) return;

  logAuditEvent({
    action: 'authorization_failed',
    target: actor.userId,
    userId: actor.userId,
    businessId: actor.businessId,
    metadata: {
      permission: 'users:write',
      route: context.route,
      method: context.method,
      reason: 'manager_role_boundary',
      targetRole,
    },
  });

  throw new ForbiddenError('Managers cannot assign this role');
}

export async function listUsers(
  actor: TokenPayload,
  query: ListUsersQuery = {},
): Promise<SafeUser[]> {
  const users = await getUsersCollection();
  const docs = await users.find(buildScopeFilter(actor, query)).toArray();
  return docs.map(stripPasswordHash);
}

export async function getUserById(actor: TokenPayload, id: string): Promise<SafeUser> {
  const users = await getUsersCollection();
  const filter: Filter<User> = { _id: id, ...buildScopeFilter(actor) };
  const user = await users.findOne(filter);
  if (!user) {
    throw new NotFoundError('User');
  }
  return stripPasswordHash(user);
}

export async function createUser(
  actor: TokenPayload,
  data: CreateUserInput,
  context: { route: string; method: string },
): Promise<SafeUser> {
  assertManagerCanAssign(actor, data.role, context);

  const targetBusinessId = actor.businessId;
  const users = await getUsersCollection();

  const existing = await users.findOne({ email: data.email, businessId: targetBusinessId });
  if (existing) {
    throw new AppError('A user with this email already exists', 409, 'DUPLICATE_EMAIL');
  }

  const now = new Date();
  const newUser: User = {
    _id: crypto.randomUUID(),
    businessId: targetBusinessId,
    email: data.email,
    name: data.name,
    passwordHash: await hashPassword(data.password),
    role: data.role,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actor.userId,
    ...(data.branchIds !== undefined ? { branchIds: data.branchIds } : {}),
  };

  await users.insertOne(newUser);
  log.info({ userId: newUser._id, email: newUser.email }, 'User created');

  logAuditEvent({
    action: 'register',
    target: newUser.email,
    userId: actor.userId,
    businessId: actor.businessId,
    metadata: { registeredUserId: newUser._id, role: newUser.role },
  });

  return stripPasswordHash(newUser);
}

export async function updateUser(
  actor: TokenPayload,
  id: string,
  patch: UpdateUserInput,
  context: { route: string; method: string },
): Promise<SafeUser> {
  const users = await getUsersCollection();
  const filter: Filter<User> = { _id: id, ...buildScopeFilter(actor) };

  const existing = await users.findOne(filter);
  if (!existing) {
    throw new NotFoundError('User');
  }

  assertManagerCanAssign(actor, existing.role, context);
  if (patch.role !== undefined) {
    assertManagerCanAssign(actor, patch.role, context);
  }

  const update: Partial<User> = { updatedAt: new Date() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.branchIds !== undefined) update.branchIds = patch.branchIds;
  if (patch.isActive !== undefined) update.isActive = patch.isActive;

  await users.updateOne({ _id: existing._id }, { $set: update });

  const updated = await users.findOne({ _id: existing._id });
  if (!updated) {
    throw new NotFoundError('User');
  }
  return stripPasswordHash(updated);
}

export async function deactivateUser(
  actor: TokenPayload,
  id: string,
  context: { route: string; method: string },
): Promise<SafeUser> {
  if (actor.userId === id) {
    throw new AppError('You cannot deactivate your own account', 403, 'CANNOT_DEACTIVATE_SELF');
  }

  const users = await getUsersCollection();
  const filter: Filter<User> = { _id: id, ...buildScopeFilter(actor) };

  const existing = await users.findOne(filter);
  if (!existing) {
    throw new NotFoundError('User');
  }

  assertManagerCanAssign(actor, existing.role, context);

  if (existing.isActive) {
    await users.updateOne(
      { _id: existing._id },
      { $set: { isActive: false, updatedAt: new Date() } },
    );
  }

  const updated = await users.findOne({ _id: existing._id });
  if (!updated) {
    throw new NotFoundError('User');
  }
  return stripPasswordHash(updated);
}
