import { addDaysISO, addMonthsISO, daysBetween, fromISO, todayISO } from '../dates';
import type { Frequency, RecurringPayment } from '@/types';

export function advance(date: string, frequency: Frequency, dayOfMonth?: number | null): string {
  switch (frequency) {
    case 'weekly':
      return addDaysISO(date, 7);
    case 'yearly':
      return addMonthsISO(date, 12, dayOfMonth ?? undefined);
    default:
      return addMonthsISO(date, 1, dayOfMonth ?? undefined);
  }
}

export interface Occurrence {
  date: string;
  payment: RecurringPayment;
  overdue: boolean;
}

/** All planned occurrences of a recurring payment inside [from, to] (inclusive). An overdue next_date is included once. */
export function occurrencesBetween(p: RecurringPayment, from: string, to: string, today: string = todayISO()): Occurrence[] {
  if (!p.active) return [];
  const out: Occurrence[] = [];
  let date = p.next_date;
  let guard = 0;
  while (date <= to && guard++ < 800) {
    if (date >= from || (date < today && from <= today)) {
      out.push({ date, payment: p, overdue: date < today });
    }
    date = advance(date, p.frequency, p.day_of_month);
  }
  return out;
}

export function describeFrequency(p: Pick<RecurringPayment, 'frequency' | 'next_date' | 'day_of_month'>): string {
  const day = p.day_of_month ?? fromISO(p.next_date).getDate();
  switch (p.frequency) {
    case 'weekly':
      return 'каждую неделю';
    case 'yearly':
      return 'каждый год';
    default:
      return `каждый месяц, ${day} число`;
  }
}

export function nextPaymentIn(p: Pick<RecurringPayment, 'next_date'>, today: string = todayISO()): number {
  return daysBetween(today, p.next_date);
}

/** Monthly equivalent of a payment (for "obligations per month" figures). */
export function monthlyEquivalent(p: Pick<RecurringPayment, 'amount' | 'frequency'>): number {
  if (p.frequency === 'weekly') return (p.amount * 52) / 12;
  if (p.frequency === 'yearly') return p.amount / 12;
  return p.amount;
}
