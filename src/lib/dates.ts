/** Date helpers. All dates in the database are plain ISO `YYYY-MM-DD` strings (local calendar days). */

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

/** The user's home timezone: salary math must not drift a day because of UTC. */
export const HOME_TIMEZONE = 'Asia/Yekaterinburg';

/**
 * Today's calendar date in a specific IANA timezone as `YYYY-MM-DD`.
 * Falls back to the device's local date when the timezone is unknown.
 */
export function todayISOInZone(timeZone: string = HOME_TIMEZONE, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return toISO(now);
  }
}

export function isWeekend(iso: string): boolean {
  const d = fromISO(iso);
  const day = d.getDay();
  return day === 0 || day === 6; // Sunday (0) or Saturday (6)
}

export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

export function addDaysISO(iso: string, days: number): string {
  const d = fromISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

/** Adds months keeping the preferred day of month (clamped to the month length: 31 Jan + 1 month = 28/29 Feb). */
export function addMonthsISO(iso: string, months: number, preferredDay?: number): string {
  const d = fromISO(iso);
  const day = preferredDay ?? d.getDate();
  const total = d.getFullYear() * 12 + d.getMonth() + months;
  const y = Math.floor(total / 12);
  const m = total % 12;
  return toISO(new Date(y, m, Math.min(day, daysInMonth(y, m)), 12));
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 86_400_000);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(daysInMonth(y, m - 1))}`;
}

export function shiftMonthKey(key: string, delta: number): string {
  return monthKey(addMonthsISO(monthStart(key), delta, 1));
}

/** Last `count` month keys, oldest first, ending with the month of `iso`. */
export function lastMonthKeys(count: number, iso: string = todayISO()): string[] {
  const end = monthKey(iso);
  return Array.from({ length: count }, (_, i) => shiftMonthKey(end, i - (count - 1)));
}
