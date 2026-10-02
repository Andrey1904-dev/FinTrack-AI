import { Car, ChevronDown, ChevronUp, Settings2, Target } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { CategoryBars, MonthBars } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageSkeleton, Progress, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { readLocalDashboard, useProfile, writeLocalDashboard, useRows } from '@/data/hooks';
import { CommandCopy } from '@/features/commands/CommandsPage';
import { QUICK_ACTIONS, useQuick } from '@/features/forms/QuickProvider';
import { useOverview } from '@/features/overview/useOverview';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { byCategory, carCosts, fuelStats, monthSeries, reminderState } from '@/lib/calc';
import { addDaysISO, fromISO, monthKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDateLong, fmtMonthShort, greeting, money, pct, progressBar, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardConfig } from '@/types';

export const BLOCKS: Array<{ id: string; label: string }> = [
  { id: 'finance', label: 'Финансы' },
  { id: 'upcoming', label: 'Ближайшие платежи' },
  { id: 'debts', label: 'Долги' },
  { id: 'car', label: 'Авто' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'goals', label: 'Цели' },
  { id: 'learning', label: 'Обучение' },
  { id: 'commands', label: 'Команды' },
];
const DEFAULT_HIDDEN = ['learning', 'commands'];

export function normalizeConfig(c: DashboardConfig): { order: string[]; hidden: string[] } {
  const ids = BLOCKS.map(b => b.id);
  const order = [...(c.order ?? []).filter(id => ids.includes(id)), ...ids.filter(id => !(c.order ?? []).includes(id))];
  return { order, hidden: c.hidden ?? (c.order ? [] : DEFAULT_HIDDEN) };
}

function BlockCard({ title, to, children, action }: { title: ReactNode; to?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} action={action ?? (to ? <Link to={to} className="text-xs text-muted hover:text-fg">Открыть →</Link> : undefined)} />
      <div className="flex-1 p-4 pt-3">{children}</div>
    </Card>
  );
}

function FinanceBlock() {
  const o = useOverview();
  const series = useMemo(() => monthSeries(o.ops, 6, o.today), [o.ops, o.today]);
  const cats = useMemo(() => byCategory(o.ops, 'expense', monthKey(o.today)), [o.ops, o.today]);
  const { stats } = o;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Доход за месяц" value={money(stats.income)} />
        <Stat label="Расходы" value={money(stats.expense)} />
        <Stat label="Свободно" value={money(stats.free)} tone={stats.free < 0 ? 'bad' : 'good'} />
        <Stat label="Долги" value={money(o.debtTotal)} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <BlockCard title="Расходы по категориям" to="/finance">
          {cats.length ? <CategoryBars items={cats} limit={6} /> : <EmptyState title="Расходов пока нет" text={'Добавьте первый расход,\nчтобы начать отслеживать деньги.'} />}
        </BlockCard>
        <BlockCard title="Доходы и расходы, 6 месяцев" to="/finance">
          {series.some(s => s.income || s.expense)
            ? <><MonthBars data={series.map(s => ({ label: fmtMonthShort(s.key), income: s.income, expense: s.expense }))} />
                <div className="mt-2 flex gap-4 text-xs text-muted"><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-good" />Доходы</span><span><i className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-bad" />Расходы</span></div></>
            : <EmptyState title="Пока нечего показывать" text="График появится, когда будут первые операции." />}
        </BlockCard>
      </div>
    </div>
  );
}

function UpcomingBlock() {
  const o = useOverview();
  const items = o.events.filter(e => e.kind !== 'goal').slice(0, 7);
  return (
    <BlockCard title="Ближайшие платежи и события" to="/finance">
      {items.length === 0 ? <EmptyState title="Платежей на ближайший месяц нет" text="Добавьте повторяющиеся платежи в разделе «Финансы» — они появятся здесь сами." /> : (
        <ul className="-mx-1 divide-y divide-line">
          {items.map(e => (
            <li key={e.id} className="flex items-center gap-3 px-1 py-2.5">
              <div className="w-12 shrink-0 text-xs text-muted">{fromISO(e.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' }).replace('.', '')}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm">{e.title}</p><p className={cn('text-xs', e.overdue ? 'text-bad' : 'text-muted')}>{relativeDays(e.date, o.today)}</p></div>
              {e.amount !== null && <span className={cn('tabular text-sm font-medium', e.amount > 0 ? 'text-good' : '')}>{money(e.amount, { sign: true })}</span>}
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  );
}

function DebtsBlock() {
  const o = useOverview();
  const active = o.debts.filter(d => d.status === 'active');
  const next = active.filter(d => d.next_payment_date).sort((a, b) => a.next_payment_date!.localeCompare(b.next_payment_date!))[0];
  return (
    <BlockCard title="Долги" to="/debts">
      {active.length === 0 ? <EmptyState title="Долгов нет" text="Если они появятся — добавьте их, и я покажу прогресс погашения." /> : (
        <div className="space-y-3">
          <div><p className="text-xs text-muted">Общий долг</p><p className="tabular text-2xl font-semibold">{money(o.debtTotal)}</p></div>
          <div>
            <Progress value={o.debtProgress * 100} tone="good" label="Прогресс погашения" />
            <p className="mt-1.5 text-xs text-muted"><span className="font-mono tracking-tighter">{progressBar(o.debtProgress, 14)}</span> {pct(o.debtProgress * 100)} погашено</p>
          </div>
          {next && <p className="text-sm text-muted">Ближайший платёж: <span className="text-fg">{next.name}</span> — {relativeDays(next.next_payment_date, o.today)}</p>}
        </div>
      )}
    </BlockCard>
  );
}

function CarBlock() {
  const o = useOverview();
  const refuels = useRows('car_refuels').rows;
  const expenses = useRows('car_expenses').rows;
  const service = useRows('car_service').rows;
  const car = o.cars.find(c => c.is_current) ?? o.cars[0];
  if (!car) return <BlockCard title="Авто" to="/cars"><EmptyState icon={<Car size={20} />} title="Автомобиль не добавлен" text="Добавьте машину, чтобы видеть расход, обслуживание и реальную стоимость владения." /></BlockCard>;
  const mine = (rows: typeof refuels) => rows.filter(r => r.car_id === car.id);
  const stats = fuelStats(mine(refuels), o.today);
  const costs = carCosts({ refuels: mine(refuels), expenses: expenses.filter(e => e.car_id === car.id), service: service.filter(s => s.car_id === car.id) }, addDaysISO(o.today, -90), o.today);
  const rem = o.reminders.filter(r => r.car_id === car.id && r.status === 'active').map(r => ({ r, s: reminderState(r, car.mileage, o.today) }))
    .sort((a, b) => (a.s.level === 'ok' ? 1 : 0) - (b.s.level === 'ok' ? 1 : 0)).slice(0, 3);
  return (
    <BlockCard title={`Авто · ${car.name}`} to="/cars">
      <p className="text-xs text-muted">{[car.year, car.engine, `${car.mileage.toLocaleString('ru-RU')} км`].filter(Boolean).join(' · ')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div><p className="text-xs text-muted">Стоит в месяц</p><p className="tabular text-lg font-semibold">{costs.total ? money(costs.perMonth) : '—'}</p></div>
        <div><p className="text-xs text-muted">Расход</p><p className="tabular text-lg font-semibold">{stats.consumption ? `${stats.consumption} л/100` : '—'}</p></div>
      </div>
      {rem.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
          {rem.map(({ r, s }) => <li key={r.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{r.title}</span><Badge tone={s.level === 'overdue' ? 'bad' : s.level === 'soon' ? 'warn' : 'neutral'}>{s.label}</Badge></li>)}
        </ul>
      )}
    </BlockCard>
  );
}

function TasksBlock() {
  const o = useOverview();
  const { toggle } = useTaskActions();
  const quick = useQuick();
  const list = o.dueToday.slice(0, 6);
  return (
    <BlockCard title="Задачи на сегодня" to="/tasks">
      {list.length === 0 ? <EmptyState title="На сегодня задач нет" action="Добавить задачу" onAction={() => quick.open('task')} /> : (
        <ul className="space-y-1">
          {list.map(t => (
            <li key={t.id} className="flex items-center gap-3 rounded-lg py-1.5">
              <input type="checkbox" checked={false} onChange={() => void toggle(t)} aria-label={`Выполнено: ${t.title}`} className="h-[18px] w-[18px] shrink-0 rounded accent-[hsl(var(--accent))]" />
              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
              {t.due_date && t.due_date < o.today && <Badge tone="bad">просрочено</Badge>}
            </li>
          ))}
        </ul>
      )}
    </BlockCard>
  );
}

function GoalsBlock() {
  const o = useOverview();
  const goals = o.goals.filter(g => g.status === 'active').slice(0, 3);
  return (
    <BlockCard title="Цели" to="/goals">
      {goals.length === 0 ? <EmptyState icon={<Target size={20} />} title="Целей пока нет" text="Поставьте цель — например, накопить резерв." /> : (
        <ul className="space-y-4">
          {goals.map(g => {
            const p = g.target_amount ? (g.current_amount / g.target_amount) * 100 : 0;
            return (
              <li key={g.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-2 text-sm"><span className="truncate">{g.title}</span><span className="tabular text-xs text-muted">{pct(Math.min(100, p))}</span></div>
                <Progress value={p} label={g.title} />
                <p className="mt-1 text-xs text-muted">Осталось {money(Math.max(0, g.target_amount - g.current_amount))}</p>
              </li>
            );
          })}
        </ul>
      )}
    </BlockCard>
  );
}

function LearningBlock() {
  const o = useOverview();
  return (
    <BlockCard title="Обучение" to="/learning">
      {o.tracks.length === 0 ? <EmptyState title="Направлений пока нет" text="Добавьте то, что изучаете: Linux, Python, Docker…" /> : (
        <ul className="space-y-3">
          {o.tracks.slice(0, 4).map(t => {
            const ts = o.topics.filter(x => x.track_id === t.id);
            const done = ts.filter(x => x.done).length;
            const next = ts.find(x => !x.done);
            const p = ts.length ? (done / ts.length) * 100 : 0;
            return (
              <li key={t.id}>
                <div className="mb-1 flex justify-between gap-2 text-sm"><span>{t.title}</span><span className="tabular text-xs text-muted">{Math.round(p)}%</span></div>
                <Progress value={p} label={t.title} />
                {next && <p className="mt-1 text-xs text-muted">Дальше: {next.title}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </BlockCard>
  );
}

function CommandsBlock() {
  const cmds = useRows('commands').rows.slice(0, 3);
  return (
    <BlockCard title="Полезные команды" to="/commands">
      {cmds.length === 0 ? <EmptyState title="Команд пока нет" text="Сохраните команды, которые приходится искать снова и снова." /> : <div className="space-y-2">{cmds.map(c => <CommandCopy key={c.id} command={c.command} description={c.description} />)}</div>}
    </BlockCard>
  );
}

const RENDER: Record<string, () => ReactNode> = {
  finance: () => <FinanceBlock />, upcoming: () => <UpcomingBlock />, debts: () => <DebtsBlock />, car: () => <CarBlock />,
  tasks: () => <TasksBlock />, goals: () => <GoalsBlock />, learning: () => <LearningBlock />, commands: () => <CommandsBlock />,
};
const FULL_WIDTH = new Set(['finance']);

export default function Dashboard() {
  const o = useOverview();
  const quick = useQuick();
  const toast = useToast();
  const { profile, save } = useProfile();
  const [edited, setEdited] = useState<DashboardConfig | null>(null);
  const [cached] = useState<DashboardConfig>(() => readLocalDashboard());
  const [editing, setEditing] = useState(false);

  // the profile is the source of truth across devices; the local copy makes the first paint instant
  const remote = profile?.dashboard_config && (profile.dashboard_config.order || profile.dashboard_config.hidden) ? profile.dashboard_config : null;
  const local = edited ?? remote ?? cached;

  const cfg = normalizeConfig(local);
  const persist = (next: { order: string[]; hidden: string[] }) => {
    setEdited(next);
    writeLocalDashboard(next);
    save.mutate({ dashboard_config: next }, { onError: e => toast.error(friendlyError(e, 'Не удалось сохранить настройки главной')) });
  };
  const move = (id: string, dir: -1 | 1) => {
    const order = [...cfg.order];
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    persist({ ...cfg, order });
  };
  const toggleHidden = (id: string) => persist({ ...cfg, hidden: cfg.hidden.includes(id) ? cfg.hidden.filter(x => x !== id) : [...cfg.hidden, id] });

  if (o.loading && !o.ops.length && !o.debts.length) return <PageSkeleton />;
  if (o.error && !o.ops.length) return <ErrorState onRetry={() => void o.refetch()} />;

  const visible = cfg.order.filter(id => !cfg.hidden.includes(id));
  const progress = o.dayTotal ? o.doneToday.length / o.dayTotal : null;
  const now = new Date();

  return (
    <div className="animate-fade-in space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{greeting(now)}</h1>
          <p className="mt-1 text-sm text-muted">{fmtDateLong(o.today)}</p>
        </div>
        <Link to="/today" className="card min-w-[220px] px-4 py-3 transition-colors hover:border-muted/40">
          <p className="text-xs text-muted">Сегодня</p>
          {progress === null ? <p className="mt-1 text-sm">Дел на сегодня нет</p> : (
            <><p className="mt-1 font-mono text-sm tracking-tighter text-accent">{progressBar(progress)} <span className="font-sans tracking-normal text-fg">{Math.round(progress * 100)}%</span></p>
              <p className="mt-0.5 text-xs text-muted">{o.doneToday.length} из {o.dayTotal} выполнено</p></>
          )}
        </Link>
      </section>

      <section aria-label="Быстрые действия" className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map(a => <Button key={a.kind} size="sm" onClick={() => quick.open(a.kind)}>+ {a.label}</Button>)}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map(id => (
          <div key={id} className={cn(FULL_WIDTH.has(id) && 'lg:col-span-2')}>{RENDER[id]()}</div>
        ))}
      </div>
      {visible.length === 0 && <EmptyState title="Все блоки скрыты" text="Включите нужные блоки в настройках главной." />}

      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}><Settings2 size={15} /> Настроить главную</Button>
      </div>

      <Modal open={editing} onOpenChange={setEditing} title="Настройка главной" description="Скрывайте ненужные блоки и меняйте порядок.">
        <ul className="divide-y divide-line">
          {cfg.order.map((id, i) => {
            const b = BLOCKS.find(x => x.id === id)!;
            return (
              <li key={id} className="flex items-center gap-3 py-2">
                <input id={`blk-${id}`} type="checkbox" checked={!cfg.hidden.includes(id)} onChange={() => toggleHidden(id)} className="h-4 w-4 accent-[hsl(var(--accent))]" />
                <label htmlFor={`blk-${id}`} className="flex-1 text-sm">{b.label}</label>
                <Button variant="ghost" size="icon" aria-label={`${b.label}: выше`} disabled={i === 0} onClick={() => move(id, -1)}><ChevronUp size={16} /></Button>
                <Button variant="ghost" size="icon" aria-label={`${b.label}: ниже`} disabled={i === cfg.order.length - 1} onClick={() => move(id, 1)}><ChevronDown size={16} /></Button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}

