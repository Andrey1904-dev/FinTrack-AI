import { BookOpen, CalendarCheck, Car, Plus, Wallet } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageSkeleton, Progress } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useSaveRow } from '@/data/hooks';
import { TaskForm } from '@/features/forms/TaskForm';
import { useOverview } from '@/features/overview/useOverview';
import { TaskRow } from '@/features/tasks/TasksPage';
import { reminderState } from '@/lib/calc';
import { addDaysISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDateLong, greeting, money, relativeDays } from '@/lib/format';
import type { Task } from '@/types';

export default function TodayPage() {
  const o = useOverview();
  const saveTopic = useSaveRow('learning_topics');
  const toast = useToast();
  const [edit, setEdit] = useState<Task | 'new' | null>(null);

  const soon = useMemo(() => o.events.filter(e => e.date <= addDaysISO(o.today, 3) && e.kind !== 'goal'), [o.events, o.today]);
  const carAlerts = useMemo(() => o.reminders
    .filter(r => r.status === 'active')
    .map(r => ({ r, car: o.cars.find(c => c.id === r.car_id), }))
    .filter((x): x is { r: typeof x.r; car: NonNullable<typeof x.car> } => !!x.car)
    .map(x => ({ ...x, st: reminderState(x.r, x.car.mileage, o.today) }))
    .filter(x => x.st.level !== 'ok'), [o.reminders, o.cars, o.today]);
  let nextTopic: { track: string; topic: (typeof o.topics)[number] } | null = null;
  for (const tr of o.tracks) {
    const t = o.topics.filter(x => x.track_id === tr.id && !x.done).sort((x, y) => x.position - y.position)[0];
    if (t) { nextTopic = { track: tr.title, topic: t }; break; }
  }

  if (o.loading) return <PageSkeleton />;
  if (o.error) return <ErrorState onRetry={() => void o.refetch()} />;

  const ratio = o.dayTotal ? (o.doneToday.length / o.dayTotal) * 100 : 0;
  const finishTopic = async () => {
    if (!nextTopic) return;
    try { await saveTopic.mutateAsync({ id: nextTopic.topic.id, done: true, done_at: new Date().toISOString() }); toast.success('Тема изучена'); } catch (e) { toast.error(friendlyError(e, 'Не удалось обновить тему')); }
  };
  const nothing = !o.dueToday.length && !soon.length && !carAlerts.length && !nextTopic;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Сегодня" subtitle={`${greeting()} · ${fmtDateLong(o.today)}`} actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Задача</Button>} />
      {nothing && o.doneToday.length === 0 && (
        <Card className="mb-4"><EmptyState icon={<CalendarCheck size={20} />} title="На сегодня ничего не запланировано" text="Добавьте задачу со сроком «сегодня» — и она появится здесь." action="Добавить задачу" onAction={() => setEdit('new')} /></Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader title="Задачи на сегодня" action={o.dayTotal > 0 ? <span className="text-xs text-muted tabular">{o.doneToday.length} из {o.dayTotal}</span> : undefined} />
          {o.dayTotal > 0 && <div className="px-4 pt-2"><Progress value={ratio} tone={ratio === 100 ? 'good' : 'accent'} label="Выполнено за сегодня" /></div>}
          {o.dueToday.length === 0 && o.doneToday.length === 0 ? <p className="px-4 py-5 text-sm text-muted">Нет задач на сегодня.</p> : (
            <ul className="mt-1 divide-y divide-line">
              {[...o.dueToday, ...o.doneToday].map(t => <TaskRow key={t.id} task={t} onEdit={setEdit} />)}
            </ul>
          )}
          {o.dueToday.length === 0 && o.doneToday.length > 0 && <p className="px-4 pb-4 text-sm text-good">Всё сделано. Хороший день.</p>}
        </Card>

        <Card>
          <CardHeader title="Платежи и события" action={<Link to="/finance" className="text-xs text-accent hover:underline">Календарь</Link>} />
          {soon.length === 0 ? <p className="px-4 py-5 text-sm text-muted">В ближайшие 3 дня платежей нет.</p> : (
            <ul className="mt-1 divide-y divide-line">
              {soon.map(e => (
                <li key={e.id}><Link to={e.link} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/60">
                  <Wallet size={16} className="shrink-0 text-muted" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm">{e.title}</p><p className={e.overdue ? 'text-xs text-bad' : 'text-xs text-muted'}>{relativeDays(e.date, o.today)}</p></div>
                  {e.amount !== null && <span className={`tabular text-sm font-medium ${e.amount > 0 ? 'text-good' : ''}`}>{money(e.amount, { sign: true })}</span>}
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Авто" action={<Link to="/cars" className="text-xs text-accent hover:underline">Открыть</Link>} />
            {carAlerts.length === 0 ? <p className="px-4 py-5 text-sm text-muted">Ничего срочного по автомобилю.</p> : (
              <ul className="mt-1 divide-y divide-line">
                {carAlerts.map(({ r, car, st }) => (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3"><Car size={16} className="shrink-0 text-muted" />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm">{r.title}</p><p className="text-xs text-muted">{car.name}</p></div>
                    <Badge tone={st.level === 'overdue' ? 'bad' : 'warn'}>{st.label}</Badge></li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Обучение" action={<Link to="/learning" className="text-xs text-accent hover:underline">Все темы</Link>} />
            {!nextTopic ? <p className="px-4 py-5 text-sm text-muted">Нет невыполненных тем.</p> : (
              <div className="flex items-center gap-3 px-4 py-3"><BookOpen size={16} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm">{nextTopic.topic.title}</p><p className="text-xs text-muted">{nextTopic.track}</p></div>
                <Button size="sm" onClick={() => void finishTopic()}>Изучено</Button></div>
            )}
          </Card>
        </div>
      </div>
      <Modal open={!!edit} onOpenChange={x => !x && setEdit(null)} title={edit && edit !== 'new' ? 'Изменить задачу' : 'Новая задача'}>
        {edit && <TaskForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? undefined : edit} defaults={{ due_date: o.today }} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
