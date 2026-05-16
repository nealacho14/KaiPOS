import { describe, it, expect } from 'vitest';
import type { AvailabilityWindow, ModifierOption } from '@kaipos/shared/types';
import { isWithinAvailabilityWindow, isModifierOptionAvailable } from './availability.js';

// 2026-05-08 is a Friday (UTC). Use it as a reference instant and shift the
// hours to test "now" against windows in various timezones.
function utc(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

describe('isWithinAvailabilityWindow', () => {
  it('returns true when current time falls inside a simple window (DR timezone, midday)', () => {
    // 2026-05-08 16:00Z = 12:00 in America/Santo_Domingo (UTC-4)
    const window: AvailabilityWindow = {
      daysOfWeek: [5], // Friday
      from: '11:00',
      to: '15:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 8, 16))).toBe(
      true,
    );
  });

  it('returns false outside the time range', () => {
    // 2026-05-08 20:00Z = 16:00 in America/Santo_Domingo
    const window: AvailabilityWindow = {
      daysOfWeek: [5],
      from: '11:00',
      to: '15:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 8, 20))).toBe(
      false,
    );
  });

  it('returns false on a day not in daysOfWeek', () => {
    // 2026-05-09 (Saturday)
    const window: AvailabilityWindow = {
      daysOfWeek: [5], // Friday only
      from: '11:00',
      to: '15:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 9, 16))).toBe(
      false,
    );
  });

  it('window crossing midnight: matches late-night hour on configured day', () => {
    // 2026-05-08 23:00 local DR = 2026-05-09 03:00Z
    const window: AvailabilityWindow = {
      daysOfWeek: [5], // Friday
      from: '22:00',
      to: '02:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 9, 3))).toBe(
      true,
    );
  });

  it('window crossing midnight: matches early morning of the next day', () => {
    // 2026-05-09 01:00 local DR = 2026-05-09 05:00Z (Saturday early AM, but
    // the Fri 22:00–02:00 window still applies).
    const window: AvailabilityWindow = {
      daysOfWeek: [5],
      from: '22:00',
      to: '02:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 9, 5))).toBe(
      true,
    );
  });

  it('window crossing midnight: returns false at 03:00 (outside both halves)', () => {
    // 2026-05-09 03:00 local DR = 2026-05-09 07:00Z
    const window: AvailabilityWindow = {
      daysOfWeek: [5],
      from: '22:00',
      to: '02:00',
    };

    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 9, 7))).toBe(
      false,
    );
  });

  it('timezone matters: UTC vs DR differ at the boundary', () => {
    const window: AvailabilityWindow = {
      daysOfWeek: [5],
      from: '11:00',
      to: '15:00',
    };

    // 2026-05-08 14:00Z is inside [11:00, 15:00) for UTC...
    expect(isWithinAvailabilityWindow(window, 'UTC', utc(2026, 5, 8, 14))).toBe(true);
    // ...but only 10:00 in DR (UTC-4) — outside [11:00, 15:00).
    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 8, 14))).toBe(
      false,
    );
  });

  it('inclusive `from`, exclusive `to`', () => {
    const window: AvailabilityWindow = {
      daysOfWeek: [5],
      from: '11:00',
      to: '15:00',
    };

    // 11:00 DR = 15:00Z — inside
    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 8, 15))).toBe(
      true,
    );
    // 15:00 DR = 19:00Z — outside (end is exclusive)
    expect(isWithinAvailabilityWindow(window, 'America/Santo_Domingo', utc(2026, 5, 8, 19))).toBe(
      false,
    );
  });
});

describe('isModifierOptionAvailable', () => {
  const baseOption: ModifierOption = {
    id: 'opt-1',
    label: 'Extra cheese',
    priceDelta: 1.5,
  };

  it('returns true when `available` is undefined', () => {
    expect(
      isModifierOptionAvailable(baseOption, 'America/Santo_Domingo', utc(2026, 5, 8, 16)),
    ).toBe(true);
  });

  it('restricts by daysOfWeek only', () => {
    const option: ModifierOption = {
      ...baseOption,
      available: { daysOfWeek: [5] }, // Fri only
    };

    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 8, 16))).toBe(
      true,
    );
    // Saturday
    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 9, 16))).toBe(
      false,
    );
  });

  it('restricts by time only', () => {
    const option: ModifierOption = {
      ...baseOption,
      available: { from: '11:00', to: '15:00' },
    };

    // 12:00 DR
    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 8, 16))).toBe(
      true,
    );
    // 16:00 DR
    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 8, 20))).toBe(
      false,
    );
  });

  it('combines daysOfWeek and time range', () => {
    const option: ModifierOption = {
      ...baseOption,
      available: { daysOfWeek: [5], from: '11:00', to: '15:00' },
    };

    // Fri 12:00 DR — match
    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 8, 16))).toBe(
      true,
    );
    // Sat 12:00 DR — day fails
    expect(isModifierOptionAvailable(option, 'America/Santo_Domingo', utc(2026, 5, 9, 16))).toBe(
      false,
    );
  });
});
