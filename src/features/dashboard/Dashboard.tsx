import { Car, ChevronDown, ChevronUp, Settings2, Target } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { CategoryBars, MonthBars } from '@/components/charts/charts';
import { Button, IconButton } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, Meter, PageSkeleton, Panel, PanelLink, Progress, Readout, Share } from '@/components/ui/misc';
import { Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { readLocalDashboard, useProfile, writeLocalDashboard, useRows } from '@/data/hooks';
import { CommandCopy } from '@/features/commands/CommandsPage';
import { QUICK_ACTIONS, useQuick } from '@/features/forms/QuickProvider';
import { useOverview } from '@/features/overview/useOverview';
import { useTaskActions } from '@/features/tasks/useTaskActions';
import { byCategory, carCosts, fuelStats, monthSeries, reminderState } from '@/lib/calc';
import { addDaysISO, fromISO, monthKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDateLong, fmtMonthShort, greeting, money, pct, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DashboardConfig } from '@/types';
import { CashFlowDashboardCard } from '@/features/finance/CashFlowPanel';
import { SalaryDashboardCard } from '@/features/salary/SalaryDashboardCard';

export const BLOCKS: Array<{ id: string; label: string }> = [
  { id: 'salary', label: 'Зарплата' },
  { id: 'finance', label: 'Финансы' },
  { id: 'cashflow', label: 'Денежный прогноз' },
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

/* ============================== BLOCKS ============================= */

function BlockPanel({
  label,
  to,
  children,
  action,
  className,
  delay,
}: {
  label: string;
  to?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <Panel
      label={label}
      delay={delay}
      className={cn('flex flex-col', className)}
      right={action ?? (to ? <PanelLink to={to}>Открыть →</PanelLink> : undefined)}
    >
      <div className="flex-1">{children}</div>
    </Panel>
  );
}

function FinanceBlock() {
  const o = useOverview();
  const series = useMemo(() => monthSeries(o.ops, 6, o.today), [o.ops, o.today]);
  const cats = useMemo(() => byCategory(o.ops, 'expense', monthKey(o.today)), [o.ops, o.today]);
  const hasSeries = series.some(s => s.income || s.expense);
  return (
    <Panel label="Движение денег" screw right={<PanelLink to="/finance">Финансы →</PanelLink>}>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <p className="silk mb-3">Доходы и расходы · 6 месяцев</p>
          {hasSeries ? (
            <MonthBars data={series.map(s => ({ label: fmtMonthShort(s.key), income: s.income, expense: s.expense }))} />
          ) : (
            <EmptyState compact title="Пока нечего показывать" text="График появится, когда будут первые операции." />
          )}
        </div>
        <div className="min-w-0">
          <p className="silk mb-3">Структура расходов · {fmtMonthShort(monthKey(o.today))}</p>
          {cats.length ? (
            <CategoryBars items={cats} limit={6} />
          ) : (
            <EmptyState compact title="Расходов пока нет" text={'Добавьте первый расход,\nчтобы начать отслеживать деньги.'} />
          )}
        </div>
      </div>
    </Panel>
  );
}

function UpcomingBlock() {
  const o = useOverview();
  const items = o.events.filter(e => e.kind !== 'goal').slice(0, 7);
  const total = items.reduce((s, e) => s + (e.amount !== null && e.amount < 0 ? -e.amount : 0), 0);
  return (
    <BlockPanel label="Ближайшие платежи" to="/finance" delay={60}>
      {items.length === 0 ? (
        <EmptyState compact title="Платежей на ближайший месяц нет" text="Добавьте повторяющиеся платежи в разделе «Финансы» — они появятся здесь сами." />
      ) : (
        <>
          <ul className="space-y-0">
            {items.map(e => (
              <li key={e.id} className="flex items-center gap-3 border-b border-line/70 py-2.5 last:border-0">
                <div className="w-10 shrink-0 text-center">
                  <div className={cn('tnum text-[15px] leading-none', e.overdue ? 'text-red' : 'text-txt')}>{e.date.slice(8)}</div>
                  <div className="silk mt-1 text-[7.5px]">
                    {fromISO(e.date).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] text-txt">{e.title}</p>
                  <p className={cn('silk mt-1', e.overdue && 'text-red')}>{relativeDays(e.date, o.today)}</p>
                </div>
                {e.amount !== null && (
                  <span className={cn('tnum shrink-0 text-[13px]', e.amount > 0 ? 'text-cyan' : 'text-red')}>{money(e.amount, { sign: true })}</span>
                )}
              </li>
            ))}
          </ul>
          {total > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
              <span className="silk">Всего к оплате</span>
              <span className="tnum text-[14px] text-red">−{money(total).replace('−', '')}</span>
            </div>
          )}
        </>
      )}
    </BlockPanel>
  );
}

function DebtsBlock() {
  const o = useOverview();
  const active = o.debts.filter(d => d.status === 'active');
  const next = active
    .filter(d => d.next_payment_date)
    .sort((a, b) => a.next_payment_date!.localeCompare(b.next_payment_date!))[0];
  const monthly = active.reduce((s, d) => s + d.min_payment, 0);
  return (
    <BlockPanel label="Долговая нагрузка" to="/debts" delay={90}>
      {active.length === 0 ? (
        <EmptyState compact title="Долгов нет" text="Если они появятся — добавьте их, и я покажу прогресс погашения." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="silk mb-2">Общий долг</p>
              <Readout value={o.debtTotal} tone="cyan" size="lg" />
            </div>
            <div className="text-right">
              <p className="silk mb-2">Погашено</p>
              <p className="disp text-[26px] leading-none text-amber">{Math.round(o.debtProgress * 100)}%</p>
            </div>
          </div>
          <Share value={o.debtProgress * 100} tone="#31D3C4" h={7} />
          <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div>
              <dt className="silk mb-1.5">Минимум в месяц</dt>
              <dd className="tnum text-[14px] text-txt">{money(monthly)}</dd>
            </div>
            <div>
              <dt className="silk mb-1.5">Активных</dt>
              <dd className="tnum text-[14px] text-txt">{active.length}</dd>
            </div>
          </dl>
          {next && (
            <p className="text-[11.5px] text-mute">
              Ближайший платёж: <span className="text-dim">{next.name}</span> — {relativeDays(next.next_payment_date, o.today)}
            </p>
          )}
        </div>
      )}
    </BlockPanel>
  );
}

function CarBlock() {
  const o = useOverview();
  const carHistory = { from: addDaysISO(o.today, -90), to: o.today };
  const refuels = useRows('car_refuels', { limit: 500 }).rows;
  const expenses = useRows('car_expenses', carHistory).rows;
  const service = useRows('car_service', carHistory).rows;
  const car = o.cars.find(c => c.is_current) ?? o.cars[0];
  if (!car)
    return (
      <BlockPanel label="Авто" to="/cars" delay={120}>
        <EmptyState
          icon={<Car size={17} />}
          compact
          title="Автомобиль не добавлен"
          text="Добавьте машину, чтобы видеть расход, обслуживание и реальную стоимость владения."
        />
      </BlockPanel>
    );
  const mine = <T extends { car_id: string }>(rows: T[]) => rows.filter(r => r.car_id === car.id);
  const stats = fuelStats(mine(refuels), o.today);
  const costs = carCosts(
    { refuels: mine(refuels), expenses: mine(expenses), service: mine(service) },
    addDaysISO(o.today, -90),
    o.today,
  );
  const rem = o.reminders
    .filter(r => r.car_id === car.id && r.status === 'active')
    .map(r => ({ r, s: reminderState(r, car.mileage, o.today) }))
    .sort((a, b) => (a.s.level === 'ok' ? 1 : 0) - (b.s.level === 'ok' ? 1 : 0))
    .slice(0, 3);

  return (
    <BlockPanel label={`Авто · ${car.name}`} to="/cars" delay={120}>
      <p className="silk">{[car.year, car.engine, `${car.mileage.toLocaleString('ru-RU')} км`].filter(Boolean).join(' · ')}</p>
      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <div>
          <dt className="silk mb-1.5">В месяц</dt>
          <dd className="tnum text-[14px] text-txt">{costs.total ? money(costs.perMonth) : '—'}</dd>
        </div>
        <div>
          <dt className="silk mb-1.5">Расход</dt>
          <dd className="tnum text-[14px] text-txt">{stats.consumption ? `${stats.consumption}` : '—'}</dd>
        </div>
        <div>
          <dt className="silk mb-1.5">За км</dt>
          <dd className="tnum text-[14px] text-amber">{costs.perKm ? money(costs.perKm, { decimals: true }) : '—'}</dd>
        </div>
      </dl>
      {rem.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3">
          {rem.map(({ r, s }) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-1">
              <span className="min-w-0 truncate text-[12.5px] text-dim">{r.title}</span>
              <Badge tone={s.level === 'overdue' ? 'bad' : s.level === 'soon' ? 'warn' : 'neutral'}>{s.label}</Badge>
            </li>
          ))}
        </ul>
      )}
    </BlockPanel>
  );
}

function TasksBlock() {
  const o = useOverview();
  const { toggle } = useTaskActions();
  const quick = useQuick();
  const list = o.dueToday.slice(0, 6);
  return (
    <BlockPanel label="Задачи на сегодня" to="/tasks" delay={150}>
      {list.length === 0 ? (
        <EmptyState compact title="На сегодня задач нет" action="Добавить задачу" onAction={() => quick.open('task')} />
      ) : (
        <ul className="-my-1">
          {list.map(t => (
            <li key={t.id}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 border-b border-line/70 py-1.5 last:border-0">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => void toggle(t)}
                  aria-label={`Выполнено: ${t.title}`}
                  className="h-[18px] w-[18px] shrink-0 rounded-[2px]"
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">{t.title}</span>
                {t.due_date && t.due_date < o.today && <Badge tone="bad">просрочено</Badge>}
              </label>
            </li>
          ))}
        </ul>
      )}
    </BlockPanel>
  );
}

function GoalsBlock() {
  const o = useOverview();
  const goals = o.goals.filter(g => g.status === 'active').slice(0, 3);
  return (
    <BlockPanel label="Цели" to="/goals" delay={180}>
      {goals.length === 0 ? (
        <EmptyState icon={<Target size={17} />} compact title="Целей пока нет" text="Поставьте цель — например, накопить резерв." />
      ) : (
        <ul className="space-y-4">
          {goals.map(g => {
            const p = g.target_amount ? (g.current_amount / g.target_amount) * 100 : 0;
            return (
              <li key={g.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] text-txt">{g.title}</span>
                  <span className="tnum shrink-0 text-[12px] text-amber">{pct(Math.min(100, p))}</span>
                </div>
                <Progress value={p} tone="accent" label={g.title} />
                <p className="silk mt-1.5">осталось {money(Math.max(0, g.target_amount - g.current_amount))}</p>
              </li>
            );
          })}
        </ul>
      )}
    </BlockPanel>
  );
}

function LearningBlock() {
  const o = useOverview();
  return (
    <BlockPanel label="Обучение" to="/learning" delay={210}>
      {o.tracks.length === 0 ? (
        <EmptyState compact title="Направлений пока нет" text="Добавьте то, что изучаете: Linux, Python, Docker…" />
      ) : (
        <ul className="space-y-3.5">
          {o.tracks.slice(0, 4).map(t => {
            const ts = o.topics.filter(x => x.track_id === t.id);
            const done = ts.filter(x => x.done).length;
            const next = ts.find(x => !x.done);
            const p = ts.length ? (done / ts.length) * 100 : 0;
            return (
              <li key={t.id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[12.5px] text-txt">{t.title}</span>
                  <span className="tnum shrink-0 text-[12px] text-mute">{Math.round(p)}%</span>
                </div>
                <Share value={p} tone="#31D3C4" h={5} />
                {next && <p className="silk mt-1.5 truncate">дальше · {next.title}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </BlockPanel>
  );
}

function CommandsBlock() {
  const cmds = useRows('commands').rows.slice(0, 3);
  return (
    <BlockPanel label="Полезные команды" to="/commands" delay={240}>
      {cmds.length === 0 ? (
        <EmptyState compact title="Команд пока нет" text="Сохраните команды, которые приходится искать снова и снова." />
      ) : (
        <div className="space-y-2">
          {cmds.map(c => (
            <CommandCopy key={c.id} command={c.command} description={c.description} />
          ))}
        </div>
      )}
    </BlockPanel>
  );
}

const RENDER: Record<string, () => ReactNode> = {
  salary: () => <SalaryDashboardCard />,
  finance: () => <FinanceBlock />,
  cashflow: () => <CashFlowDashboardCard />,
  upcoming: () => <UpcomingBlock />,
  debts: () => <DebtsBlock />,
  car: () => <CarBlock />,
  tasks: () => <TasksBlock />,
  goals: () => <GoalsBlock />,
  learning: () => <LearningBlock />,
  commands: () => <CommandsBlock />,
};
const FULL_WIDTH = new Set(['salary', 'finance']);

/* ============================ DASHBOARD ============================ */

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
  const progress = o.dayTotal ? (o.doneToday.length / o.dayTotal) * 100 : null;
  const now = new Date();
  const { stats } = o;

  const totals: Array<{ label: string; value: number; tone: 'txt' | 'amber' | 'cyan' | 'red'; note: string }> = [
    { label: 'Доход за месяц', value: stats.income, tone: 'txt', note: 'за текущий календарный месяц' },
    { label: 'Расходы', value: stats.expense, tone: 'red', note: stats.income ? `${Math.round((stats.expense / stats.income) * 100)}% дохода` : 'нет данных о доходе' },
    { label: 'Свободно', value: stats.free, tone: 'amber', note: 'можно распределить' },
    { label: 'Долги', value: o.debtTotal, tone: 'cyan', note: `погашено ${pct(o.debtProgress * 100)}` },
  ];

  return (
    <div className="space-y-6 lg:space-y-7">
      {/* ------------------------- bridge head ------------------------- */}
      <section className="rise flex flex-wrap items-end justify-between gap-x-8 gap-y-6">
        <div className="min-w-0">
          <p className="silk mb-2.5">Personal OS · панель управления</p>
          <h1 className="text-[28px] font-semibold leading-[1.04] tracking-[-0.025em] sm:text-[34px] lg:text-[38px]">{greeting(now)}</h1>
          <p className="tnum mt-2.5 text-[12px] text-dim">{fmtDateLong(o.today)}</p>
        </div>

        <div className="w-full min-w-0 sm:w-[300px]">
          <div className="mb-2.5 flex items-baseline gap-2.5">
            <span className="silk">Сегодня</span>
            {progress === null ? (
              <span className="silk-b text-mute">дел нет</span>
            ) : (
              <>
                <span className="disp text-[26px] leading-none text-amber">{Math.round(progress)}%</span>
                <span className="silk-b text-mute">
                  {o.doneToday.length} из {o.dayTotal}
                </span>
              </>
            )}
          </div>
          <Meter value={progress ?? 0} blocks={18} />
          <div className="mt-2.5 flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 rounded-full', progress === 100 ? 'bg-cyan' : 'bg-amber blink')} />
            <span className="silk-b text-mute">
              {progress === 100 ? 'всё закрыто · хороший день' : 'система в норме · данные из Supabase'}
            </span>
          </div>
        </div>
      </section>

      {/* -------------------------- meterbridge ------------------------ */}
      <section className="rise panel grid grid-cols-2 lg:grid-cols-4" style={{ animationDelay: '60ms' }} aria-label="Итоги месяца">
        {totals.map((t, i) => (
          <div
            key={t.label}
            className={cn(
              'min-w-0 px-4 py-4 sm:px-5 sm:py-5',
              i % 2 === 1 && 'border-l border-line',
              i < 2 && 'border-b border-line lg:border-b-0',
              i >= 2 && 'lg:border-l lg:border-line',
              i === 2 && 'border-b border-line lg:border-b-0',
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-[1px]"
                style={{ background: t.tone === 'txt' ? '#8D9A97' : t.tone === 'red' ? '#E2564D' : t.tone === 'amber' ? '#F0A828' : '#31D3C4' }}
              />
              <span className="silk truncate">{t.label}</span>
            </div>
            <div className="mt-3">
              <Readout value={t.value} tone={t.tone} size="xl" />
            </div>
            <p className="mt-2.5 line-clamp-2 text-[10.5px] leading-snug text-mute">{t.note}</p>
          </div>
        ))}
      </section>

      {/* ------------------------ quick actions ------------------------ */}
      <section className="rise" style={{ animationDelay: '100ms' }} aria-label="Быстрые действия">
        <div className="mb-3 flex items-center gap-3">
          <span className="silk whitespace-nowrap">Быстрые действия</span>
          <span className="h-px flex-1 bg-engrave/70" />
          <span className="silk-b hidden text-mute lg:block">ввод в 3 поля · до 8 секунд</span>
        </div>
        <div className="no-bar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.kind}
              type="button"
              onClick={() => quick.open(a.kind)}
              className="flex min-h-[44px] shrink-0 items-center gap-2 rounded-[2px] border border-line bg-rail/50 px-3.5 text-[12px] text-dim transition-colors hover:border-amber/50 hover:text-amber active:bg-amber/[0.08]"
            >
              <span className="text-mute">+</span>
              {a.label}
            </button>
          ))}
        </div>
      </section>

      {/* ----------------------- configurable grid --------------------- */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        {visible.map(id => (
          <div key={id} className={cn('min-w-0', FULL_WIDTH.has(id) && 'lg:col-span-2')}>
            {RENDER[id]()}
          </div>
        ))}
      </div>
      {visible.length === 0 && (
        <Panel>
          <EmptyState title="Все блоки скрыты" text="Включите нужные блоки в настройках главной." />
        </Panel>
      )}

      <div className="flex justify-center">
        <Button variant="ghost" onClick={() => setEditing(true)}>
          <Settings2 size={15} /> Настроить главную
        </Button>
      </div>

      <Modal
        open={editing}
        onOpenChange={setEditing}
        title="Настройка главной"
        description="Скрывайте ненужные блоки и меняйте порядок. Изменения применяются сразу."
      >
        <ul className="space-y-1">
          {cfg.order.map((id, i) => {
            const b = BLOCKS.find(x => x.id === id);
            if (!b) return null;
            const on = !cfg.hidden.includes(id);
            return (
              <li key={id} className="flex items-center gap-2 border-b border-line/60 py-1.5 last:border-0">
                <span className="tnum w-5 shrink-0 text-[9.5px] text-engrave">{String(i + 1).padStart(2, '0')}</span>
                <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', on ? 'text-txt' : 'text-mute')}>{b.label}</span>
                <Switch checked={on} onChange={() => toggleHidden(id)} label={`Показывать блок ${b.label}`} />
                <IconButton label={`${b.label}: выше`} size="icon-sm" disabled={i === 0} onClick={() => move(id, -1)}>
                  <ChevronUp size={15} />
                </IconButton>
                <IconButton label={`${b.label}: ниже`} size="icon-sm" disabled={i === cfg.order.length - 1} onClick={() => move(id, 1)}>
                  <ChevronDown size={15} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
