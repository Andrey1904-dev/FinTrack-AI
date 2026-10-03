import { daysBetween, isWeekend, todayISO } from '../dates';
import { round2 } from '../format';
import type { SalaryProfile, SalaryRate, SalaryWorkDay, WorkDayStatus } from '@/types/salary';

/** Standard Russian public holidays (month-day) */
export const RUSSIAN_HOLIDAYS = new Set([
  '01-01', '01-02', '01-03', '01-04', '01-05', '01-06', '01-07', '01-08',
  '02-23',
  '03-08',
  '05-01', '05-09',
  '06-12',
  '11-04',
]);

export function isRussianHoliday(dateStr: string): boolean {
  const md = dateStr.slice(5, 10);
  return RUSSIAN_HOLIDAYS.has(md);
}

/** Check if a date is scheduled as a working day for the profile */
export function isScheduledWorkDay(dateStr: string, profile: SalaryProfile): boolean {
  if (profile.schedule_type === '5/2') {
    // 5 workdays (Mon-Fri), 2 weekends (Sat-Sun). Also check public holidays
    if (isWeekend(dateStr)) return false;
    if (isRussianHoliday(dateStr)) return false;
    return true;
  }
  if (profile.schedule_type === '2/2') {
    const anchor = profile.settings.schedule_start || profile.start_date || '2026-01-01';
    const diff = daysBetween(anchor, dateStr);
    return ((diff % 4) + 4) % 4 < 2;
  }
  // Custom: defaults to weekdays
  return !isWeekend(dateStr);
}

/** Determine active rate on a given date */
export function getRateForDate(
  dateStr: string,
  profile: SalaryProfile,
  rates: SalaryRate[] = []
): { rate: number; isProbation: boolean } {
  // 1. Check explicit rate table for profile
  const matchingRate = rates.find(
    r => r.salary_profile_id === profile.id && r.valid_from <= dateStr && (!r.valid_to || r.valid_to >= dateStr)
  );
  if (matchingRate) {
    return { rate: matchingRate.rate, isProbation: matchingRate.is_probation };
  }

  // 2. Fallback to profile probation rules
  const probationEnd = profile.probation_end_date;
  const isProbation = !!probationEnd && dateStr <= probationEnd;
  const probationRate = profile.settings.probation_rate ?? 442;
  const standardRate = profile.settings.hourly_rate ?? 497;

  return {
    rate: isProbation ? probationRate : standardRate,
    isProbation,
  };
}

/** Piecework earnings (my-pay girl's model) */
export function calcPieceworkEarnings(
  cases: number,
  isHoliday: boolean,
  bonus: number,
  profile: SalaryProfile
): { base: number; piece: number; bonus: number; total: number } {
  const basePay = Number(profile.settings.base_pay ?? 2415);
  const holidayPay = Number(profile.settings.holiday_pay ?? 4600);
  const casePrice = Number(profile.settings.casePrice ?? profile.settings.case_price ?? 7);
  const percent = Number(profile.settings.percent ?? profile.settings.piece_percent ?? 25);

  const base = isHoliday ? holidayPay : basePay;
  const piece = Math.max(0, cases) * casePrice * (percent / 100);
  const total = base + piece + Math.max(0, bonus);

  return {
    base: round2(base),
    piece: round2(piece),
    bonus: round2(bonus),
    total: round2(total),
  };
}

/** Calculate earnings for a work day */
export function calcDayEarnings(
  profile: SalaryProfile,
  options: {
    date: string;
    actualHours?: number;
    plannedHours?: number;
    status: WorkDayStatus;
    rate?: number;
    cases?: number;
    isHoliday?: boolean;
    bonus?: number;
  },
  rates: SalaryRate[] = []
): { rate: number; earned: number; isProbation: boolean } {
  const { date, status, cases = 0, isHoliday = isRussianHoliday(date), bonus = 0 } = options;

  if (profile.payment_type === 'piecework') {
    if (status === 'skipped' || status === 'sick' || status === 'vacation' || status === 'day_off') {
      return { rate: 0, earned: 0, isProbation: false };
    }
    const res = calcPieceworkEarnings(cases, isHoliday, bonus, profile);
    return { rate: res.base, earned: res.total, isProbation: false };
  }

  // Hourly model (my salary)
  const { rate: baseRate, isProbation } = getRateForDate(date, profile, rates);
  const effectiveRate = options.rate ?? baseRate;

  // Sick, vacation, unpaid skip do not earn via regular hourly rate
  if (status === 'skipped' || status === 'sick' || status === 'vacation' || status === 'day_off') {
    return { rate: effectiveRate, earned: 0, isProbation };
  }

  const hours = options.actualHours ?? options.plannedHours ?? profile.hours_per_day ?? 8;
  const standardHours = profile.hours_per_day ?? 8;
  const regularHours = Math.min(hours, standardHours);
  const overtimeHours = Math.max(0, hours - standardHours);

  const holidayMult = isHoliday ? (profile.settings.holiday_rate_multiplier ?? 1.0) : 1.0;
  const overtimeMult = profile.settings.overtime_rate_multiplier ?? 1.0;

  const regularPay = regularHours * effectiveRate * holidayMult;
  const overtimePay = overtimeHours * effectiveRate * overtimeMult;
  const earned = round2(regularPay + overtimePay + (bonus || 0));

  return {
    rate: effectiveRate,
    earned,
    isProbation,
  };
}

export interface DayDetail {
  date: string;
  isWorkScheduled: boolean;
  isHoliday: boolean;
  isProbation: boolean;
  status: WorkDayStatus;
  plannedHours: number;
  actualHours: number;
  rate: number;
  earned: number;
  cases: number;
  bonus: number;
  note: string;
  isCustom: boolean; // whether an explicit work_day row exists in db
  isFuture: boolean;
}

export interface MonthSalarySummary {
  profileId: string;
  month: string;
  totalEarnedSoFar: number; // earned up to today
  futureForecast: number; // projected for future days
  monthTotalForecast: number; // earned + future
  workedDaysCount: number;
  remainingWorkDaysCount: number;
  totalWorkDaysCount: number;
  workedHours: number;
  plannedRemainingHours: number;
  totalHours: number;
  avgDayEarnings: number;
  avgDailyHours: number;
  maxDayEarnings: number;
  minDayEarnings: number;
  days: DayDetail[];
}

/**
 * Generate full calendar month details and forecast for a salary profile
 */
export function calculateMonthSalary(
  profile: SalaryProfile,
  month: string, // YYYY-MM
  recordedDays: SalaryWorkDay[] = [],
  rates: SalaryRate[] = [],
  today: string = todayISO()
): MonthSalarySummary {
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const m = Number(monthStr);
  const daysInMonth = new Date(year, m, 0).getDate();

  const recordedMap = new Map<string, SalaryWorkDay>();
  for (const d of recordedDays) {
    if (d.salary_profile_id === profile.id) {
      recordedMap.set(d.date, d);
    }
  }

  const days: DayDetail[] = [];
  let totalEarnedSoFar = 0;
  let futureForecast = 0;
  let workedDaysCount = 0;
  let remainingWorkDaysCount = 0;
  let workedHours = 0;
  let plannedRemainingHours = 0;
  let maxDayEarnings = 0;
  let minDayEarnings = Infinity;

  // For piecework average shift earnings in current month
  let pieceworkTotalEarned = 0;
  let pieceworkWorkedShifts = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const date = `${month}-${dayStr}`;
    const isFuture = date > today;
    const isHoliday = isRussianHoliday(date);
    const isScheduled = isScheduledWorkDay(date, profile);
    const existing = recordedMap.get(date);

    if (existing) {
      const isProbation = existing.rate === (profile.settings.probation_rate ?? 442) ||
        (profile.probation_end_date ? date <= profile.probation_end_date : false);

      const dayDetail: DayDetail = {
        date,
        isWorkScheduled: isScheduled,
        isHoliday: existing.is_holiday ?? isHoliday,
        isProbation,
        status: existing.status,
        plannedHours: existing.planned_hours,
        actualHours: existing.actual_hours,
        rate: existing.rate,
        earned: existing.earned_amount,
        cases: existing.cases ?? 0,
        bonus: existing.bonus ?? 0,
        note: existing.note ?? '',
        isCustom: true,
        isFuture,
      };
      days.push(dayDetail);

      if (existing.status === 'worked' || existing.earned_amount > 0) {
        if (!isFuture) {
          totalEarnedSoFar += existing.earned_amount;
          workedDaysCount++;
          workedHours += existing.actual_hours;
          if (existing.earned_amount > maxDayEarnings) maxDayEarnings = existing.earned_amount;
          if (existing.earned_amount < minDayEarnings) minDayEarnings = existing.earned_amount;

          pieceworkTotalEarned += existing.earned_amount;
          pieceworkWorkedShifts++;
        } else {
          futureForecast += existing.earned_amount;
          remainingWorkDaysCount++;
          plannedRemainingHours += existing.actual_hours;
        }
      }
    } else {
      // Default generated day
      const { rate, isProbation } = getRateForDate(date, profile, rates);
      const plannedHours = isScheduled ? (profile.hours_per_day || 8) : 0;
      const status: WorkDayStatus = isScheduled ? (isFuture ? 'planned' : 'planned') : 'day_off';

      let earned = 0;
      if (isScheduled) {
        if (profile.payment_type === 'piecework') {
          // If we have an average shift earned so far, use it; otherwise standard base shift
          const avgShift = pieceworkWorkedShifts > 0 ? (pieceworkTotalEarned / pieceworkWorkedShifts) : (profile.settings.base_pay ?? 2415);
          earned = round2(avgShift);
        } else {
          // Hourly
          const calc = calcDayEarnings(profile, {
            date,
            actualHours: plannedHours,
            plannedHours,
            status: 'worked',
            rate,
            isHoliday,
          }, rates);
          earned = calc.earned;
        }
      }

      const dayDetail: DayDetail = {
        date,
        isWorkScheduled: isScheduled,
        isHoliday,
        isProbation,
        status,
        plannedHours,
        actualHours: isScheduled ? plannedHours : 0,
        rate,
        earned: isScheduled ? earned : 0,
        cases: 0,
        bonus: 0,
        note: '',
        isCustom: false,
        isFuture,
      };
      days.push(dayDetail);

      if (isScheduled) {
        if (isFuture) {
          futureForecast += earned;
          remainingWorkDaysCount++;
          plannedRemainingHours += plannedHours;
        } else {
          // Past planned day that wasn't marked worked
          // We can count it in forecast if month is ongoing or leave for user to confirm
          // Per spec: "Если фактическое значение отсутствует, использовать плановое и явно помечать его как прогноз"
          futureForecast += earned;
          remainingWorkDaysCount++;
          plannedRemainingHours += plannedHours;
        }
      }
    }
  }

  if (minDayEarnings === Infinity) minDayEarnings = 0;

  const monthTotalForecast = round2(totalEarnedSoFar + futureForecast);
  const totalWorkDaysCount = workedDaysCount + remainingWorkDaysCount;
  const totalHours = workedHours + plannedRemainingHours;
  const avgDayEarnings = workedDaysCount > 0 ? round2(totalEarnedSoFar / workedDaysCount) : (totalWorkDaysCount > 0 ? round2(monthTotalForecast / totalWorkDaysCount) : 0);
  const avgDailyHours = workedDaysCount > 0 ? round2(workedHours / workedDaysCount) : (profile.hours_per_day || 8);

  return {
    profileId: profile.id,
    month,
    totalEarnedSoFar: round2(totalEarnedSoFar),
    futureForecast: round2(futureForecast),
    monthTotalForecast,
    workedDaysCount,
    remainingWorkDaysCount,
    totalWorkDaysCount,
    workedHours: round2(workedHours),
    plannedRemainingHours: round2(plannedRemainingHours),
    totalHours: round2(totalHours),
    avgDayEarnings,
    avgDailyHours,
    maxDayEarnings: round2(maxDayEarnings),
    minDayEarnings: round2(minDayEarnings),
    days,
  };
}

/** Rate comparison between probation (442) and standard (497) */
export function calcRateDifference(
  profile: SalaryProfile,
  month: string,
  recordedDays: SalaryWorkDay[] = []
): {
  probationRate: number;
  standardRate: number;
  hourlyDiff: number;
  dailyDiff: number;
  monthWorkHours: number;
  monthDiff: number;
} {
  const probationRate = profile.settings.probation_rate ?? 442;
  const standardRate = profile.settings.hourly_rate ?? 497;
  const hourlyDiff = round2(standardRate - probationRate);
  const dailyHours = profile.hours_per_day || 8;
  const dailyDiff = round2(hourlyDiff * dailyHours);

  // Count scheduled work hours for this month
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const m = Number(monthStr);
  const daysInMonth = new Date(year, m, 0).getDate();

  let monthWorkHours = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const date = `${month}-${dayStr}`;
    const rec = recordedDays.find(d => d.salary_profile_id === profile.id && d.date === date);
    if (rec) {
      if (rec.status === 'worked' || rec.status === 'planned') {
        monthWorkHours += rec.actual_hours || rec.planned_hours;
      }
    } else if (isScheduledWorkDay(date, profile)) {
      monthWorkHours += dailyHours;
    }
  }

  const monthDiff = round2(monthWorkHours * hourlyDiff);

  return {
    probationRate,
    standardRate,
    hourlyDiff,
    dailyDiff,
    monthWorkHours,
    monthDiff,
  };
}

/** Default profiles setup helper */
export const DEFAULT_MY_SALARY_PROFILE: Omit<SalaryProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  name: 'Моя зарплата',
  schedule_type: '5/2',
  payment_type: 'hourly',
  hours_per_day: 8,
  start_date: '2026-09-01',
  probation_end_date: '2026-10-01',
  active: true,
  settings: {
    hourly_rate: 497,
    probation_rate: 442,
    holiday_rate_multiplier: 1.0,
    overtime_rate_multiplier: 1.0,
    salary_day: 10,
    advance_day: 25,
  },
};

export const DEFAULT_GIRL_SALARY_PROFILE: Omit<SalaryProfile, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  name: 'Зарплата девушки',
  schedule_type: '2/2',
  payment_type: 'piecework',
  hours_per_day: 11,
  start_date: '2026-01-01',
  probation_end_date: null,
  active: true,
  settings: {
    base_pay: 2415,
    holiday_pay: 4600,
    case_price: 7,
    piece_percent: 25,
    schedule_start: '2026-01-01',
    monthly_goal: 60000,
    salary_day: 8,
    advance_day: 23,
  },
};
