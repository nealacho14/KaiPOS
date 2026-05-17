import type { AvailabilityWindow, ModifierOption } from '@kaipos/shared/types';

interface LocalDateTime {
  dayOfWeek: number;
  hour: number;
  minute: number;
}

// `Intl.DateTimeFormat` is the only reliable way to extract local hour/minute
// for a given IANA timezone in pure Node. We cache formatters by timezone
// because constructing them is non-trivial and the same handful of timezones
// is reused across requests.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  formatterCache.set(timezone, formatter);
  return formatter;
}

const WEEKDAY_TO_NUMBER: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function getLocalDateTime(timezone: string, now: Date): LocalDateTime {
  const parts = getFormatter(timezone).formatToParts(now);
  let dayOfWeek = 0;
  let hour = 0;
  let minute = 0;
  for (const part of parts) {
    if (part.type === 'weekday') {
      dayOfWeek = WEEKDAY_TO_NUMBER[part.value] ?? 0;
    } else if (part.type === 'hour') {
      // Intl returns "24" for midnight in some locales; normalise to 0.
      hour = part.value === '24' ? 0 : parseInt(part.value, 10);
    } else if (part.type === 'minute') {
      minute = parseInt(part.value, 10);
    }
  }
  return { dayOfWeek, hour, minute };
}

function toMinutes(time: string): number {
  const [hh, mm] = time.split(':');
  return parseInt(hh!, 10) * 60 + parseInt(mm!, 10);
}

/**
 * Check whether `now` (in `timezone`) falls inside the availability window.
 *
 * Windows that cross midnight (e.g. 22:00–02:00) are interpreted as two
 * sub-ranges: [from, 24:00) on the configured day, plus [00:00, to) on the
 * following day. The configured `daysOfWeek` apply to the *start* day of the
 * window, so a window 22:00–02:00 with `daysOfWeek=[5]` (Fri) covers
 * Fri 22:00–24:00 AND Sat 00:00–02:00.
 */
export function isWithinAvailabilityWindow(
  window: AvailabilityWindow,
  timezone: string,
  now: Date = new Date(),
): boolean {
  const { dayOfWeek, hour, minute } = getLocalDateTime(timezone, now);
  const nowMinutes = hour * 60 + minute;
  const fromMinutes = toMinutes(window.from);
  const toMinutesValue = toMinutes(window.to);
  const crossesMidnight = toMinutesValue <= fromMinutes;

  if (!crossesMidnight) {
    if (!window.daysOfWeek.includes(dayOfWeek)) return false;
    return nowMinutes >= fromMinutes && nowMinutes < toMinutesValue;
  }

  // Crosses midnight: match if (today is start day AND now ≥ from) OR
  // (today is the day after a start day AND now < to).
  if (window.daysOfWeek.includes(dayOfWeek) && nowMinutes >= fromMinutes) return true;

  const previousDay = (dayOfWeek + 6) % 7;
  if (window.daysOfWeek.includes(previousDay) && nowMinutes < toMinutesValue) return true;

  return false;
}

/**
 * A modifier option without an `available` block is always available.
 * If only some fields are set, missing fields default to "any" — i.e. a
 * `daysOfWeek` without a time range restricts only the day, and a time range
 * without `daysOfWeek` restricts only the time.
 */
export function isModifierOptionAvailable(
  option: ModifierOption,
  timezone: string,
  now: Date = new Date(),
): boolean {
  const avail = option.available;
  if (!avail) return true;

  const { dayOfWeek, hour, minute } = getLocalDateTime(timezone, now);

  if (avail.daysOfWeek && avail.daysOfWeek.length > 0 && !avail.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  if (avail.from !== undefined && avail.to !== undefined) {
    const nowMinutes = hour * 60 + minute;
    const fromMinutes = toMinutes(avail.from);
    const toMinutesValue = toMinutes(avail.to);
    if (toMinutesValue <= fromMinutes) {
      // Midnight-crossing range on a single day (no day shift, matching window
      // semantics in this branch — modifier-option day filter is independent).
      return nowMinutes >= fromMinutes || nowMinutes < toMinutesValue;
    }
    return nowMinutes >= fromMinutes && nowMinutes < toMinutesValue;
  }

  return true;
}
