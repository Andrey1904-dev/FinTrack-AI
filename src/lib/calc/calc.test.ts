import { describe, expect, it } from 'vitest';
import {
  annuityPayment, balanceAfter, buildForecast, calcOwnership, calcWhatIf, carCosts, debtHistory, debtProgress,
  fuelStats, monthlyAverage, monthStats, occurrencesBetween, parseQuickEntry, reminderState, simulatePayoff,
  byCategory, loanSummary, advance, buildEvents, buildCandidates,
} from './index';
import { addMonthsISO, daysBetween, lastMonthKeys } from '../dates';
import { toCSV } from '../export';
import { money, plural, relativeDays } from '../format';
import type { CarRefuel, CarReminder, Debt, DebtPayment, Operation, RecurringPayment, CarScenarioParams } from '@/types';

const base = { user_id: 'u', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };

const debt = (o: Partial<Debt>): Debt => ({
  id: 'd', ...base, kind: 'loan', name: 'Кредит', organization: '', original_amount: 100000, balance: 100000,
  interest_rate: 0, min_payment: 10000, next_payment_date: null, status: 'active', credit_limit: 0, comment: '', ...o,
});
const op = (o: Partial<Operation>): Operation => ({
  id: Math.random().toString(), user_id: 'u', client_id: 'c', type: 'expense', amount: 0, category: 'Другое', note: '',
  date: '2026-10-02', recurrence: 'none', created_at: '', updated_at: '', ...o,
});
const refuel = (o: Partial<CarRefuel>): CarRefuel => ({
  id: Math.random().toString(), ...base, car_id: 'c', date: '2026-01-01', mileage: 0, liters: 0, price_per_liter: 0, total: 0,
  station: '', fuel_type: '', full_tank: true, operation_id: null, ...o,
});

describe('dates and formatting', () => {
  it('clamps month ends', () => {
    expect(addMonthsISO('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsISO('2026-02-28', 1, 31)).toBe('2026-03-31');
    expect(addMonthsISO('2026-11-15', 3)).toBe('2027-02-15');
  });
  it('counts days and month keys', () => {
    expect(daysBetween('2026-10-02', '2026-10-05')).toBe(3);
    expect(lastMonthKeys(3, '2026-01-10')).toEqual(['2025-11', '2025-12', '2026-01']);
  });
  it('formats', () => {
    expect(money(150000)).toBe('150\u00a0000\u00a0₽');
    expect(money(-2630)).toBe('−2\u00a0630\u00a0₽');
    expect(plural(3, ['день', 'дня', 'дней'])).toBe('дня');
    expect(plural(11, ['день', 'дня', 'дней'])).toBe('дней');
    expect(relativeDays('2026-10-05', '2026-10-02')).toBe('через 3 дня');
    expect(relativeDays('2026-10-02', '2026-10-02')).toBe('сегодня');
    expect(relativeDays('2026-10-01', '2026-10-02')).toBe('вчера');
  });
});

describe('loans', () => {
  it('annuity payment matches the textbook value', () => {
    expect(annuityPayment(1_380_000, 18, 60)).toBeCloseTo(35_042, -1);
    expect(annuityPayment(120_000, 0, 12)).toBe(10_000);
    expect(annuityPayment(0, 10, 12)).toBe(0);
  });
  it('overpayment', () => {
    const s = loanSummary(100_000, 12, 12);
    expect(s.payment).toBeCloseTo(8884.88, 1);
    expect(s.overpayment).toBeCloseTo(6618.6, 0);
  });
});

describe('debt payoff', () => {
  it('closes a zero-rate debt in the expected number of months', () => {
    const r = simulatePayoff([debt({ balance: 100000, min_payment: 10000 })], 0, '2026-10-02');
    expect(r.months).toBe(10);
    expect(r.closeDate).toBe('2027-08-02');
    expect(r.series[3]).toBe(70000);
    expect(r.totalInterest).toBe(0);
  });
  it('extra payment speeds things up', () => {
    const slow = simulatePayoff([debt({ balance: 550000, min_payment: 30000 })], 0);
    const fast = simulatePayoff([debt({ balance: 550000, min_payment: 30000 })], 30000);
    expect(fast.months!).toBeLessThan(slow.months!);
    expect(balanceAfter(fast, 3)).toBe(370000);
    expect(balanceAfter(fast, 6)).toBe(190000);
    expect(balanceAfter(fast, 12)).toBe(0);
  });
  it('interest is accounted for and never ending debt is reported', () => {
    const r = simulatePayoff([debt({ balance: 100000, interest_rate: 24, min_payment: 5000 })], 0);
    expect(r.months).toBeGreaterThan(24);
    expect(r.totalInterest).toBeGreaterThan(0);
    const never = simulatePayoff([debt({ balance: 100000, interest_rate: 24, min_payment: 1000 })], 0);
    expect(never.months).toBeNull();
    const nothing = simulatePayoff([debt({ balance: 100000, min_payment: 0 })], 0);
    expect(nothing.months).toBeNull();
  });
  it('extra goes to the highest rate and freed money rolls over', () => {
    const r = simulatePayoff([
      debt({ balance: 10000, interest_rate: 5, min_payment: 5000 }),
      debt({ balance: 50000, interest_rate: 30, min_payment: 5000 }),
    ], 10000);
    expect(r.months).not.toBeNull();
    expect(r.months!).toBeLessThanOrEqual(4);
  });
  it('progress and history', () => {
    const ds = [debt({ id: 'a', original_amount: 100000, balance: 60000 }), debt({ id: 'b', original_amount: 100000, balance: 100000 })];
    expect(debtProgress(ds)).toBeCloseTo(0.2);
    const payments: DebtPayment[] = [{
      id: 'p', ...base, debt_id: 'a', amount: 20000, principal_amount: 20000, paid_at: '2026-09-01', comment: '', balance_after: 60000, advanced: false, operation_id: null,
    }];
    const h = debtHistory(ds, payments, '2026-10-02');
    expect(h[0].balance).toBe(180000);
    expect(h[h.length - 1].balance).toBe(160000);
  });
});

describe('recurring payments', () => {
  const p = (o: Partial<RecurringPayment>): RecurringPayment => ({
    id: 'r', ...base, title: 'МТС', amount: 10700, kind: 'expense', category: 'Связь', frequency: 'monthly',
    day_of_month: 5, next_date: '2026-10-05', active: true, comment: '', ...o,
  });
  it('generates monthly events', () => {
    const occ = occurrencesBetween(p({}), '2026-10-01', '2026-12-31', '2026-10-02');
    expect(occ.map(o => o.date)).toEqual(['2026-10-05', '2026-11-05', '2026-12-05']);
  });
  it('keeps the day of month after short months', () => {
    expect(advance('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
  });
  it('flags overdue and skips inactive', () => {
    const occ = occurrencesBetween(p({ next_date: '2026-09-28' }), '2026-10-01', '2026-10-31', '2026-10-02');
    expect(occ[0].overdue).toBe(true);
    expect(occ[0].date).toBe('2026-09-28');
    expect(occurrencesBetween(p({ active: false }), '2026-10-01', '2026-10-31')).toEqual([]);
  });
  it('weekly', () => {
    const occ = occurrencesBetween(p({ frequency: 'weekly', next_date: '2026-10-02' }), '2026-10-01', '2026-10-31', '2026-10-02');
    expect(occ).toHaveLength(5);
  });
});

describe('cars', () => {
  it('computes consumption with the full-tank method', () => {
    const stats = fuelStats([
      refuel({ date: '2026-09-01', mileage: 100000, liters: 40, total: 2400 }),
      refuel({ date: '2026-09-10', mileage: 100500, liters: 40, total: 2400 }),
      refuel({ date: '2026-09-20', mileage: 101000, liters: 45, total: 2700 }),
    ], '2026-10-01');
    expect(stats.consumption).toBe(8.5);
    expect(stats.costPerKm).toBe(5.1);
    expect(stats.distance).toBe(1000);
    expect(stats.monthlyFuel).toBeGreaterThan(0);
    expect(stats.yearlyFuel).toBeCloseTo(stats.monthlyFuel * 12, 0);
  });
  it('returns null with too little data', () => {
    const stats = fuelStats([refuel({ mileage: 100, liters: 10, total: 600 })]);
    expect(stats.consumption).toBeNull();
    expect(stats.costPerKm).toBeNull();
  });
  it('sums true ownership costs', () => {
    const costs = carCosts({
      refuels: [refuel({ date: '2026-09-01', mileage: 1000, total: 2000, liters: 30 })],
      expenses: [{ id: 'e', ...base, car_id: 'c', date: '2026-09-05', mileage: 1500, category: 'Мойка', title: '', amount: 500, comment: '', operation_id: null }],
      service: [{ id: 's', ...base, car_id: 'c', date: '2026-09-28', mileage: 2000, title: 'Масло', parts_cost: 4000, labor_cost: 500, items: [], total: 4500, comment: '', operation_id: null }],
    }, '2026-09-01', '2026-09-30');
    expect(costs.total).toBe(7000);
    expect(costs.distance).toBe(1000);
    expect(costs.perKm).toBe(7);
  });
  it('reminder statuses', () => {
    const r = (o: Partial<CarReminder>): CarReminder => ({
      id: 'r', ...base, car_id: 'c', title: 'Масло', kind: 'mileage', interval_km: 7000, due_mileage: 149000, due_date: null,
      status: 'active', last_done_at: null, comment: '', ...o,
    });
    expect(reminderState(r({}), 142000).level).toBe('ok');
    expect(reminderState(r({}), 142000).remaining).toBe(7000);
    expect(reminderState(r({}), 148700).level).toBe('soon');
    expect(reminderState(r({}), 149500).level).toBe('overdue');
    const byDate = r({ kind: 'date', due_mileage: null, due_date: '2027-05-15' });
    expect(reminderState(byDate, 0, '2026-10-02').level).toBe('ok');
    expect(reminderState(byDate, 0, '2027-05-01').level).toBe('soon');
    expect(reminderState(byDate, 0, '2027-06-01').level).toBe('overdue');
  });
  it('total cost of ownership for a car purchase', () => {
    const params: CarScenarioParams = {
      price: 1_680_000, downPayment: 300_000, termMonths: 60, ratePct: 0, consumption: 7.5, monthlyKm: 1500,
      fuelPrice: 65, maintenanceMonthly: 8000, insuranceYearly: 60000, taxYearly: 12000, repairReserveMonthly: 5000,
    };
    const o = calcOwnership(params);
    expect(o.loanAmount).toBe(1_380_000);
    expect(o.loanPayment).toBe(23_000);
    expect(o.fuelMonthly).toBe(7312.5);
    expect(o.insuranceMonthly).toBe(5000);
    expect(o.taxMonthly).toBe(1000);
    expect(o.runningMonthly).toBe(26312.5);
    expect(o.totalMonthly).toBe(49312.5);
    expect(o.totalCost).toBe(300_000 + 1_380_000 + 26312.5 * 60);
  });
  it('cash purchase has no loan', () => {
    const o = calcOwnership({ price: 500000, downPayment: 500000, termMonths: 0, ratePct: 0, consumption: 8, monthlyKm: 1000, fuelPrice: 60, maintenanceMonthly: 0, insuranceYearly: 0, taxYearly: 0, repairReserveMonthly: 0 });
    expect(o.loanPayment).toBe(0);
    expect(o.totalMonthly).toBe(4800);
    expect(o.totalCost).toBe(500000 + 4800 * 60);
  });
});

describe('finance', () => {
  const ops = [
    op({ type: 'income', amount: 150000, date: '2026-10-02', category: 'Зарплата' }),
    op({ amount: 1200, date: '2026-10-03', category: 'Топливо' }),
    op({ amount: 800, date: '2026-10-04', category: 'Топливо' }),
    op({ amount: 5000, date: '2026-09-10', category: 'Продукты' }),
    op({ type: 'income', amount: 100000, date: '2026-09-02' }),
  ];
  it('month stats and categories', () => {
    expect(monthStats(ops, '2026-10')).toEqual({ key: '2026-10', income: 150000, expense: 2000, free: 148000 });
    expect(byCategory(ops, 'expense', '2026-10')).toEqual([{ category: 'Топливо', value: 2000 }]);
  });
  it('monthly average uses completed months', () => {
    expect(monthlyAverage(ops, 3, '2026-10-05')).toEqual({ income: 100000, expense: 5000, months: 1 });
  });
  it('forecast table', () => {
    const sim = simulatePayoff([debt({ balance: 550000, min_payment: 30000 })], 30000);
    const rows = buildForecast(sim.series, sim.months !== null, 71500, 30000);
    expect(rows.map(r => r.debt)).toEqual([370000, 190000, 0, 0]);
    expect(rows[0].cash).toBe(124500);
  });
});

describe('what-if', () => {
  it('recomputes on every change', () => {
    const base = { income: 150000, livingExpenses: 60000, debtTotal: 550000, debtPayment: 30000, debtRate: 0, extraDebtPayment: 0, savings: 400000, carPrice: 0, downPayment: 0, termMonths: 60, ratePct: 0, carRunningMonthly: 0 };
    const none = calcWhatIf(base);
    expect(none.freeAfter).toBe(60000);
    const car = calcWhatIf({ ...base, carPrice: 1_680_000, downPayment: 300_000, carRunningMonthly: 20000 });
    expect(car.carLoanPayment).toBe(23000);
    expect(car.freeAfter).toBe(17000);
    expect(car.savingsAfterDown).toBe(100000);
    expect(car.obligationShare).toBeCloseTo(53000 / 150000);
    const more = calcWhatIf({ ...base, extraDebtPayment: 10000 });
    expect(more.debtMonths!).toBeLessThan(none.debtMonths!);
  });
});

describe('quick entry parser', () => {
  it('parses the example from the spec', () => {
    expect(parseQuickEntry('+1200 бензин')).toEqual({ type: 'expense', amount: 1200, category: 'Топливо', note: 'Бензин', section: 'Автомобиль' });
  });
  it('handles income, suffixes and other order', () => {
    expect(parseQuickEntry('зарплата 150к')).toMatchObject({ type: 'income', amount: 150000, category: 'Зарплата' });
    expect(parseQuickEntry('кофе 250,5')).toMatchObject({ type: 'expense', amount: 250.5, category: 'Другое' });
    expect(parseQuickEntry('продукты 1 250')).toMatchObject({ amount: 1250, category: 'Продукты', section: 'Финансы' });
  });
  it('rejects text without amount', () => {
    expect(parseQuickEntry('просто текст')).toBeNull();
    expect(parseQuickEntry('')).toBeNull();
  });
});

describe('calendar events and notifications', () => {
  const recurring: RecurringPayment[] = [
    { id: 'r1', ...base, title: 'МТС', amount: 10700, kind: 'expense', category: 'Связь', frequency: 'monthly', day_of_month: 5, next_date: '2026-10-05', active: true, comment: '' },
    { id: 'r2', ...base, title: 'Зарплата', amount: 150000, kind: 'income', category: 'Зарплата', frequency: 'monthly', day_of_month: 2, next_date: '2026-10-02', active: true, comment: '' },
  ];
  const d = debt({ id: 'k', name: 'Кредит', balance: 90000, min_payment: 30000, next_payment_date: '2026-10-20' });
  const src = { recurring, debts: [d], reminders: [], cars: [], goals: [] };
  it('builds a month calendar', () => {
    const ev = buildEvents(src, '2026-10-01', '2026-10-31', '2026-10-02');
    expect(ev.map(e => [e.date, e.title, e.amount])).toEqual([
      ['2026-10-02', 'Зарплата', 150000], ['2026-10-05', 'МТС', -10700], ['2026-10-20', 'Кредит', -30000],
    ]);
  });
  it('stops debt payments when the balance is covered', () => {
    const ev = buildEvents(src, '2026-10-01', '2027-03-31', '2026-10-02').filter(e => e.kind === 'debt');
    expect(ev).toHaveLength(3);
  });
  it('creates notifications from live data', () => {
    const ev = buildEvents(src, '2026-10-01', '2026-10-31', '2026-10-04');
    const n = buildCandidates({ events: ev, reminders: [], cars: [], goals: [], tasks: [], today: '2026-10-04' });
    expect(n.map(x => x.title)).toContain('Платёж завтра: МТС');
  });
});

describe('export', () => {
  it('escapes csv cells and adds a BOM', () => {
    const csv = toCSV([{ a: 'x;y', b: 'say "hi"', c: 5 }], [
      { header: 'A', value: r => r.a }, { header: 'B', value: r => r.b }, { header: 'C', value: r => r.c },
    ]);
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('"x;y";"say ""hi""";5');
  });
});
