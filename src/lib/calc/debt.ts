import { addMonthsISO, todayISO } from '../dates';
import { round2 } from '../format';
import type { Debt, DebtPayment } from '@/types';

type DebtLike = Pick<Debt, 'balance' | 'interest_rate' | 'min_payment'>;

export interface PayoffResult {
  /** months until every debt is closed, null when it never happens within the limit */
  months: number | null;
  closeDate: string | null;
  /** total remaining balance at the end of each month (index 0 = now) */
  series: number[];
  totalPaid: number;
  totalInterest: number;
  /** extra money needed per month on top of nothing: min payments + extra */
  monthlyOutlay: number;
}

export const MAX_MONTHS = 600;

/**
 * Month-by-month payoff simulation. Every debt receives its minimum payment, the
 * extra payment goes to the debt with the highest interest rate (avalanche), and
 * payments freed by closed debts roll over to the remaining ones.
 */
export function simulatePayoff(debts: DebtLike[], extraPayment: number, from: string = todayISO(), limit = MAX_MONTHS): PayoffResult {
  const state = debts.filter(d => d.balance > 0).map(d => ({ ...d }));
  const monthlyOutlay = round2(state.reduce((s, d) => s + d.min_payment, 0) + Math.max(0, extraPayment));
  const series = [round2(state.reduce((s, d) => s + d.balance, 0))];
  let totalPaid = 0;
  let totalInterest = 0;
  let months = 0;

  while (state.some(d => d.balance > 0.005) && months < limit) {
    months += 1;
    for (const d of state) {
      if (d.balance <= 0) continue;
      const interest = (d.balance * d.interest_rate) / 100 / 12;
      d.balance += interest;
      totalInterest += interest;
    }
    // the whole monthly budget (minimums + extra) is spent every month, so freed money rolls over
    let budget = monthlyOutlay;
    const open = state.filter(d => d.balance > 0.005);
    for (const d of open) {
      const pay = Math.min(d.balance, d.min_payment, budget);
      d.balance -= pay;
      budget -= pay;
      totalPaid += pay;
    }
    const byRate = state.filter(d => d.balance > 0.005).sort((a, b) => b.interest_rate - a.interest_rate);
    for (const d of byRate) {
      if (budget <= 0) break;
      const pay = Math.min(d.balance, budget);
      d.balance -= pay;
      budget -= pay;
      totalPaid += pay;
    }
    series.push(round2(state.reduce((s, d) => s + Math.max(0, d.balance), 0)));
    // no progress at all: stop early (minimum payment does not even cover interest)
    if (series.length > 2 && series[series.length - 1] >= series[series.length - 2] - 0.005 && monthlyOutlay <= 0) break;
  }

  const closed = !state.some(d => d.balance > 0.005);
  return {
    months: closed ? months : null,
    closeDate: closed ? addMonthsISO(from, months) : null,
    series,
    totalPaid: round2(totalPaid),
    totalInterest: round2(totalInterest),
    monthlyOutlay,
  };
}

export function balanceAfter(result: PayoffResult, months: number): number {
  if (months < result.series.length) return result.series[months];
  return result.months !== null ? 0 : result.series[result.series.length - 1];
}

export function activeDebts(debts: Debt[]): Debt[] {
  return debts.filter(d => d.status === 'active');
}

export function totalDebt(debts: Debt[]): number {
  return round2(activeDebts(debts).reduce((s, d) => s + d.balance, 0));
}

/** Share of the original amount that has already been repaid (0..1). */
export function debtProgress(debts: Debt[]): number {
  const original = debts.reduce((s, d) => s + Math.max(d.original_amount, d.balance), 0);
  if (original <= 0) return 0;
  const remaining = debts.reduce((s, d) => s + d.balance, 0);
  return Math.min(1, Math.max(0, 1 - remaining / original));
}

export function singleDebtProgress(d: Debt): number {
  const original = Math.max(d.original_amount, d.balance);
  return original > 0 ? Math.min(1, Math.max(0, 1 - d.balance / original)) : 0;
}

export interface HistoryPoint {
  date: string;
  balance: number;
}

/** Total remaining debt over time, rebuilt from the repayment history. */
export function debtHistory(debts: Debt[], payments: DebtPayment[], today: string = todayISO()): HistoryPoint[] {
  if (!debts.length) return [];
  const ids = new Set(debts.map(d => d.id));
  const list = payments.filter(p => ids.has(p.debt_id)).sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  const paidByDebt = new Map<string, number>();
  for (const p of list) paidByDebt.set(p.debt_id, (paidByDebt.get(p.debt_id) ?? 0) + p.principal_amount);
  // starting point: what was owed before the first recorded payment
  let current = debts.reduce((s, d) => s + d.balance + (paidByDebt.get(d.id) ?? 0), 0);
  const firstDate = list.length ? list[0].paid_at : today;
  const points: HistoryPoint[] = [{ date: addMonthsISO(firstDate, 0), balance: round2(current) }];
  for (const p of list) {
    current = Math.max(0, current - p.principal_amount);
    points.push({ date: p.paid_at, balance: round2(current) });
  }
  if (points[points.length - 1].date !== today) points.push({ date: today, balance: round2(current) });
  return points;
}
