import { BookOpen, CalendarCheck, Car, Plus, Wallet, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, Meter, PageHeader, PageSkeleton, Panel, PanelLink } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useSaveRow } from '@/data/hooks';
import { TaskForm } from '@/features/forms/TaskForm';
import { useOverview } from '@/features/overview/useOverview';
import { TaskRow } from '@/features/tasks/TasksPage';
import { reminderState, isScheduledWorkDay, getRateForDate, calcDayEarnings } from '@/lib/calc';
import { CashFlowTodayBanner } from '@/features/finance/CashFlowPanel';
import { addDaysISO, daysBetween, monthKey, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDateLong, greeting, money, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Task } from '@/types';
import { useSalaryData } from '@/data/useSalary';

/** One briefing block: engineering code gutter + content. */
function BriefingBlock({
  code,
  title,
  icon,
  children,
  delay = 0,
}: {
  code: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <section className="rise panel flex overflow-hidden" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex w-[54px] shrink-0 flex-col items-center justify-start gap-2 border-r border-line bg-ink/40 py-5">
        <span className="text-mute">{icon}</span>
        <span className="silk-b text-[8.5px] text-engrave">{code}</span>
      </div>
      <div className="min-w-0 flex-1 px-4 py-4 sm:px-5 sm:py-5">
        <div className="mb-3.5 flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-txt">{title}</h2>
          <span className="h-px flex-1 bg-line" />
        </div>
        {children}
      </div>
    </section>
  );
}

function SalaryTodayBriefing() {
  const today = todayISO();
  const currentMonth = monthKey(today);
  const { profiles, profileSummaries, workDays, rates, payments } = useSalaryData(currentMonth);

  const salaryToday = useMemo(() => {
    const items: Array<{
      profileName: string;
      isWorkDay: boolean;
      hours: number;
      expectedEarn: number;
      rate: number;
      isProbation: boolean;
      actual?: { hours: number; earned: number; status: string };
      overtime?: number;
    }> = [];

    for (const p of profiles) {
      if (!p.active) continue;
      const isWork = isScheduledWorkDay(today, p);
      const { rate, isProbation } = getRateForDate(today, p, rates);
      const expected = isWork
        ? calcDayEarnings(p, { date: today, actualHours: p.hours_per_day, status: 'worked' }, rates).earned
        : 0;

      const recorded = workDays.find(w => w.salary_profile_id === p.id && w.date === today);
      const overtime = recorded && recorded.actual_hours > (p.hours_per_day || 8) ? recorded.actual_hours - (p.hours_per_day || 8) : 0;

      items.push({
        profileName: p.name,
        isWorkDay: isWork,
        hours: p.hours_per_day || 8,
        expectedEarn: expected,
        rate,
        isProbation,
        actual: recorded ? { hours: recorded.actual_hours, earned: recorded.earned_amount, status: recorded.status } : undefined,
        overtime: overtime > 0 ? overtime : undefined,
      });
    }
    return items;
  }, [profiles, rates, workDays, today]);

  const nextPayout = useMemo(() => {
    const allExpected = payments.filter(pm => pm.status === 'expected' && pm.payment_date >= today).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
    if (allExpected.length === 0) return null;
    const next = allExpected[0];
    const prof = profiles.find(pr => pr.id === next.salary_profile_id);
    return { date: next.payment_date, amount: next.expected_amount, profileName: prof?.name ?? 'Зарплата', days: daysBetween(today, next.payment_date) };
  }, [payments, profiles, today]);

  const monthEarned = useMemo(() => {
    let earned = 0;
    let forecast = 0;
    for (const p of profiles) {
      if (!p.active) continue;
      const s = profileSummaries.get(p.id);
      if (s) {
        earned += s.totalEarnedSoFar;
        forecast += s.monthTotalForecast;
      }
    }
    return { earned, forecast };
  }, [profiles, profileSummaries]);

  if (profiles.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {salaryToday.map(item => (
          <div key={item.profileName} className="rounded-[2px] border border-line bg-panel/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-txt">{item.profileName}</span>
              <span className={`text-[10px] uppercase tracking-wider ${item.isWorkDay ? 'text-amber' : 'text-mute'}`}>
                {item.isWorkDay ? 'Рабочий день' : 'Выходной'}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-[11.5px]">
              <div className="flex justify-between">
                <span className="text-mute">План часов:</span>
                <span className="text-dim">{item.hours} ч</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mute">Ставка:</span>
                <span className="text-dim">
                  {item.rate} ₽/ч {item.isProbation ? '(испытательный)' : ''}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-mute">Ожидаемо за день:</span>
                <span className="font-semibold text-amber">{money(item.expectedEarn)}</span>
              </div>
              {item.actual && (
                <div className="flex justify-between border-t border-line/60 pt-1">
                  <span className="text-mute">Факт:</span>
                  <span className="text-cyan">
                    {item.actual.hours} ч · {money(item.actual.earned)} · {item.actual.status}
                  </span>
                </div>
              )}
              {item.overtime && item.overtime > 0 && (
                <p className="text-cyan">⏱ Переработка: +{item.overtime} ч</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line/60 pt-3 text-[11.5px]">
        <span>
          <span className="text-mute">Заработано в {currentMonth}:</span> <span className="font-semibold text-cyan">{money(monthEarned.earned)}</span>
        </span>
        <span>
          <span className="text-mute">Прогноз месяца:</span> <span className="font-semibold text-txt">{money(monthEarned.forecast)}</span>
        </span>
        {nextPayout && (
          <span>
            <span className="text-mute">Ближайшая выплата:</span>{' '}
            <span className="font-semibold text-amber">
              {nextPayout.date} ({nextPayout.days === 0 ? 'сегодня' : `${nextPayout.days} дн.`}) · {money(nextPayout.amount)} · {nextPayout.profileName}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

export default function TodayPage() {
  const o = useOverview();
  const saveTopic = useSaveRow('learning_topics');
  const toast = useToast();
  const [edit, setEdit] = useState<Task | 'new' | null>(null);

  const soon = useMemo(() => o.events.filter(e => e.date <= addDaysISO(o.today, 3) && e.kind !== 'goal'), [o.events, o.today]);
  const carAlerts = useMemo(
    () =>
      o.reminders
        .filter(r => r.status === 'active')
        .map(r => ({ r, car: o.cars.find(c => c.id === r.car_id) }))
        .filter((x): x is { r: (typeof x)['r']; car: NonNullable<(typeof x)['car']> } => !!x.car)
        .map(x => ({ ...x, st: reminderState(x.r, x.car.mileage, o.today) }))
        .filter(x => x.st.level !== 'ok'),
    [o.reminders, o.cars, o.today],
  );

  let nextTopic: { track: string; topic: (typeof o.topics)[number] } | null = null;
  for (const tr of o.tracks) {
    const t = o.topics.filter(x => x.track_id === tr.id && !x.done).sort((x, y) => x.position - y.position)[0];
    if (t) {
      nextTopic = { track: tr.title, topic: t };
      break;
    }
  }

  if (o.loading) return <PageSkeleton />;
  if (o.error) return <ErrorState onRetry={() => void o.refetch()} />;

  const ratio = o.dayTotal ? (o.doneToday.length / o.dayTotal) * 100 : 0;
  const finishTopic = async () => {
    if (!nextTopic) return;
    try {
      await saveTopic.mutateAsync({ id: nextTopic.topic.id, done: true, done_at: new Date().toISOString() });
      toast.success('Тема изучена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось обновить тему'));
    }
  };
  const nothing = !o.dueToday.length && !soon.length && !carAlerts.length && !nextTopic;

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Сегодня"
        code={codeFor('/today')}
        subtitle={`${greeting()} · ${fmtDateLong(o.today)} · всё важное в одном экране`}
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus size={15} /> Задача
          </Button>
        }
      />

      <CashFlowTodayBanner />

      {/* оперативная сводка */}
      <section className="rise panel mb-5 flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" style={{ animationDelay: '40ms' }}>
        <span className="silk shrink-0">Оперативно</span>
        <span className="silk-b text-mute">
          {o.events.length ? `${o.events.length} событий впереди` : 'событий нет'}
          <span className="mx-2 text-engrave">/</span>
          {carAlerts.length ? `${carAlerts.length} по авто` : 'авто в норме'}
          <span className="mx-2 text-engrave">/</span>
          {o.dayTotal ? `${o.doneToday.length} из ${o.dayTotal} задач` : 'задач на сегодня нет'}
        </span>
      </section>

      {/* прогресс дня */}
      {o.dayTotal > 0 && (
        <section className="rise panel mb-5 flex flex-wrap items-center justify-between gap-4 px-4 py-4" style={{ animationDelay: '60ms' }}>
          <div>
            <p className="silk">Закрыто за сегодня</p>
            <p className="disp mt-2 text-[30px] leading-none text-amber">{Math.round(ratio)}%</p>
          </div>
          <div className="w-full min-w-[160px] flex-1 sm:max-w-[320px]">
            <Meter value={ratio} blocks={18} />
            <p className="silk mt-2.5">
              {o.doneToday.length} выполнено · {o.dueToday.length} осталось
            </p>
          </div>
        </section>
      )}

      {nothing && o.doneToday.length === 0 && (
        <Panel className="mb-5">
          <EmptyState
            icon={<CalendarCheck size={17} />}
            title="На сегодня ничего не запланировано"
            text="Добавьте задачу со сроком «сегодня» — и она появится здесь."
            action="Добавить задачу"
            onAction={() => setEdit('new')}
          />
        </Panel>
      )}

      {/* брифинг по блокам */}
      <div className="space-y-5">
        <BriefingBlock code="ЗАР" title="Зарплата сегодня" icon={<TrendingUp size={16} />} delay={80}>
          <SalaryTodayBriefing />
        </BriefingBlock>

        <BriefingBlock code="ФИН" title="Деньги" icon={<Wallet size={16} />} delay={100}>
          {soon.length === 0 ? (
            <p className="text-[12px] text-mute">В ближайшие 3 дня платежей нет.</p>
          ) : (
            <ul className="space-y-2.5">
              {soon.map(e => (
                <li key={e.id}>
                  <Link to={e.link} className="flex min-h-[44px] items-center gap-3 border-b border-line/60 py-1.5 last:border-0">
                    <span className="tnum w-11 shrink-0 text-[11.5px] text-mute">{e.date.slice(8)}.{e.date.slice(5, 7)}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', e.overdue ? 'text-red' : 'text-txt')}>{e.title}</span>
                    <span className="silk shrink-0 hidden sm:block">{relativeDays(e.date, o.today)}</span>
                    {e.amount !== null && (
                      <span className={cn('tnum shrink-0 text-[12.5px]', e.amount > 0 ? 'text-cyan' : 'text-red')}>{money(e.amount, { sign: true })}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </BriefingBlock>

        <BriefingBlock code="АВТ" title="Автомобиль" icon={<Car size={16} />} delay={140}>
          {carAlerts.length === 0 ? (
            <p className="text-[12px] text-mute">Ничего срочного по автомобилю.</p>
          ) : (
            <ul className="space-y-2.5">
              {carAlerts.map(({ r, car, st }) => (
                <li key={r.id} className="flex min-h-[44px] flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/60 py-1.5 last:border-0">
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-txt">{r.title}</span>
                  <span className="silk">{car.name}</span>
                  <Badge tone={st.level === 'overdue' ? 'bad' : 'warn'}>{st.label}</Badge>
                </li>
              ))}
            </ul>
          )}
        </BriefingBlock>

        <BriefingBlock code="ЗАД" title="Задачи" icon={<CalendarCheck size={16} />} delay={180}>
          {o.dueToday.length === 0 && o.doneToday.length === 0 ? (
            <p className="text-[12px] text-mute">Нет задач на сегодня.</p>
          ) : (
            <>
              <ul className="-my-1">
                {[...o.dueToday, ...o.doneToday].map(t => (
                  <TaskRow key={t.id} task={t} onEdit={setEdit} />
                ))}
              </ul>
              {o.dueToday.length === 0 && o.doneToday.length > 0 && <p className="silk-b mt-2 text-cyan">всё сделано · хороший день</p>}
            </>
          )}
        </BriefingBlock>

        <BriefingBlock code="УЧБ" title="Обучение" icon={<BookOpen size={16} />} delay={220}>
          {!nextTopic ? (
            <p className="text-[12px] text-mute">Нет невыполненных тем.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] text-txt">{nextTopic.topic.title}</p>
                <p className="silk mt-1">{nextTopic.track}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void finishTopic()}>
                Изучено
              </Button>
            </div>
          )}
        </BriefingBlock>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <Panel label="Быстрый доступ">
          <div className="grid grid-cols-2 gap-2">
            {[
              ['/finance', 'Финансы', <Wallet key="w" size={15} />],
              ['/debts', 'Долги', <Wallet key="d" size={15} />],
              ['/cars', 'Авто', <Car key="c" size={15} />],
              ['/tasks', 'Задачи', <CalendarCheck key="t" size={15} />],
              ['/goals', 'Цели', <CalendarCheck key="g" size={15} />],
              ['/learning', 'Обучение', <BookOpen key="l" size={15} />],
            ].map(([to, label, icon]) => (
              <Link
                key={to as string}
                to={to as string}
                className="flex min-h-[48px] items-center gap-2.5 border border-line px-3 text-[12px] text-dim transition-colors hover:border-amber/45 hover:text-amber"
              >
                {icon}
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </Panel>

        <Panel label="Финансовый календарь" right={<PanelLink to="/finance">Календарь →</PanelLink>}>
          <p className="text-[12px] leading-relaxed text-mute">
            Все платежи, доходы и напоминания по дням — с прогнозом остатка. Откройте вкладку «Календарь» в разделе «Финансы».
          </p>
        </Panel>
      </div>

      <Modal open={!!edit} onOpenChange={x => !x && setEdit(null)} title={edit && edit !== 'new' ? 'Изменить задачу' : 'Новая задача'}>
        {edit && <TaskForm key={edit === 'new' ? 'new' : edit.id} initial={edit === 'new' ? undefined : edit} defaults={{ due_date: o.today }} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
