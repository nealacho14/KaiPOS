import { describe, it, expect } from 'vitest';
import { WS_MESSAGE_VERSION, canSubscribeTo, channelFor, parseChannel } from './websocket.js';
import type { TokenPayload } from './index.js';

function makeToken(overrides: Partial<TokenPayload> = {}): TokenPayload {
  return {
    userId: 'u-1',
    businessId: 'biz-1',
    role: 'cashier',
    branchIds: ['br-1'],
    ...overrides,
  };
}

describe('channelFor', () => {
  it('builds canonical channel strings', () => {
    expect(channelFor.business('biz-1')).toBe('business:biz-1');
    expect(channelFor.branch('biz-1', 'br-1')).toBe('branch:biz-1:br-1');
    expect(channelFor.table('biz-1', 't-1')).toBe('table:biz-1:t-1');
    expect(channelFor.station('biz-1', 'st-1')).toBe('station:biz-1:st-1');
    expect(channelFor.user('u-1')).toBe('user:u-1');
  });
});

describe('parseChannel', () => {
  it('parses non-tenant-scoped kinds', () => {
    expect(parseChannel('user:u-1')).toEqual({ kind: 'user', id: 'u-1' });
    expect(parseChannel('business:biz-1')).toEqual({ kind: 'business', id: 'biz-1' });
  });

  it('parses tenant-scoped kinds and exposes businessId + resourceId', () => {
    expect(parseChannel('branch:biz-1:br-1')).toEqual({
      kind: 'branch',
      id: 'biz-1:br-1',
      businessId: 'biz-1',
      resourceId: 'br-1',
    });
    expect(parseChannel('table:biz-1:t-1')).toEqual({
      kind: 'table',
      id: 'biz-1:t-1',
      businessId: 'biz-1',
      resourceId: 't-1',
    });
    expect(parseChannel('station:biz-1:st-1')).toEqual({
      kind: 'station',
      id: 'biz-1:st-1',
      businessId: 'biz-1',
      resourceId: 'st-1',
    });
  });

  it('rejects tenant-scoped channels missing the businessId or resourceId', () => {
    // Old (pre-fix) format `branch:<id>` is now invalid.
    expect(parseChannel('branch:br-1')).toBeNull();
    expect(parseChannel('branch:biz-1:')).toBeNull();
    expect(parseChannel('branch::br-1')).toBeNull();
  });

  it('returns null for unknown kinds', () => {
    expect(parseChannel('unknown:foo')).toBeNull();
  });

  it('returns null for malformed channels', () => {
    expect(parseChannel('branch:')).toBeNull();
    expect(parseChannel(':foo')).toBeNull();
    expect(parseChannel('branch')).toBeNull();
    expect(parseChannel('')).toBeNull();
  });
});

describe('WS_MESSAGE_VERSION', () => {
  it('is at version 1', () => {
    expect(WS_MESSAGE_VERSION).toBe(1);
  });
});

describe('canSubscribeTo', () => {
  describe('user channel', () => {
    it('allows subscription to own user channel', () => {
      expect(canSubscribeTo('user:u-1', makeToken())).toBe(true);
    });

    it('rejects subscription to another user channel', () => {
      expect(canSubscribeTo('user:u-999', makeToken())).toBe(false);
    });
  });

  describe('business channel', () => {
    it('allows subscription to own business', () => {
      expect(canSubscribeTo('business:biz-1', makeToken())).toBe(true);
    });

    it('rejects cross-tenant business subscription', () => {
      expect(canSubscribeTo('business:biz-other', makeToken())).toBe(false);
    });

    it('allows super_admin to opt-in to any concrete business', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('business:biz-7', superAdmin)).toBe(true);
      expect(canSubscribeTo('business:biz-42', superAdmin)).toBe(true);
    });

    it('rejects super_admin subscribing to the sentinel "*"', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('business:*', superAdmin)).toBe(false);
    });
  });

  describe('branch channel', () => {
    it('allows subscription to a branch present in branchIds (own business)', () => {
      const token = makeToken({ branchIds: ['br-1', 'br-2'] });
      expect(canSubscribeTo('branch:biz-1:br-1', token)).toBe(true);
      expect(canSubscribeTo('branch:biz-1:br-2', token)).toBe(true);
    });

    it('rejects cross-tenant branch subscription even when branchId matches', () => {
      // Two businesses sharing the same branchId string must NOT see each
      // other's broadcasts. This is the regression captured by QA Check 5.
      const token = makeToken({ businessId: 'biz-1', branchIds: ['br-1'] });
      expect(canSubscribeTo('branch:biz-2:br-1', token)).toBe(false);
    });

    it('rejects subscription to a branch not in branchIds', () => {
      const token = makeToken({ branchIds: ['br-1'] });
      expect(canSubscribeTo('branch:biz-1:br-other', token)).toBe(false);
    });

    it('rejects when branchIds is undefined', () => {
      const token = makeToken({ branchIds: undefined });
      expect(canSubscribeTo('branch:biz-1:br-1', token)).toBe(false);
    });

    it('rejects super_admin (no default branch scope, opt-in only at business level)', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('branch:biz-1:br-1', superAdmin)).toBe(false);
    });
  });

  describe('table / station channels', () => {
    it('allows when the actor has at least one branch in their own business', () => {
      const token = makeToken({ branchIds: ['br-1'] });
      expect(canSubscribeTo('table:biz-1:t-1', token)).toBe(true);
      expect(canSubscribeTo('station:biz-1:st-1', token)).toBe(true);
    });

    it('rejects cross-tenant table/station subscription', () => {
      const token = makeToken({ businessId: 'biz-1', branchIds: ['br-1'] });
      expect(canSubscribeTo('table:biz-2:t-1', token)).toBe(false);
      expect(canSubscribeTo('station:biz-2:st-1', token)).toBe(false);
    });

    it('rejects when the actor has no branches', () => {
      const token = makeToken({ branchIds: [] });
      expect(canSubscribeTo('table:biz-1:t-1', token)).toBe(false);
      expect(canSubscribeTo('station:biz-1:st-1', token)).toBe(false);
    });

    it('rejects super_admin (no branch context)', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('table:biz-1:t-1', superAdmin)).toBe(false);
      expect(canSubscribeTo('station:biz-1:st-1', superAdmin)).toBe(false);
    });
  });

  describe('malformed input', () => {
    it('rejects unknown channel kinds', () => {
      expect(canSubscribeTo('unknown:foo', makeToken())).toBe(false);
    });

    it('rejects malformed channel strings', () => {
      expect(canSubscribeTo('branch:', makeToken())).toBe(false);
      expect(canSubscribeTo('', makeToken())).toBe(false);
    });

    it('rejects tenant-scoped channels missing the businessId portion (old format)', () => {
      expect(canSubscribeTo('branch:br-1', makeToken({ branchIds: ['br-1'] }))).toBe(false);
    });
  });
});
