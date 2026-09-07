/**
 * Court-calendar freshness for the source-health dots.
 *
 * The judgment corpus has a weekend hole in it: Indian courts publish
 * Mon-Fri and nothing Sat/Sun (measured 2026-09 — Mon 50, Tue 67, Wed 62,
 * Thu 69, Fri 19, Sat 10, Sun 0). A fixed hour window therefore red-dots
 * every Monday morning, when the last ingest to find anything was Sunday's
 * run. That is the same defect as the old 3h ecourts window: a fixed span
 * standing in for a cadence the data does not have.
 *
 * So judgment sources are measured in court-working days, not hours.
 *
 * KNOWN GAP: court holidays and vacations are NOT modelled. A dot will go
 * red on the day after a long holiday. Saying so is better than a padded
 * window that would hide a genuine outage for a week.
 */

const HOUR_MS = 3_600_000;
const IST_OFFSET_MS = 5.5 * HOUR_MS;
const DAY_MS = 86_400_000;

/** Days since the IST epoch, so two instants can be compared by IST date. */
function istDayNumber(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
}

/** 0 = Sunday ... 6 = Saturday, for an IST day number. */
function istWeekday(dayNumber: number): number {
  // 1970-01-01 was a Thursday (4).
  return (((dayNumber + 4) % 7) + 7) % 7;
}

/**
 * Court-working days (Mon-Fri) elapsed after `fromMs`'s IST date, up to and
 * including `toMs`'s IST date. Same-day is 0; a Sunday reading on a Monday
 * is 1, because only Monday counts.
 */
export function courtWorkingDaysBetween(fromMs: number, toMs: number): number {
  const from = istDayNumber(fromMs);
  const to = istDayNumber(toMs);
  if (to <= from) return 0;

  let count = 0;
  for (let day = from + 1; day <= to; day++) {
    const weekday = istWeekday(day);
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/**
 * A judgment source is live if it has produced something within
 * `maxWorkingDays` court-working days. Never true for a source that has
 * produced nothing at all — an absent or unreadable timestamp is a red dot,
 * not a pass.
 */
export function freshWithinWorkingDays(
  ts: string | null,
  maxWorkingDays: number,
  now: number = Date.now(),
): boolean {
  if (!ts) return false;
  const then = new Date(ts).getTime();
  if (!Number.isFinite(then)) return false;
  return courtWorkingDaysBetween(then, now) <= maxWorkingDays;
}
