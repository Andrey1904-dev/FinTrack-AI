import { describe, expect, it } from 'vitest';
import {
  calcAutoMonth,
  DEFAULT_AUTO_PROFILE,
  entriesOfMonth,
  hourlyRateOn,
  isWorkDay5x2,
  manualMonthGroups,
  manualStats,
  nextPlannedPayout,
  sumMoney,
  workDaysOfMonth,
} from './salary';
import type { SalaryEntry, SalaryProfile } from '@/types/salary';

const base = { user_id: 'u1', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

/** «Заяц»: 5/2, 8 h, probation 442 ₽/h through 30 Sep 2026, then 497 ₽/h. */
const auto: SalaryProfile = {
  id: 'auto-1',
  ...base,
  name: 'Моя зарплата',
  mode: 'automatic',
  schedule_type: '5/2',
  hours_per_day: 8,
  start_date: '2026-09-01',
  probation_end_date: '2026-09-30',
  active: true,
  settings: { hourly_rate: 497, probation_rate: 442, advance_day: 25, salary_day: 10 },
};

const manual: SalaryProfile = {
  id: 'manual-1',
  ...base,
  name: 'Зарплата девушки',
  mode: 'manual',
  schedule_type: '2/2',
  hours_per_day: 11,
  start_date: '2026-01-01',
  probation_end_date: null,
  active: true,
  settings: {},
};

const entry = (id: string, date: string, amount: number, profile = manual.id, note = ''): SalaryEntry => ({
  id,
  ...base,
  salary_profile_id: profile,
  date,
  amount,
  note,
});

describe('Production calendar (5/2)', () => {
  it('matches the official monthly workday counts for 2026 (ПП № 1466)', () => {
    const official = [15, 19, 21, 22, 19, 21, 23, 21, 22, 22, 20, 22];
    official.forEach((count, i) => {
      const month = `2026-${String(i + 1).padStart(2, '0')}`;
      expect(workDaysOfMonth(month).length, month).toBe(count);
    });
    expect(official.reduce((a, b) => a + b, 0)).toBe(247);
  });

  it('matches the official monthly workday counts for 2025 (ПП № 1335)', () => {
    const official = [17, 20, 21, 22, 18, 19, 23, 21, 22, 23, 19, 22];
    official.forEach((count, i) => {
      const month = `2025-${String(i + 1).padStart(2, '0')}`;
      expect(workDaysOfMonth(month).length, month).toBe(count);
    });
    expect(official.reduce((a, b) => a + b, 0)).toBe(247);
  });

  it('matches the official monthly workday counts for 2027 (ПП № 1187)', () => {
    const official = [15, 19, 22, 22, 19, 21, 22, 22, 22, 21, 20, 22];
    official.forEach((count, i) => {
      const month = `2027-${String(i + 1).padStart(2, '0')}`;
      expect(workDaysOfMonth(month).length, month).toBe(count);
    });
    expect(official.reduce((a, b) => a + b, 0)).toBe(247);
  });

  it('knows the New Year holidays and transferred days', () => {
    expect(isWorkDay5x2('2026-01-01')).toBe(false); // holiday
    expect(isWorkDay5x2('2026-01-09')).toBe(false); // transferred day off (Fri)
    expect(isWorkDay5x2('2026-01-12')).toBe(true); // first working day of 2026
    expect(isWorkDay5x2('2026-12-31')).toBe(false); // transferred from 4 Jan
    expect(isWorkDay5x2('2026-03-09')).toBe(false); // 8 Mar (Sun) → Mon
    expect(isWorkDay5x2('2026-05-11')).toBe(false); // 9 May (Sat) → Mon
    expect(isWorkDay5x2('2025-11-01')).toBe(true); // working Saturday in 2025
    expect(isWorkDay5x2('2027-02-20')).toBe(true); // working Saturday in 2027
    expect(isWorkDay5x2('2027-02-22')).toBe(false); // transferred day off
  });

  it('is not the naive days/7×5 approximation', () => {
    // Naive math would give January 2026 ≈ 21–22 workdays; the calendar says 15.
    expect(workDaysOfMonth('2026-01').length).toBe(15);
  });

  it('falls back to weekends + fixed holidays for years without a decree', () => {
    // 2030: 12 Jun 2030 is a Wednesday — holiday.
    expect(isWorkDay5x2('2030-06-12')).toBe(false);
    // An ordinary Wednesday stays working, an ordinary Saturday stays off.
    expect(isWorkDay5x2('2030-06-19')).toBe(true);
    expect(isWorkDay5x2('2030-06-15')).toBe(false);
  });
});

describe('«Заяц» — automatic payroll', () => {
  it('September 2026 is fully on probation: 22 days × 8 h × 442 ₽', () => {
    const s = calcAutoMonth(auto, '2026-09', '2026-08-15');
    expect(s.workDaysTotal).toBe(22);
    expect(s.hoursTotal).toBe(176);
    expect(s.planTotal).toBe(176 * 442); // 77 792
    expect(s.earnedSoFar).toBe(0);
    expect(s.days.every(d => !d.isWorkDay || d.isProbation)).toBe(true);
  });

  it('October 2026 is after probation: 22 days × 8 h × 497 ₽ = 87 472 ₽', () => {
    const s = calcAutoMonth(auto, '2026-10', '2026-10-01');
    expect(s.workDaysTotal).toBe(22);
    expect(s.hoursTotal).toBe(176);
    expect(s.planTotal).toBe(87472);
    expect(s.dominantRate).toBe(497);
    expect(s.days.every(d => !d.isProbation)).toBe(true);
  });

  it('probation boundary: 30 Sep is 442 ₽/h, 1 Oct is 497 ₽/h', () => {
    expect(hourlyRateOn(auto, '2026-09-30')).toEqual({ rate: 442, isProbation: true });
    expect(hourlyRateOn(auto, '2026-10-01')).toEqual({ rate: 497, isProbation: false });
  });

  it('tracks current progress inside the month', () => {
    // 10 Oct 2026 is a Saturday; workdays passed: 1,2,5,6,7,8,9 Oct = 7.
    const s = calcAutoMonth(auto, '2026-10', '2026-10-10');
    expect(s.workDaysPassed).toBe(7);
    expect(s.workDaysLeft).toBe(15);
    expect(s.hoursPassed).toBe(56);
    expect(s.hoursLeft).toBe(120);
    expect(s.earnedSoFar).toBe(7 * 8 * 497); // 27 832
    expect(s.leftToEarn).toBe(87472 - 27832);
    expect(s.earnedSoFar + s.leftToEarn).toBe(s.planTotal);
  });

  it('month start: nothing earned yet; month end: everything earned', () => {
    const start = calcAutoMonth(auto, '2026-11', '2026-10-31');
    expect(start.workDaysPassed).toBe(0);
    expect(start.earnedSoFar).toBe(0);
    const end = calcAutoMonth(auto, '2026-10', '2026-10-31');
    expect(end.workDaysPassed).toBe(22);
    expect(end.earnedSoFar).toBe(end.planTotal);
    expect(end.leftToEarn).toBe(0);
  });

  it('handles the New Year month correctly (January 2026, 15 workdays)', () => {
    const s = calcAutoMonth(auto, '2026-01', '2026-01-15');
    expect(s.workDaysTotal).toBe(15);
    // 12..15 Jan are the only workdays passed by 15 Jan.
    expect(s.workDaysPassed).toBe(4);
  });

  it('a non-working day earns nothing and a workday shows the day price', () => {
    const s = calcAutoMonth(auto, '2026-10', '2026-10-05');
    const monday = s.days.find(d => d.date === '2026-10-05');
    const sunday = s.days.find(d => d.date === '2026-10-04');
    expect(monday?.isWorkDay).toBe(true);
    expect(monday?.amount).toBe(3976); // 8 × 497
    expect(sunday?.isWorkDay).toBe(false);
    expect(sunday?.amount).toBe(0);
  });

  it('plans the next payout from advance/salary days', () => {
    const next = nextPlannedPayout([auto], '2026-10-20');
    expect(next).not.toBeNull();
    expect(next?.date).toBe('2026-10-25'); // advance of October
    expect(next?.amount).toBe(Math.round(87472 / 2));
    const afterAdvance = nextPlannedPayout([auto], '2026-10-26');
    expect(afterAdvance?.date).toBe('2026-11-10'); // remainder of October plan
    expect(afterAdvance?.amount).toBe(87472 - Math.round(87472 / 2));
    // Manual profiles never produce planned payouts.
    expect(nextPlannedPayout([manual], '2026-10-20')).toBeNull();
  });

  it('default profile stores the requested conditions as settings', () => {
    expect(DEFAULT_AUTO_PROFILE.mode).toBe('automatic');
    expect(DEFAULT_AUTO_PROFILE.schedule_type).toBe('5/2');
    expect(DEFAULT_AUTO_PROFILE.hours_per_day).toBe(8);
    expect(DEFAULT_AUTO_PROFILE.settings.hourly_rate).toBe(497);
    expect(DEFAULT_AUTO_PROFILE.settings.probation_rate).toBe(442);
    expect(DEFAULT_AUTO_PROFILE.probation_end_date).toBe('2026-09-30'); // 1 month of probation
  });
});

describe('«Зайчик» — manual shift entries', () => {
  const entries = [
    entry('e1', '2026-10-05', 4000),
    entry('e2', '2026-10-06', 4200),
    entry('e3', '2026-10-07', 3800),
    entry('e4', '2026-10-08', 4100),
    entry('e5', '2026-09-28', 3500),
    entry('e6', '2026-10-06', 5000, 'other-profile'),
  ];

  it('sums a month: 4 shifts, 16 100 ₽, average 4 025 ₽', () => {
    const monthEntries = entriesOfMonth(entries, '2026-10', manual.id);
    const stats = manualStats(monthEntries);
    expect(stats.count).toBe(4);
    expect(stats.total).toBe(16100);
    expect(stats.avg).toBe(4025);
    expect(stats.min).toBe(3800);
    expect(stats.max).toBe(4200);
  });

  it('separates profiles: one entries entity, many owners', () => {
    const mine = entriesOfMonth(entries, '2026-10', manual.id);
    const other = entriesOfMonth(entries, '2026-10', 'other-profile');
    expect(mine).toHaveLength(4);
    expect(other).toHaveLength(1);
    expect(other[0].amount).toBe(5000);
  });

  it('groups by month for the simple chart', () => {
    const groups = manualMonthGroups(entries, manual.id);
    expect(groups).toEqual([
      { month: '2026-09', count: 1, total: 3500 },
      { month: '2026-10', count: 4, total: 16100 },
    ]);
  });

  it('is money-safe: no floating point drift on sums', () => {
    const cents = [entry('c1', '2026-10-01', 0.1), entry('c2', '2026-10-02', 0.2)];
    expect(manualStats(cents).total).toBe(0.3);
    expect(sumMoney([0.1, 0.2, 0.3])).toBe(0.6);
    const many = Array.from({ length: 100 }, (_, i) => entry(`m${i}`, '2026-10-01', 4000.01));
    expect(manualStats(many).total).toBe(400001);
  });

  it('handles an empty month without NaN', () => {
    const stats = manualStats(entriesOfMonth(entries, '2026-01', manual.id));
    expect(stats).toEqual({ count: 0, total: 0, avg: 0, min: 0, max: 0 });
  });
});
