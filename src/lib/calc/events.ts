import { addDaysISO, addMonthsISO, daysBetween, todayISO } from '../dates';
import type { Car, CarReminder, Debt, Goal, RecurringPayment } from '@/types';
import { occurrencesBetween } from './recurring';

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
}

/** Everything financial that is planned between `from` and `to`: salaries, recurring payments, debt payments, dated car reminders, goal deadlines. */
export function buildEvents(src: EventSources, from: string, to: string, today: string = todayISO()): CalendarEvent[] {
  const out: CalendarEvent[] = [];

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
