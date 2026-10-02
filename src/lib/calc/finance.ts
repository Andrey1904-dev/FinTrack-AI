import { lastMonthKeys, monthKey, todayISO } from '../dates';
import { round2 } from '../format';
import type { Operation } from '@/types';

export interface MonthStats {
  key: string;
  income: number;
  expense: number;
  free: number;
}

export function monthStats(ops: Operation[], key: string): MonthStats {
  let income = 0;
  let expense = 0;
  for (const o of ops) {
    if (monthKey(o.date) !== key) continue;
    if (o.type === 'income') income += o.amount;
    else expense += o.amount;
  }
  return { key, income: round2(income), expense: round2(expense), free: round2(income - expense) };
}

export function monthSeries(ops: Operation[], count: number, today: string = todayISO()): MonthStats[] {
  return lastMonthKeys(count, today).map(k => monthStats(ops, k));
}

export interface CategoryTotal {
  category: string;
  value: number;
}

export function byCategory(ops: Operation[], type: 'income' | 'expense', key?: string): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const o of ops) {
    if (o.type !== type) continue;
    if (key && monthKey(o.date) !== key) continue;
    map.set(o.category, (map.get(o.category) ?? 0) + o.amount);
  }
  return [...map.entries()].map(([category, value]) => ({ category, value: round2(value) })).sort((a, b) => b.value - a.value);
}

/** Average of the last `count` completed months that actually contain data. */
export function monthlyAverage(ops: Operation[], count = 3, today: string = todayISO()): { income: number; expense: number; months: number } {
  const keys = lastMonthKeys(count + 1, today).slice(0, count);
  const stats = keys.map(k => monthStats(ops, k)).filter(s => s.income > 0 || s.expense > 0);
  if (!stats.length) {
    const cur = monthStats(ops, monthKey(today));
    return { income: cur.income, expense: cur.expense, months: cur.income || cur.expense ? 1 : 0 };
  }
  return {
    income: round2(stats.reduce((s, m) => s + m.income, 0) / stats.length),
    expense: round2(stats.reduce((s, m) => s + m.expense, 0) / stats.length),
    months: stats.length,
  };
}

export interface ForecastRow {
  months: number;
  debt: number;
  /** surplus accumulated if income and spending stay as they are */
  cash: number;
}

export function buildForecast(
  series: number[],
  closes: boolean,
  monthlyFree: number,
  extraPayment: number,
  horizons: number[] = [3, 6, 12, 24],
): ForecastRow[] {
  return horizons.map(months => {
    const debt = months < series.length ? series[months] : closes ? 0 : series[series.length - 1] ?? 0;
    return { months, debt, cash: round2((monthlyFree - extraPayment) * months) };
  });
}

/** Fraction of today's planned work that is already done (0..1), null when nothing is planned. */
export function dayProgress(done: number, total: number): number | null {
  return total > 0 ? done / total : null;
}
