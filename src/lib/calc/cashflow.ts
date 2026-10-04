import { addDaysISO, addMonthsISO, daysBetween, monthEnd, monthKey, shiftMonthKey, todayISO } from '../dates';
import { round2 } from '../format';
import type { Car, CarExpense, CarRefuel, CarService, Debt, Goal, RecurringPayment } from '@/types';
import type { SalaryProfile } from '@/types/salary';
import { advance } from './recurring';
import { calcAutoMonth } from './salary';

export const CASH_FLOW_HORIZONS = [7, 30, 90, 180, 365, 730] as const;
export type CashFlowHorizon = (typeof CASH_FLOW_HORIZONS)[number];
export type CashFlowStatus = 'safe' | 'attention' | 'risk' | 'unset';
export type CashFlowEventKind = 'income' | 'recurring' | 'debt' | 'goal' | 'car' | 'purchase';

export interface PlannedPurchase {
  id: string;
  title: string;
  price: number;
  date: string;
}

export interface CashFlowEvent {
  id: string;
  date: string;
  title: string;
  /** Positive amounts add to cash; negative amounts reduce it. */
  amount: number;
  kind: CashFlowEventKind;
}

export interface CashFlowPoint {
  /** End-of-day projected balance after events scheduled for this date. */
  date: string;
  balance: number;
  change: number;
}

export interface CashFlowAssumptions {
  estimatedCarMonthly: number;
  carObservationDays: number;
  debtsWithoutSchedule: number;
  goalsWithoutDeadline: number;
}

export interface CashFlowResult {
  currentBalance: number;
  endingBalance: number;
  lowestBalance: number;
  lowestBalanceDate: string;
  minimumSafeBalance: number | null;
  status: CashFlowStatus;
  firstUnsafeDate: string | null;
  events: CashFlowEvent[];
  points: CashFlowPoint[];
  assumptions: CashFlowAssumptions;
}

export interface CashFlowInput {
  /** User-entered liquid balance as of `today`; never inferred from income minus expenses. */
  currentBalance: number;
  minimumSafeBalance?: number | null;
  recurring: RecurringPayment[];
  debts: Debt[];
  goals: Goal[];
  cars: Car[];
  refuels: CarRefuel[];
  carExpenses: CarExpense[];
  carService: CarService[];
  salaryProfiles?: SalaryProfile[];
  plannedPurchases?: PlannedPurchase[];
  horizonDays: number;
  today?: string;
}

const validAmount = (value: number): number => (Number.isFinite(value) ? value : 0);
const validDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

function pushEvent(events: CashFlowEvent[], event: CashFlowEvent, from: string, to: string) {
  if (!validDate(event.date) || event.date < from || event.date > to || !Number.isFinite(event.amount) || event.amount === 0) return;
  events.push({ ...event, amount: round2(event.amount) });
}

function addRecurringEvents(events: CashFlowEvent[], payments: RecurringPayment[], today: string, end: string) {
  for (const payment of payments) {
    if (!payment.active || !(payment.amount > 0) || !validDate(payment.next_date)) continue;
    const amount = payment.kind === 'income' ? payment.amount : -payment.amount;
    let date = payment.next_date;
    let guard = 0;

    // An overdue item is treated as due today once. We then advance to the next
    // scheduled occurrence, rather than replaying an unknown number of past cycles.
    if (date < today) {
      pushEvent(events, {
        id: `recurring:${payment.id}:overdue`, date: today, title: payment.title, amount,
        kind: payment.kind === 'income' ? 'income' : 'recurring',
      }, today, end);
      while (date <= today && guard++ < 1000) date = advance(date, payment.frequency, payment.day_of_month);
    }

    while (date <= end && guard++ < 1000) {
      if (date >= today) {
        pushEvent(events, {
          id: `recurring:${payment.id}:${date}`, date, title: payment.title, amount,
          kind: payment.kind === 'income' ? 'income' : 'recurring',
        }, today, end);
      }
      date = advance(date, payment.frequency, payment.day_of_month);
    }
  }
}

function addDebtEvents(events: CashFlowEvent[], debts: Debt[], today: string, end: string): number {
  let debtsWithoutSchedule = 0;
  const maxCycles = Math.min(800, Math.max(1, daysBetween(today, end) + 1));

  for (const debt of debts) {
    if (debt.status !== 'active' || !(debt.balance > 0)) continue;
    if (!(debt.min_payment > 0) || !debt.next_payment_date || !validDate(debt.next_payment_date)) {
      debtsWithoutSchedule += 1;
      continue;
    }

    const preferredDay = Number(debt.next_payment_date.slice(8, 10));
    let date = debt.next_payment_date < today ? today : debt.next_payment_date;
    let balance = debt.balance;
    let cycle = 0;
    while (date <= end && balance > 0.005 && cycle < maxCycles) {
      const daysUntilPayment = Math.max(0, daysBetween(today, date));
      const monthlyRate = Math.max(0, debt.interest_rate) / 100 / 12;
      const interest = cycle === 0
        ? balance * monthlyRate * Math.min(1, daysUntilPayment / 30.4)
        : balance * monthlyRate;
      const due = balance + interest;
      const payment = Math.min(debt.min_payment, due);
      pushEvent(events, {
        id: `debt:${debt.id}:${date}`, date, title: debt.name,
        amount: -payment, kind: 'debt',
      }, today, end);
      balance = Math.max(0, due - payment);
      date = addMonthsISO(date, 1, preferredDay);
      cycle += 1;
    }
  }
  return debtsWithoutSchedule;
}

function addGoalEvents(events: CashFlowEvent[], goals: Goal[], today: string, end: string): number {
  let goalsWithoutDeadline = 0;
  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    const remaining = Math.max(0, goal.target_amount - goal.current_amount);
    if (remaining <= 0) continue;
    if (!goal.deadline || !validDate(goal.deadline) || goal.deadline <= today) {
      goalsWithoutDeadline += 1;
      continue;
    }

    const currentMonthEnd = monthEnd(monthKey(today));
    const firstDate = currentMonthEnd > today
      ? currentMonthEnd
      : monthEnd(monthKey(addMonthsISO(today, 1)));
    const deadlineBeforeNextContribution = firstDate > goal.deadline;
    const firstContribution = deadlineBeforeNextContribution ? goal.deadline : firstDate;
    const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));
    const contributionCount = deadlineBeforeNextContribution
      ? 1
      : monthIndex(goal.deadline) - monthIndex(firstContribution) + 1;
    const monthlyContribution = remaining / contributionCount;

    for (let month = 0; month < contributionCount; month += 1) {
      const date = deadlineBeforeNextContribution
        ? goal.deadline
        : monthEnd(monthKey(addMonthsISO(firstContribution, month, 1)));
      if (date > end) break;
      const amount = month === contributionCount - 1
        ? round2(remaining - monthlyContribution * month)
        : round2(monthlyContribution);
      pushEvent(events, {
        id: `goal:${goal.id}:${date}`, date, title: goal.title,
        amount: -amount, kind: 'goal',
      }, today, end);
    }
  }
  return goalsWithoutDeadline;
}

function estimateCarSpend(input: CashFlowInput, today: string): { monthly: number; observationDays: number; carId?: string } {
  const car = input.cars.find(c => c.is_current) ?? input.cars[0];
  if (!car) return { monthly: 0, observationDays: 0 };
  const from = addDaysISO(today, -364);
  const rows = [
    ...input.refuels.filter(r => r.car_id === car.id).map(r => ({ date: r.date, amount: r.total })),
    ...input.carExpenses.filter(r => r.car_id === car.id).map(r => ({ date: r.date, amount: r.amount })),
    ...input.carService.filter(r => r.car_id === car.id).map(r => ({ date: r.date, amount: r.total })),
  ].filter(r => validDate(r.date) && r.date >= from && r.date <= today && r.amount > 0);
  if (rows.length === 0) return { monthly: 0, observationDays: 0, carId: car.id };

  const firstDate = rows.reduce((first, row) => row.date < first ? row.date : first, rows[0].date);
  const observationDays = Math.max(1, Math.min(365, daysBetween(firstDate, today) + 1));
  // Avoid extrapolating a single recent fill-up across a whole year: wait for a
  // minimum observation window, then use a transparent trailing-12-month average.
  if (observationDays < 30) return { monthly: 0, observationDays, carId: car.id };
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return { monthly: round2((total / observationDays) * 30.4), observationDays, carId: car.id };
}

function addCarEvents(events: CashFlowEvent[], input: CashFlowInput, today: string, end: string) {
  const estimate = estimateCarSpend(input, today);
  if (estimate.monthly <= 0) return estimate;
  let date = monthEnd(monthKey(today));
  if (date <= today) date = monthEnd(monthKey(addMonthsISO(today, 1)));
  let cycle = 0;
  while (date <= end && cycle < 25) {
    pushEvent(events, {
      id: `car-estimate:${estimate.carId}:${date}`, date, title: 'Оценка расходов на автомобиль',
      amount: -estimate.monthly, kind: 'car',
    }, today, end);
    date = monthEnd(monthKey(addMonthsISO(date, 1)));
    cycle += 1;
  }
  return estimate;
}

function addPurchaseEvents(events: CashFlowEvent[], purchases: PlannedPurchase[] = [], today: string, end: string) {
  for (const purchase of purchases) {
    if (!(purchase.price > 0)) continue;
    pushEvent(events, {
      id: `purchase:${purchase.id}`, date: purchase.date, title: purchase.title,
      amount: -purchase.price, kind: 'purchase',
    }, today, end);
  }
}

/**
 * «Заяц» → planned income. The month plan of every automatic payroll profile
 * is projected as two payouts: the advance (advance_day of the month) and the
 * remainder (salary_day of the next month). Manual «Зайчик» entries are facts
 * of the past and are deliberately not projected into the future.
 */
function addSalaryEvents(events: CashFlowEvent[], input: CashFlowInput, today: string, end: string) {
  if (!input.salaryProfiles || input.salaryProfiles.length === 0) return;

  const profiles = input.salaryProfiles.filter(p => p.active && p.mode === 'automatic');
  const currentMonth = monthKey(today);
  const endMonth = monthKey(end);

  let m = currentMonth;
  let guard = 0;
  while (m <= endMonth && guard++ < 24) {
    for (const profile of profiles) {
      const summary = calcAutoMonth(profile, m, today);
      const advDay = profile.settings.advance_day ?? 25;
      const salDay = profile.settings.salary_day ?? 10;

      const advDate = `${m}-${String(advDay).padStart(2, '0')}`;
      const salDate = `${shiftMonthKey(m, 1)}-${String(salDay).padStart(2, '0')}`;

      const plan = summary.planTotal;
      if (plan > 0) {
        const half = round2(plan / 2);
        if (advDate >= today && advDate <= end) {
          pushEvent(events, {
            id: `salary-proj:${profile.id}:${advDate}:adv`,
            date: advDate,
            title: `Аванс · ${profile.name}`,
            amount: half,
            kind: 'income',
          }, today, end);
        }
        if (salDate >= today && salDate <= end) {
          pushEvent(events, {
            id: `salary-proj:${profile.id}:${salDate}:sal`,
            date: salDate,
            title: `Зарплата · ${profile.name}`,
            amount: round2(plan - half),
            kind: 'income',
          }, today, end);
        }
      }
    }
    m = shiftMonthKey(m, 1);
  }
}

/**
 * Deterministic, day-by-day balance projection for up to 24 months.
 * The starting balance is supplied by the user; historical income minus expenses
 * is deliberately not treated as a bank balance. A negative balance is a deficit.
 */
export function buildCashFlowForecast(input: CashFlowInput): CashFlowResult {
  const today = input.today ?? todayISO();
  const requestedDays = Number.isFinite(input.horizonDays) ? Math.floor(input.horizonDays) : 0;
  const horizonDays = Math.max(0, Math.min(730, requestedDays));
  const end = addDaysISO(today, horizonDays);
  const currentBalance = round2(validAmount(input.currentBalance));
  const minimumSafeBalance = input.minimumSafeBalance !== null && input.minimumSafeBalance !== undefined
    && Number.isFinite(input.minimumSafeBalance) && input.minimumSafeBalance >= 0
    ? round2(input.minimumSafeBalance)
    : null;
  const events: CashFlowEvent[] = [];

  addSalaryEvents(events, input, today, end);
  addRecurringEvents(events, input.recurring, today, end);
  const debtsWithoutSchedule = addDebtEvents(events, input.debts, today, end);
  const goalsWithoutDeadline = addGoalEvents(events, input.goals, today, end);
  const car = addCarEvents(events, input, today, end);
  addPurchaseEvents(events, input.plannedPurchases, today, end);

  events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const byDate = new Map<string, CashFlowEvent[]>();
  for (const event of events) byDate.set(event.date, [...(byDate.get(event.date) ?? []), event]);

  let balance = currentBalance;
  const points: CashFlowPoint[] = [];
  let lowestBalance = currentBalance;
  let lowestBalanceDate = today;
  let firstUnsafeDate: string | null = currentBalance < (minimumSafeBalance ?? 0) ? today : null;

  for (let day = 0; day <= horizonDays; day += 1) {
    const date = addDaysISO(today, day);
    const dayEvents = byDate.get(date) ?? [];
    const change = round2(dayEvents.reduce((sum, event) => sum + event.amount, 0));
    balance = round2(balance + change);
    points.push({ date, balance, change });
    if (balance < lowestBalance) {
      lowestBalance = balance;
      lowestBalanceDate = date;
    }
    const threshold = minimumSafeBalance ?? 0;
    if (firstUnsafeDate === null && balance < threshold) firstUnsafeDate = date;
  }

  const status: CashFlowStatus = lowestBalance < 0
    ? 'risk'
    : minimumSafeBalance === null
      ? 'unset'
      : lowestBalance < minimumSafeBalance
        ? 'attention'
        : 'safe';

  return {
    currentBalance,
    endingBalance: round2(balance),
    lowestBalance: round2(lowestBalance),
    lowestBalanceDate,
    minimumSafeBalance,
    status,
    firstUnsafeDate,
    events,
    points,
    assumptions: {
      estimatedCarMonthly: car.monthly,
      carObservationDays: car.observationDays,
      debtsWithoutSchedule,
      goalsWithoutDeadline,
    },
  };
}
