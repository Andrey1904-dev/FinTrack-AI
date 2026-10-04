import { addDaysISO, addMonthsISO, daysBetween, monthKey, shiftMonthKey, todayISO } from '../dates';
import type { Car, CarReminder, Debt, Goal, RecurringPayment } from '@/types';
import type { SalaryProfile } from '@/types/salary';
import { occurrencesBetween } from './recurring';
import { calcAutoMonth } from './salary';

export type EventKind = 'income' | 'recurring' | 'debt' | 'car' | 'goal';

export interface CalendarEvent {
  id: string;
  date: string;
  title: string;
  /** signed: income is positive, payments negative; null when there is no amount */
  amount: number | null;
  kind: EventKind;
  overdue: boolean;
  link: string;
}

export interface EventSources {
  recurring: RecurringPayment[];
  debts: Debt[];
  reminders: CarReminder[];
  cars: Car[];
  goals: Goal[];
  salaryProfiles?: SalaryProfile[];
}

/** Everything financial that is planned between `from` and `to`: salaries, recurring payments, debt payments, dated car reminders, goal deadlines. */
export function buildEvents(src: EventSources, from: string, to: string, today: string = todayISO()): CalendarEvent[] {
  const out: CalendarEvent[] = [];

  // «Заяц»: planned income from automatic payroll profiles.
  // The month plan is split into an advance (advance_day of the month)
  // and the main payout (salary_day of the next month).
  if (src.salaryProfiles && src.salaryProfiles.length > 0) {
    const profiles = src.salaryProfiles.filter(p => p.active && p.mode === 'automatic');

    const currentMonth = monthKey(from < today ? from : today);
    const endMonth = monthKey(to);
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
          const half = Math.round(plan / 2);
          if ((advDate >= from && advDate <= to) || (advDate < today && from <= today)) {
            out.push({
              id: `sp-proj:${profile.id}:${advDate}`,
              date: advDate,
              title: `📈 Доход · Аванс (${profile.name})`,
              amount: half,
              kind: 'income',
              overdue: advDate < today,
              link: '/salary',
            });
          }
          if ((salDate >= from && salDate <= to) || (salDate < today && from <= today)) {
            out.push({
              id: `sp-proj:${profile.id}:${salDate}`,
              date: salDate,
              title: `📈 Доход · ${profile.name}`,
              amount: plan - half,
              kind: 'income',
              overdue: salDate < today,
              link: '/salary',
            });
          }
        }
      }
      m = shiftMonthKey(m, 1);
    }
  }

  for (const p of src.recurring) {
    for (const o of occurrencesBetween(p, from, to, today)) {
      out.push({
        id: `r:${p.id}:${o.date}`, date: o.date, title: p.title, amount: p.kind === 'income' ? p.amount : -p.amount,
        kind: p.kind === 'income' ? 'income' : 'recurring', overdue: o.overdue, link: '/finance',
      });
    }
  }

  for (const d of src.debts) {
    if (d.status !== 'active' || d.balance <= 0 || !d.next_payment_date) continue;
    const payments = d.min_payment > 0 ? Math.ceil(d.balance / d.min_payment) : 1;
    const day = Number(d.next_payment_date.slice(8, 10));
    let date = d.next_payment_date;
    for (let i = 0; i < Math.min(payments, 60) && date <= to; i++) {
      if (date >= from || (date < today && from <= today)) {
        out.push({
          id: `d:${d.id}:${date}`, date, title: d.organization ? `${d.name} · ${d.organization}` : d.name,
          amount: d.min_payment > 0 ? -Math.min(d.min_payment, d.balance) : null, kind: 'debt', overdue: date < today, link: '/debts',
        });
      }
      date = addMonthsISO(date, 1, day);
    }
  }

  const carName = new Map(src.cars.map(c => [c.id, c.name]));
  for (const r of src.reminders) {
    if (r.status !== 'active' || r.kind !== 'date' || !r.due_date) continue;
    if ((r.due_date >= from && r.due_date <= to) || (r.due_date < today && from <= today)) {
      out.push({
        id: `c:${r.id}`, date: r.due_date, title: `${carName.get(r.car_id) ?? 'Авто'} · ${r.title}`, amount: null,
        kind: 'car', overdue: r.due_date < today, link: '/cars',
      });
    }
  }

  for (const g of src.goals) {
    if (g.status !== 'active' || !g.deadline) continue;
    if (g.deadline >= from && g.deadline <= to) {
      out.push({ id: `g:${g.id}`, date: g.deadline, title: `Дедлайн цели: ${g.title}`, amount: null, kind: 'goal', overdue: false, link: '/goals' });
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function upcomingEvents(src: EventSources, days: number, today: string = todayISO()): CalendarEvent[] {
  return buildEvents(src, today, addDaysISO(today, days), today).filter(e => e.kind !== 'goal');
}

export function eventDays(e: CalendarEvent, today: string = todayISO()): number {
  return daysBetween(today, e.date);
}
