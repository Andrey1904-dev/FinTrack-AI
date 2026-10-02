import { addDaysISO, daysBetween, todayISO } from '../dates';
import { round2 } from '../format';
import type { CarExpense, CarRefuel, CarReminder, CarScenarioParams, CarService } from '@/types';
import { annuityPayment } from './loan';

export interface FuelStats {
  /** l/100 km, null when there is not enough data */
  consumption: number | null;
  /** fuel cost per km */
  costPerKm: number | null;
  monthlyFuel: number;
  yearlyFuel: number;
  totalLiters: number;
  totalCost: number;
  distance: number;
}

/**
 * Average consumption by the "full tank to full tank" method: litres poured at
 * every fill-up after the first full one are divided by the distance driven since it.
 */
export function fuelStats(refuels: CarRefuel[], today: string = todayISO()): FuelStats {
  const list = refuels.slice().sort((a, b) => (a.mileage - b.mileage) || a.date.localeCompare(b.date));
  const totalCost = round2(list.reduce((s, r) => s + r.total, 0));
  const totalLiters = round2(list.reduce((s, r) => s + r.liters, 0));

  const full = list.filter(r => r.full_tank && r.mileage > 0);
  let litersUsed = 0;
  let cost = 0;
  let distance = 0;
  if (full.length >= 2) {
    const first = full[0];
    const last = full[full.length - 1];
    distance = last.mileage - first.mileage;
    for (const r of list) {
      if (r.mileage > first.mileage && r.mileage <= last.mileage) {
        litersUsed += r.liters;
        cost += r.total;
      }
    }
  } else if (list.length >= 2 && list[0].mileage > 0) {
    // not enough "full" markers: fall back to every fill-up but the first
    const first = list[0];
    const last = list[list.length - 1];
    distance = last.mileage - first.mileage;
    for (const r of list.slice(1)) {
      litersUsed += r.liters;
      cost += r.total;
    }
  }
  const consumption = distance > 0 && litersUsed > 0 ? round2((litersUsed / distance) * 100) : null;
  const costPerKm = distance > 0 && cost > 0 ? round2(cost / distance) : null;

  // monthly / yearly fuel spend from the last 12 months of fill-ups
  const dates = list.map(r => r.date).sort();
  let monthlyFuel = 0;
  if (dates.length) {
    const yearAgo = daysBetween(dates[0], today) > 365 ? 365 : daysBetween(dates[0], today);
    const windowDays = Math.max(30, yearAgo);
    const sinceISO = addDaysISO(today, -windowDays);
    const inWindow = list.filter(r => r.date >= sinceISO).reduce((s, r) => s + r.total, 0);
    monthlyFuel = round2((inWindow / windowDays) * 30.4);
  }
  return { consumption, costPerKm, monthlyFuel, yearlyFuel: round2(monthlyFuel * 12), totalLiters, totalCost, distance };
}

export interface CarCosts {
  fuel: number;
  service: number;
  other: number;
  total: number;
  perMonth: number;
  perKm: number | null;
  distance: number;
  months: number;
}

/** What the car really costs: fuel + service history + other expenses within [from, to]. */
export function carCosts(
  data: { refuels: CarRefuel[]; expenses: CarExpense[]; service: CarService[] },
  from: string,
  to: string,
): CarCosts {
  const within = <T extends { date: string }>(rows: T[]) => rows.filter(r => r.date >= from && r.date <= to);
  const refuels = within(data.refuels);
  const expenses = within(data.expenses);
  const service = within(data.service);
  const fuel = round2(refuels.reduce((s, r) => s + r.total, 0));
  const serviceCost = round2(service.reduce((s, r) => s + r.total, 0));
  const other = round2(expenses.reduce((s, r) => s + r.amount, 0));
  const total = round2(fuel + serviceCost + other);
  const miles = [...refuels, ...expenses, ...service].map(r => r.mileage).filter(m => m > 0);
  const distance = miles.length > 1 ? Math.max(...miles) - Math.min(...miles) : 0;
  const months = Math.max(1, daysBetween(from, to) / 30.4);
  return { fuel, service: serviceCost, other, total, perMonth: round2(total / months), perKm: distance > 0 ? round2(total / distance) : null, distance, months };
}

export type ReminderLevel = 'ok' | 'soon' | 'overdue';

export interface ReminderState {
  level: ReminderLevel;
  label: string;
  /** km or days left (negative = overdue) */
  remaining: number | null;
  unit: 'km' | 'days';
}

export function reminderState(r: CarReminder, currentMileage: number, today: string = todayISO()): ReminderState {
  if (r.kind === 'mileage' && r.due_mileage !== null) {
    const left = r.due_mileage - currentMileage;
    const soon = Math.max(500, (r.interval_km ?? 0) * 0.1);
    const level: ReminderLevel = left <= 0 ? 'overdue' : left <= soon ? 'soon' : 'ok';
    const label = left <= 0 ? `просрочено на ${Math.abs(left)} км` : `осталось ${left} км`;
    return { level, label, remaining: left, unit: 'km' };
  }
  if (r.due_date) {
    const left = daysBetween(today, r.due_date);
    const level: ReminderLevel = left < 0 ? 'overdue' : left <= 30 ? 'soon' : 'ok';
    const label = left < 0 ? `просрочено на ${Math.abs(left)} дн.` : left === 0 ? 'сегодня' : `осталось ${left} дн.`;
    return { level, label, remaining: left, unit: 'days' };
  }
  return { level: 'ok', label: 'без срока', remaining: null, unit: 'days' };
}

export interface Ownership {
  loanAmount: number;
  loanPayment: number;
  loanTotalPaid: number;
  overpayment: number;
  fuelMonthly: number;
  insuranceMonthly: number;
  taxMonthly: number;
  maintenanceMonthly: number;
  repairMonthly: number;
  runningMonthly: number;
  totalMonthly: number;
  /** down payment + all loan payments + running costs for the loan term (or 5 years for a cash purchase) */
  totalCost: number;
  horizonMonths: number;
}

export const emptyScenario: CarScenarioParams = {
  price: 0,
  downPayment: 0,
  termMonths: 60,
  ratePct: 0,
  consumption: 0,
  monthlyKm: 0,
  fuelPrice: 0,
  maintenanceMonthly: 0,
  insuranceYearly: 0,
  taxYearly: 0,
  repairReserveMonthly: 0,
};

export function calcOwnership(p: CarScenarioParams): Ownership {
  const loanAmount = Math.max(0, p.price - p.downPayment);
  const term = Math.max(0, Math.round(p.termMonths));
  const loanPayment = loanAmount > 0 && term > 0 ? annuityPayment(loanAmount, p.ratePct, term) : 0;
  const loanTotalPaid = round2(loanPayment * term);
  const fuelMonthly = round2((p.consumption / 100) * p.monthlyKm * p.fuelPrice);
  const insuranceMonthly = round2(p.insuranceYearly / 12);
  const taxMonthly = round2(p.taxYearly / 12);
  const runningMonthly = round2(fuelMonthly + insuranceMonthly + taxMonthly + p.maintenanceMonthly + p.repairReserveMonthly);
  const horizonMonths = loanAmount > 0 && term > 0 ? term : 60;
  const paidUpFront = loanAmount > 0 && term > 0 ? p.downPayment : p.price;
  return {
    loanAmount: round2(loanAmount),
    loanPayment,
    loanTotalPaid,
    overpayment: loanAmount > 0 ? round2(Math.max(0, loanTotalPaid - loanAmount)) : 0,
    fuelMonthly,
    insuranceMonthly,
    taxMonthly,
    maintenanceMonthly: p.maintenanceMonthly,
    repairMonthly: p.repairReserveMonthly,
    runningMonthly,
    totalMonthly: round2(runningMonthly + loanPayment),
    totalCost: round2(paidUpFront + loanTotalPaid + runningMonthly * horizonMonths),
    horizonMonths,
  };
}
