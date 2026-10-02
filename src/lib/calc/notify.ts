import { daysBetween, todayISO } from '../dates';
import { money, relativeDays } from '../format';
import type { Car, CarReminder, Goal, Task } from '@/types';
import { reminderState } from './car';
import type { CalendarEvent } from './events';

export interface Candidate {
  key: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
  icon: string;
  title: string;
  body: string;
  link: string;
}

function isoWeek(d: string): string {
  const date = new Date(d + 'T12:00:00');
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const firstThursday = new Date(date.getFullYear(), 0, 4, 12);
  const week = 1 + Math.round(((date.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);
  return `${date.getFullYear()}-W${week}`;
}

/** Internal notifications are derived from live data, so their text is never stale. */
export function buildCandidates(input: {
  events: CalendarEvent[];
  reminders: CarReminder[];
  cars: Car[];
  goals: Goal[];
  tasks: Task[];
  today?: string;
}): Candidate[] {
  const today = input.today ?? todayISO();
  const out: Candidate[] = [];

  for (const e of input.events) {
    const d = daysBetween(today, e.date);
    if (d > 3) continue;
    const when = relativeDays(e.date, today);
    const amount = e.amount !== null ? ` ${money(e.amount, { sign: true })}` : '';
    if (e.kind === 'debt') {
      out.push({
        key: `pay:${e.id}`, severity: d <= 1 ? 'danger' : 'warning', icon: '⚠️',
        title: d < 0 ? `Платёж по долгу просрочен: ${e.title}` : d === 0 ? `Сегодня платёж: ${e.title}` : d === 1 ? `Завтра платёж по долгу: ${e.title}` : `Платёж по долгу ${when}: ${e.title}`,
        body: amount.trim(), link: e.link,
      });
    } else if (e.kind === 'income') {
      out.push({ key: `inc:${e.id}`, severity: 'success', icon: '💰', title: d <= 0 ? `Сегодня: ${e.title}` : `${e.title} — ${when}`, body: amount.trim(), link: e.link });
    } else if (e.kind === 'recurring') {
      out.push({
        key: `pay:${e.id}`, severity: d <= 1 ? 'warning' : 'info', icon: '📅',
        title: d < 0 ? `Платёж просрочен: ${e.title}` : `Платёж ${when}: ${e.title}`, body: amount.trim(), link: e.link,
      });
    } else if (e.kind === 'car') {
      out.push({ key: `car:${e.id}`, severity: d < 0 ? 'danger' : 'warning', icon: '🚗', title: `${e.title} — ${when}`, body: '', link: e.link });
    }
  }

  const mileageOf = new Map(input.cars.map(c => [c.id, c.mileage]));
  for (const r of input.reminders) {
    if (r.status !== 'active' || r.kind !== 'mileage') continue;
    const st = reminderState(r, mileageOf.get(r.car_id) ?? 0, today);
    if (st.level === 'ok') continue;
    out.push({
      key: `km:${r.id}:${r.due_mileage}`, severity: st.level === 'overdue' ? 'danger' : 'warning', icon: '🚗',
      title: st.level === 'overdue' ? `${r.title}: ${st.label}` : `Через ${st.remaining} км: ${r.title.toLowerCase()}`, body: '', link: '/cars',
    });
  }

  const week = isoWeek(today);
  const goal = input.goals
    .filter(g => g.status === 'active' && g.target_amount > g.current_amount)
    .sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'))[0];
  if (goal) {
    out.push({
      key: `goal:${goal.id}:${week}`, severity: 'info', icon: '🎯',
      title: `До цели «${goal.title}» осталось ${money(goal.target_amount - goal.current_amount)}`, body: '', link: '/goals',
    });
  }

  const overdue = input.tasks.filter(t => t.status === 'todo' && t.due_date && t.due_date < today);
  if (overdue.length) {
    out.push({
      key: `tasks:${today}`, severity: 'warning', icon: '✅',
      title: overdue.length === 1 ? `Просрочена задача: ${overdue[0].title}` : `Просрочено задач: ${overdue.length}`, body: '', link: '/tasks',
    });
  }
  return out;
}
