import { describe, expect, it } from 'vitest';
import {
  calcDayEarnings,
  calcPieceworkEarnings,
  calcRateDifference,
  calculateMonthSalary,
  getRateForDate,
  isScheduledWorkDay,
} from './salary';
import type { SalaryProfile, SalaryWorkDay } from '@/types/salary';

const myProfile: SalaryProfile = {
  id: 'my-profile-1',
  user_id: 'user-1',
  name: 'Моя работа',
  schedule_type: '5/2',
  payment_type: 'hourly',
  hours_per_day: 8,
  start_date: '2026-09-01',
  probation_end_date: '2026-09-30',
  active: true,
  settings: {
    hourly_rate: 497,
    probation_rate: 442,
    overtime_rate_multiplier: 1.0,
    holiday_rate_multiplier: 1.0,
  },
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const girlProfile: SalaryProfile = {
  id: 'girl-profile-1',
  user_id: 'user-1',
  name: 'Зарплата девушки',
  schedule_type: '2/2',
  payment_type: 'piecework',
  hours_per_day: 11,
  start_date: '2026-10-01',
  probation_end_date: null,
  active: true,
  settings: {
    base_pay: 2415,
    holiday_pay: 4600,
    case_price: 7,
    piece_percent: 25,
    schedule_start: '2026-10-01',
    monthly_goal: 60000,
  },
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
};

describe('Salary calculations', () => {
  it('TZ Section 9: 8 hours during probation = 3536 ₽', () => {
    // 8 * 442 = 3536
    const res = calcDayEarnings(myProfile, {
      date: '2026-09-15',
      actualHours: 8,
      status: 'worked',
    });
    expect(res.rate).toBe(442);
    expect(res.isProbation).toBe(true);
    expect(res.earned).toBe(3536);
  });

  it('TZ Section 9: 8 hours after probation = 3976 ₽', () => {
    // 8 * 497 = 3976
    const res = calcDayEarnings(myProfile, {
      date: '2026-10-05',
      actualHours: 8,
      status: 'worked',
    });
    expect(res.rate).toBe(497);
    expect(res.isProbation).toBe(false);
    expect(res.earned).toBe(3976);
  });

  it('TZ Section 7: automatic transition 442 -> 497 on probation_end_date', () => {
    const before = getRateForDate('2026-09-30', myProfile);
    expect(before.rate).toBe(442);
    expect(before.isProbation).toBe(true);

    const after = getRateForDate('2026-10-01', myProfile);
    expect(after.rate).toBe(497);
    expect(after.isProbation).toBe(false);
  });

  it('TZ Section 8: 5/2 schedule distinguishes weekdays and weekends', () => {
    // 2026-10-05 is Monday -> work day
    expect(isScheduledWorkDay('2026-10-05', myProfile)).toBe(true);
    // 2026-10-09 is Friday -> work day
    expect(isScheduledWorkDay('2026-10-09', myProfile)).toBe(true);
    // 2026-10-10 is Saturday -> weekend
    expect(isScheduledWorkDay('2026-10-10', myProfile)).toBe(false);
    // 2026-10-11 is Sunday -> weekend
    expect(isScheduledWorkDay('2026-10-11', myProfile)).toBe(false);
  });

  it('TZ Section 10: non-standard hours (e.g. 4 hours or 6 hours)', () => {
    // 4 hours @ 442 = 1768
    const r4 = calcDayEarnings(myProfile, {
      date: '2026-09-10',
      actualHours: 4,
      status: 'worked',
    });
    expect(r4.earned).toBe(1768);

    // 6 hours @ 442 = 2652
    const r6 = calcDayEarnings(myProfile, {
      date: '2026-09-10',
      actualHours: 6,
      status: 'worked',
    });
    expect(r6.earned).toBe(2652);
  });

  it('TZ Section 11: overtime (> 8h) with multiplier 1.0', () => {
    // 10 hours @ 497 = 4970
    const res = calcDayEarnings(myProfile, {
      date: '2026-10-05',
      actualHours: 10,
      status: 'worked',
    });
    expect(res.earned).toBe(4970);
  });

  it('TZ Section 13: vacation / sick / skipped = 0 earned by hourly rate', () => {
    const vac = calcDayEarnings(myProfile, {
      date: '2026-10-05',
      actualHours: 8,
      status: 'vacation',
    });
    expect(vac.earned).toBe(0);

    const sick = calcDayEarnings(myProfile, {
      date: '2026-10-06',
      actualHours: 8,
      status: 'sick',
    });
    expect(sick.earned).toBe(0);

    const skipped = calcDayEarnings(myProfile, {
      date: '2026-10-07',
      actualHours: 8,
      status: 'skipped',
    });
    expect(skipped.earned).toBe(0);
  });

  it('TZ Section 17: rate difference comparison', () => {
    // Diff is 55 ₽/h, daily diff = 440 ₽
    const diff = calcRateDifference(myProfile, '2026-10');
    expect(diff.hourlyDiff).toBe(55);
    expect(diff.dailyDiff).toBe(440);
    expect(diff.monthWorkHours).toBeGreaterThan(0);
    expect(diff.monthDiff).toBe(diff.monthWorkHours * 55);
  });

  it('TZ Section 3: girl piecework shift calculation from my-pay', () => {
    // Regular shift: base 2415 + 400 cases * 7 * 0.25 (1.75) = 2415 + 700 = 3115
    const reg = calcPieceworkEarnings(400, false, 0, girlProfile);
    expect(reg.base).toBe(2415);
    expect(reg.piece).toBe(700);
    expect(reg.total).toBe(3115);

    // Holiday shift: base 4600 + 400 cases * 1.75 = 5300
    const hol = calcPieceworkEarnings(400, true, 0, girlProfile);
    expect(hol.base).toBe(4600);
    expect(hol.piece).toBe(700);
    expect(hol.total).toBe(5300);
  });

  it('TZ Section 15: month forecast combining actual recorded days and planned days', () => {
    const recordedDays: SalaryWorkDay[] = [
      {
        id: '1',
        user_id: 'u1',
        salary_profile_id: myProfile.id,
        date: '2026-10-01',
        planned_hours: 8,
        actual_hours: 8,
        status: 'worked',
        rate: 497,
        earned_amount: 3976,
        note: '',
        created_at: '',
        updated_at: '',
      },
      {
        id: '2',
        user_id: 'u1',
        salary_profile_id: myProfile.id,
        date: '2026-10-02',
        planned_hours: 8,
        actual_hours: 6,
        status: 'worked',
        rate: 497,
        earned_amount: 2982,
        note: '',
        created_at: '',
        updated_at: '',
      },
    ];

    const summary = calculateMonthSalary(myProfile, '2026-10', recordedDays, [], '2026-10-02');
    expect(summary.workedDaysCount).toBe(2);
    expect(summary.totalEarnedSoFar).toBe(3976 + 2982);
    expect(summary.futureForecast).toBeGreaterThan(0);
    expect(summary.monthTotalForecast).toBe(summary.totalEarnedSoFar + summary.futureForecast);
  });
});
