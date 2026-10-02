import { useMemo } from 'react';
import { useRows } from '@/data/hooks';
import { addDaysISO, monthKey, todayISO } from '@/lib/dates';
import { buildEvents, debtProgress, monthStats, totalDebt, type CalendarEvent } from '@/lib/calc';
import type { Task } from '@/types';

/** One place that gathers the numbers the Dashboard, Today and notifications are made of. */
export function useOverview() {
  const ops = useRows('finance_operations');
  const recurring = useRows('recurring_payments');
  const debts = useRows('debts');
  const cars = useRows('cars');
  const reminders = useRows('car_reminders');
  const goals = useRows('financial_goals');
  const tasks = useRows('tasks');
  const tracks = useRows('learning_tracks');
  const topics = useRows('learning_topics');
  const all = [ops, recurring, debts, cars, reminders, goals, tasks, tracks, topics];
  const loading = all.some(q => q.isLoading);
  const error = all.find(q => q.error)?.error ?? null;

  const today = todayISO();
  const data = useMemo(() => {
    const stats = monthStats(ops.rows, monthKey(today));
    const sources = { recurring: recurring.rows, debts: debts.rows, reminders: reminders.rows, cars: cars.rows, goals: goals.rows };
    const events: CalendarEvent[] = buildEvents(sources, today, addDaysISO(today, 31), today);
    const dueToday = tasks.rows.filter((t: Task) => t.status === 'todo' && t.due_date !== null && t.due_date <= today);
    const doneToday = tasks.rows.filter((t: Task) => t.status === 'done' && t.completed_at && t.completed_at.slice(0, 10) === today);
    return {
      today,
      stats,
      debtTotal: totalDebt(debts.rows),
      debtProgress: debtProgress(debts.rows),
      events,
      sources,
      dueToday,
      doneToday,
      dayTotal: dueToday.length + doneToday.length,
    };
  }, [ops.rows, recurring.rows, debts.rows, cars.rows, reminders.rows, goals.rows, tasks.rows, today]);

  const refetch = () => Promise.all(all.map(q => q.refetch()));
  return {
    ...data,
    loading,
    error,
    refetch,
    ops: ops.rows,
    recurring: recurring.rows,
    debts: debts.rows,
    cars: cars.rows,
    reminders: reminders.rows,
    goals: goals.rows,
    tasks: tasks.rows,
    tracks: tracks.rows,
    topics: topics.rows,
  };
}
