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
    expect(channelFor.branch('br-1')).toBe('branch:br-1');
    expect(channelFor.table('t-1')).toBe('table:t-1');
    expect(channelFor.station('st-1')).toBe('station:st-1');
    expect(channelFor.user('u-1')).toBe('user:u-1');
  });
});

describe('parseChannel', () => {
  it('parses known channel kinds', () => {
    expect(parseChannel('branch:br-1')).toEqual({ kind: 'branch', id: 'br-1' });
    expect(parseChannel('user:u-1')).toEqual({ kind: 'user', id: 'u-1' });
  });

  it('preserves colons inside the id portion', () => {
    expect(parseChannel('business:biz:with:colons')).toEqual({
      kind: 'business',
      id: 'biz:with:colons',
    });
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
    it('allows subscription to a branch present in branchIds', () => {
      const token = makeToken({ branchIds: ['br-1', 'br-2'] });
      expect(canSubscribeTo('branch:br-1', token)).toBe(true);
      expect(canSubscribeTo('branch:br-2', token)).toBe(true);
    });

    it('rejects subscription to a branch not in branchIds (cross-tenant defense)', () => {
      const token = makeToken({ branchIds: ['br-1'] });
      expect(canSubscribeTo('branch:br-other', token)).toBe(false);
    });

    it('rejects when branchIds is undefined', () => {
      const token = makeToken({ branchIds: undefined });
      expect(canSubscribeTo('branch:br-1', token)).toBe(false);
    });

    it('rejects super_admin (no default branch scope, opt-in only at business level)', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('branch:br-1', superAdmin)).toBe(false);
    });
  });

  describe('table / station channels', () => {
    it('allows when the actor has at least one branch', () => {
      const token = makeToken({ branchIds: ['br-1'] });
      expect(canSubscribeTo('table:t-1', token)).toBe(true);
      expect(canSubscribeTo('station:st-1', token)).toBe(true);
    });

    it('rejects when the actor has no branches', () => {
      const token = makeToken({ branchIds: [] });
      expect(canSubscribeTo('table:t-1', token)).toBe(false);
      expect(canSubscribeTo('station:st-1', token)).toBe(false);
    });

    it('rejects super_admin (no branch context)', () => {
      const superAdmin = makeToken({ role: 'super_admin', businessId: '*', branchIds: undefined });
      expect(canSubscribeTo('table:t-1', superAdmin)).toBe(false);
      expect(canSubscribeTo('station:st-1', superAdmin)).toBe(false);
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
  });
});
