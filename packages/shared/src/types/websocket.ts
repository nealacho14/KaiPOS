import type { TokenPayload } from './index.js';

// ---------------------------------------------------------------------------
// Channel shape
// ---------------------------------------------------------------------------

export type WSChannelKind = 'business' | 'branch' | 'table' | 'station' | 'user';

export type WSChannel = `${WSChannelKind}:${string}`;

export interface ParsedChannel {
  kind: WSChannelKind;
  id: string;
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
  return { kind: kind as WSChannelKind, id };
}

export const channelFor = {
  business: (id: string): WSChannel => `business:${id}`,
  branch: (id: string): WSChannel => `branch:${id}`,
  table: (id: string): WSChannel => `table:${id}`,
  station: (id: string): WSChannel => `station:${id}`,
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
 * - `user:<id>`      allowed iff `id === token.userId`
 * - `business:<id>`  allowed iff `token.role === 'super_admin'` (opt-in) OR
 *                    `id === token.businessId`
 * - `branch:<id>`    allowed iff `id` ∈ `token.branchIds` (super_admin is
 *                    rejected — super_admin has no default branch scope)
 * - `table:<id>`     requires `token.branchIds` non-empty; final ownership
 *   `station:<id>`   check is performed by the handler against the DB
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
      return (token.branchIds ?? []).includes(parsed.id);

    case 'table':
    case 'station':
      if (isSuperAdmin) return false;
      return (token.branchIds ?? []).length > 0;
  }
}
