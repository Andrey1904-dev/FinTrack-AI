import { addDaysISO, addMonthsISO, daysInMonth, fromISO, isWeekend, monthKey, shiftMonthKey, todayISO } from '../dates';
import { round2 } from '../format';
import type { SalaryEntry, SalaryProfile } from '@/types/salary';

/* ===================== money (no floating point drift) ===================== */

const toCents = (n: number): number => Math.round((Number.isFinite(n) ? n : 0) * 100);

/** Cent-accurate sum: 0.1 + 0.2 stays 0.3, not 0.30000000000000004. */
export function sumMoney(values: number[]): number {
  return values.reduce((s, v) => s + toCents(v), 0) / 100;
}

/* ===================== Russian production calendar (5/2) ===================== */

/** Fixed public holidays as `MM-DD` (ТК РФ, ст. 112). */
export const RU_FIXED_HOLIDAYS = [
  '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
  '02-23', '03-08', '05-01', '05-09', '06-12', '11-04',
] as const;

interface YearCalendar {
  /** Non-working weekdays: holidays + officially transferred days off. */
  extraDaysOff: string[];
  /** Working weekend days (rare: a Saturday declared working by decree). */
  workingWeekends: string[];
}

/**
 * Official data from the yearly government decrees on transferred days off:
 *   2025 — ПП РФ от 04.10.2024 № 1335;
 *   2026 — ПП РФ от 24.09.2025 № 1466 (3.01→9.01, 4.01→31.12);
 *   2027 — ПП РФ от 17.09.2026 № 1187 (2.01→5.11, 3.01→31.12, 20.02→22.02).
 * Only weekday entries are listed: weekends are already non-working.
 */
const PRODUCTION_CALENDAR: Record<number, YearCalendar> = {
  2025: {
    extraDaysOff: [
      '2025-01-01', '2025-01-02', '2025-01-03', '2025-01-06', '2025-01-07', '2025-01-08',
      '2025-05-01', '2025-05-02', '2025-05-08', '2025-05-09',
      '2025-06-12', '2025-06-13',
      '2025-11-03', '2025-11-04',
      '2025-12-31',
    ],
    // The day off moved from Sat 1 Nov to Mon 3 Nov → 1 Nov 2025 is a working Saturday.
    workingWeekends: ['2025-11-01'],
  },
  2026: {
    extraDaysOff: [
      '2026-01-01', '2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09',
      '2026-02-23',
      '2026-03-09',
      '2026-05-01', '2026-05-11',
      '2026-06-12',
      '2026-11-04',
      '2026-12-31',
    ],
    workingWeekends: [],
  },
  2027: {
    extraDaysOff: [
      '2027-01-01', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08',
      '2027-02-22', '2027-02-23',
      '2027-03-08',
      '2027-05-03', '2027-05-10',
      '2027-06-14',
      '2027-11-04', '2027-11-05',
      '2027-12-31',
    ],
    workingWeekends: ['2027-02-20'],
  },
};

/**
 * Fallback for years without an official decree yet: weekends plus fixed
 * holidays; a holiday falling on a weekend (outside the 1–8 Jan block)
 * shifts the day off to the next free weekday (ТК РФ, ст. 112).
 */
function fallbackYearCalendar(year: number): YearCalendar {
  const off = new Set<string>();
  for (const md of RU_FIXED_HOLIDAYS) {
    const iso = `${year}-${md}`;
    off.add(iso);
    if (md.startsWith('01-')) continue; // Jan 1–8: transfers are decided by a separate decree
    if (isWeekend(iso)) {
      const d = fromISO(iso);
      do {
        d.setDate(d.getDate() + 1);
      } while (d.getDay() === 0 || d.getDay() === 6 || off.has(toLocalISO(d)));
      off.add(toLocalISO(d));
    }
  }
  return { extraDaysOff: [...off].filter(iso => !isWeekend(iso)), workingWeekends: [] };
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const yearCache = new Map<number, { off: Set<string>; work: Set<string> }>();

function yearCalendar(year: number): { off: Set<string>; work: Set<string> } {
  let c = yearCache.get(year);
  if (!c) {
    const data = PRODUCTION_CALENDAR[year] ?? fallbackYearCalendar(year);
    c = { off: new Set(data.extraDaysOff), work: new Set(data.workingWeekends) };
    yearCache.set(year, c);
  }
  return c;
}

/** Is `iso` a working day for a standard 5/2 schedule (production calendar)? */
export function isWorkDay5x2(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  const { off, work } = yearCalendar(year);
  if (work.has(iso)) return true;
  if (isWeekend(iso)) return false;
  return !off.has(iso);
}

/** All working days (`YYYY-MM-DD`, ascending) of a `YYYY-MM` month for 5/2. */
export function workDaysOfMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(y, m - 1);
  const out: string[] = [];
  for (let d = 1; d <= total; d++) {
    const iso = `${month}-${pad2(d)}`;
    if (isWorkDay5x2(iso)) out.push(iso);
  }
  return out;
}

/* ===================== «Заяц» — automatic payroll ===================== */

export const DEFAULT_HOURLY_RATE = 497;
export const DEFAULT_PROBATION_RATE = 442;

/** Hourly rate active on a date; probation lasts through `probation_end_date` inclusive. */
export function hourlyRateOn(profile: SalaryProfile, iso: string): { rate: number; isProbation: boolean } {
  const probationEnd = profile.probation_end_date;
  const isProbation = !!probationEnd && iso <= probationEnd && iso >= profile.start_date;
  const rate = isProbation
    ? profile.settings.probation_rate ?? DEFAULT_PROBATION_RATE
    : profile.settings.hourly_rate ?? DEFAULT_HOURLY_RATE;
  return { rate, isProbation };
}

export interface AutoDay {
  date: string;
  isWorkDay: boolean;
  /** The day already counts as worked (date <= today). */
  isPast: boolean;
  isToday: boolean;
  hours: number;
  rate: number;
  amount: number;
  isProbation: boolean;
}

export interface AutoMonthSummary {
  month: string;
  /** Working days / hours of the month by the production calendar. */
  workDaysTotal: number;
  hoursTotal: number;
  /** Progress relative to `today` (a day counts once it has started). */
  workDaysPassed: number;
  workDaysLeft: number;
  hoursPassed: number;
  hoursLeft: number;
  /** Plan for the whole month; automatic mode has no "facts", so forecast = plan. */
  planTotal: number;
  earnedSoFar: number;
  leftToEarn: number;
  /** ₽/hour at the end of the month (what the month is mostly paid at). */
  dominantRate: number;
  days: AutoDay[];
}

/** Full month picture for the automatic «Заяц» mode. */
export function calcAutoMonth(profile: SalaryProfile, month: string, today: string = todayISO()): AutoMonthSummary {
  const hours = profile.hours_per_day > 0 ? profile.hours_per_day : 8;
  const [y, m] = month.split('-').map(Number);
  const total = daysInMonth(y, m - 1);

  const days: AutoDay[] = [];
  const dayAmounts: number[] = [];
  const earnedAmounts: number[] = [];
  let workDaysTotal = 0;
  let workDaysPassed = 0;

  for (let d = 1; d <= total; d++) {
    const date = `${month}-${pad2(d)}`;
    const isWork = isWorkDay5x2(date);
    const { rate, isProbation } = hourlyRateOn(profile, date);
    const amount = isWork ? sumMoney([rate * hours]) : 0;
    const isPast = date <= today;
    days.push({ date, isWorkDay: isWork, isPast, isToday: date === today, hours: isWork ? hours : 0, rate, amount, isProbation });
    if (isWork) {
      workDaysTotal++;
      dayAmounts.push(amount);
      if (isPast) {
        workDaysPassed++;
        earnedAmounts.push(amount);
      }
    }
  }

  const planTotal = sumMoney(dayAmounts);
  const earnedSoFar = sumMoney(earnedAmounts);
  const lastDay = days[days.length - 1];

  return {
    month,
    workDaysTotal,
    hoursTotal: workDaysTotal * hours,
    workDaysPassed,
    workDaysLeft: workDaysTotal - workDaysPassed,
    hoursPassed: workDaysPassed * hours,
    hoursLeft: (workDaysTotal - workDaysPassed) * hours,
    planTotal,
    earnedSoFar,
    leftToEarn: round2(planTotal - earnedSoFar),
    dominantRate: lastDay ? hourlyRateOn(profile, lastDay.date).rate : profile.settings.hourly_rate ?? DEFAULT_HOURLY_RATE,
    days,
  };
}

export interface PlannedPayout {
  date: string;
  amount: number;
  profileName: string;
}

/**
 * The next planned payout of the automatic «Заяц» profiles: the month plan is
 * split into the advance (advance_day) and the remainder (salary_day of the
 * next month). Used by Goals/Dashboard to answer "когда зарплата?".
 */
export function nextPlannedPayout(profiles: SalaryProfile[], today: string = todayISO()): PlannedPayout | null {
  let best: PlannedPayout | null = null;
  const curMonth = monthKey(today);

  for (const p of profiles) {
    if (!p.active || p.mode !== 'automatic') continue;
    const advDay = p.settings.advance_day ?? 25;
    const salDay = p.settings.salary_day ?? 10;

    // Look at the previous, current and next month plans: their payouts cover
    // every possible "next payday" around today.
    for (const m of [shiftMonthKey(curMonth, -1), curMonth, shiftMonthKey(curMonth, 1)]) {
      const plan = calcAutoMonth(p, m, today).planTotal;
      if (plan <= 0) continue;
      const half = Math.round(plan / 2);
      const candidates: PlannedPayout[] = [
        { date: `${m}-${String(advDay).padStart(2, '0')}`, amount: half, profileName: p.name },
        { date: `${shiftMonthKey(m, 1)}-${String(salDay).padStart(2, '0')}`, amount: round2(plan - half), profileName: p.name },
      ];
      for (const c of candidates) {
        if (c.date < today) continue;
        if (!best || c.date < best.date) best = c;
      }
    }
  }
  return best;
}

/* ===================== «Зайчик» — manual shift entries ===================== */

export interface ManualStats {
  count: number;
  total: number;
  avg: number;
  min: number;
  max: number;
}

/** Totals for a list of manual entries (cent-accurate). */
export function manualStats(entries: SalaryEntry[]): ManualStats {
  if (entries.length === 0) return { count: 0, total: 0, avg: 0, min: 0, max: 0 };
  const amounts = entries.map(e => e.amount);
  const total = sumMoney(amounts);
  return {
    count: entries.length,
    total,
    avg: round2(total / entries.length),
    min: Math.min(...amounts),
    max: Math.max(...amounts),
  };
}

/** Entries of one month (optionally one profile), newest first. */
export function entriesOfMonth(entries: SalaryEntry[], month: string, profileId?: string): SalaryEntry[] {
  return entries
    .filter(e => e.date.startsWith(month) && (!profileId || e.salary_profile_id === profileId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
}

export interface ManualMonthGroup {
  month: string; // YYYY-MM
  count: number;
  total: number;
}

/** Month-by-month totals (ascending by month) for the simple statistics chart. */
export function manualMonthGroups(entries: SalaryEntry[], profileId?: string): ManualMonthGroup[] {
  const map = new Map<string, number[]>();
  for (const e of entries) {
    if (profileId && e.salary_profile_id !== profileId) continue;
    const key = e.date.slice(0, 7);
    const list = map.get(key) ?? [];
    list.push(e.amount);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, amounts]) => ({ month, count: amounts.length, total: sumMoney(amounts) }));
}

/* ===================== default profiles ===================== */

export const DEFAULT_AUTO_PROFILE: Omit<SalaryProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  name: 'Моя зарплата',
  mode: 'automatic',
  schedule_type: '5/2',
  hours_per_day: 8,
  start_date: '2026-09-01',
  probation_end_date: addDaysISO(addMonthsISO('2026-09-01', 1, 1), -1), // one month of probation → 2026-09-30
  active: true,
  settings: {
    hourly_rate: DEFAULT_HOURLY_RATE,
    probation_rate: DEFAULT_PROBATION_RATE,
    advance_day: 25,
    salary_day: 10,
  },
};

export const DEFAULT_MANUAL_PROFILE: Omit<SalaryProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  name: 'Зарплата девушки',
  mode: 'manual',
  schedule_type: '2/2',
  hours_per_day: 11,
  start_date: '2026-01-01',
  probation_end_date: null,
  active: true,
  settings: {},
};
