import type { TokenPayload } from './index.js';

// ---------------------------------------------------------------------------
// Channel shape
// ---------------------------------------------------------------------------

export type WSChannelKind = 'business' | 'branch' | 'table' | 'station' | 'user';

export type WSChannel = `${WSChannelKind}:${string}`;

/**
 * Tenant-scoped channel kinds embed `businessId` so that two tenants with the
 * same `branchId` / `tableId` / `stationId` cannot collide on a shared channel.
 * Format: `<kind>:<businessId>:<resourceId>`.
 *
 * `business:<businessId>` and `user:<userId>` are not tenant-scoped — the
 * resource id is itself globally unique (or, for `business`, IS the tenant).
 */
const TENANT_SCOPED_KINDS: ReadonlySet<WSChannelKind> = new Set(['branch', 'table', 'station']);

export interface ParsedChannel {
  kind: WSChannelKind;
  /** Raw payload after the kind prefix (e.g. `biz-1:br-1` for tenant-scoped). */
  id: string;
  /** Set for tenant-scoped kinds (`branch`, `table`, `station`). */
  businessId?: string;
  /** Set for tenant-scoped kinds — the resource id without the businessId prefix. */
  resourceId?: string;
}

const CHANNEL_KINDS: ReadonlySet<WSChannelKind> = new Set([
  'business',
  'branch',
  'table',
  'station',
  'user',
]);

export function parseChannel(channel: string): ParsedChannel | null {
  const sep = channel.indexOf(':');
  if (sep <= 0 || sep === channel.length - 1) return null;
  const kind = channel.slice(0, sep);
  const id = channel.slice(sep + 1);
  if (!CHANNEL_KINDS.has(kind as WSChannelKind)) return null;

  const parsed: ParsedChannel = { kind: kind as WSChannelKind, id };

  if (TENANT_SCOPED_KINDS.has(parsed.kind)) {
    const inner = id.indexOf(':');
    // Tenant-scoped channels MUST have the form `<kind>:<biz>:<resource>`.
    if (inner <= 0 || inner === id.length - 1) return null;
    parsed.businessId = id.slice(0, inner);
    parsed.resourceId = id.slice(inner + 1);
  }

  return parsed;
}

export const channelFor = {
  business: (id: string): WSChannel => `business:${id}`,
  branch: (businessId: string, branchId: string): WSChannel => `branch:${businessId}:${branchId}`,
  table: (businessId: string, tableId: string): WSChannel => `table:${businessId}:${tableId}`,
  station: (businessId: string, stationId: string): WSChannel =>
    `station:${businessId}:${stationId}`,
  user: (id: string): WSChannel => `user:${id}`,
} as const;

// ---------------------------------------------------------------------------
// Message envelope
// ---------------------------------------------------------------------------

export const WS_MESSAGE_VERSION = 1;

export interface WSMessage<T = unknown> {
  type: string;
  channel: WSChannel | null;
  payload: T;
  v: number;
}

// ---------------------------------------------------------------------------
// Client → server control messages
// ---------------------------------------------------------------------------

export interface WSSubscribeRequest {
  type: 'subscribe';
  channel: WSChannel;
}

export interface WSUnsubscribeRequest {
  type: 'unsubscribe';
  channel: WSChannel;
}

export interface WSPingRequest {
  type: 'ping';
}

export type WSClientRequest = WSSubscribeRequest | WSUnsubscribeRequest | WSPingRequest;

// ---------------------------------------------------------------------------
// Subscription authorization
// ---------------------------------------------------------------------------

// Super_admin uses '*' as their sentinel businessId. Keep the policy self-contained
// here so the frontend/backend consume the exact same rules.
const SUPER_ADMIN_BUSINESS_ID = '*';

/**
 * Decides whether a principal described by `token` is allowed to subscribe
 * to `channel`, based only on claims in the token. Ownership checks that
 * require a DB lookup (e.g. table belongs to user's branch) happen in the
 * backend handler, not here.
 *
 * Policy:
 * - `user:<id>`                       allowed iff `id === token.userId`
 * - `business:<id>`                   allowed iff `token.role === 'super_admin'`
 *                                     (opt-in) OR `id === token.businessId`
 * - `branch:<biz>:<id>`               allowed iff `biz === token.businessId` AND
 *                                     `id` ∈ `token.branchIds` (super_admin
 *                                     rejected — no default branch scope)
 * - `table:<biz>:<id>`                requires `biz === token.businessId` AND
 *   `station:<biz>:<id>`              `token.branchIds` non-empty; final
 *                                     ownership check happens in the handler
 *                                     against the DB.
 */
export function canSubscribeTo(channel: string, token: TokenPayload): boolean {
  const parsed = parseChannel(channel);
  if (!parsed) return false;

  const isSuperAdmin = token.role === 'super_admin';

  switch (parsed.kind) {
    case 'user':
      return parsed.id === token.userId;

    case 'business':
      if (isSuperAdmin) return parsed.id !== SUPER_ADMIN_BUSINESS_ID;
      return parsed.id === token.businessId;

    case 'branch':
      if (isSuperAdmin) return false;
      if (parsed.businessId !== token.businessId) return false;
      return (token.branchIds ?? []).includes(parsed.resourceId ?? '');

    case 'table':
    case 'station':
      if (isSuperAdmin) return false;
      if (parsed.businessId !== token.businessId) return false;
      return (token.branchIds ?? []).length > 0;
  }
}
