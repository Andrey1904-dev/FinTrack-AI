import { Car as CarIcon, Check, Download, Fuel, Pencil, Plus, Star, Trash2, Wrench } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Input, Segmented } from '@/components/ui/form';
import { Tooltip } from '@/components/ui/menu';
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelLink, Readout, Skeleton, Tabs } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { RefuelForm } from '@/features/forms/RefuelForm';
import { ServiceForm } from '@/features/forms/ServiceForm';
import { carCosts, fuelStats, reminderState } from '@/lib/calc';
import { addDaysISO, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCSV } from '@/lib/export';
import { fmtDate, int, money, num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Car, CarExpense, CarRefuel, CarReminder, CarService } from '@/types';
import { CarExpenseForm, CarForm, ReminderForm, useCarInvalidate } from './CarForms';

type Tab = 'overview' | 'refuels' | 'service' | 'expenses' | 'reminders' | 'garage';
type Period = '90' | '365' | 'all';

/** Compact row used across every car log tab. */
function LogRow({
  title,
  meta,
  amount,
  actions,
  dim,
}: {
  title: ReactNode;
  meta?: ReactNode;
  amount?: ReactNode;
  actions?: ReactNode;
  dim?: boolean;
}) {
  return (
    <li className={cn('group flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line/70 px-4 py-3 last:border-b-0', dim && 'opacity-55')}>
      <div className="min-w-0 flex-1 basis-[180px]">
        <p className="truncate text-[13px] font-medium text-txt">{title}</p>
        {meta && <p className="tnum mt-0.5 text-[11px] leading-relaxed text-mute">{meta}</p>}
      </div>
      {amount && <span className="tnum shrink-0 text-[13px] font-semibold text-txt">{amount}</span>}
      {actions && <span className="flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">{actions}</span>}
    </li>
  );
}

function KeyValue({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <li className={cn('flex items-center justify-between gap-3 px-4 py-2.5', !last && 'border-b border-line/60')}>
      <span className="text-[12px] text-dim">{label}</span>
      <span className="tnum text-[12.5px] font-medium text-txt">{value}</span>
    </li>
  );
}

export default function CarsPage() {
  const cars = useRows('cars');
  const refuels = useRows('car_refuels');
  const expenses = useRows('car_expenses');
  const service = useRows('car_service');
  const reminders = useRows('car_reminders');
  const saveCar = useSaveRow('cars');
  const delCar = useDeleteRow('cars');
  const delRefuel = useDeleteRow('car_refuels');
  const delService = useDeleteRow('car_service');
  const delExpense = useDeleteRow('car_expenses');
  const delReminder = useDeleteRow('car_reminders');
  const saveReminder = useSaveRow('car_reminders');
  const invalidate = useCarInvalidate();
  const confirm = useConfirm();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('overview');
  const [period, setPeriod] = useState<Period>('90');
  const [carId, setCarId] = useState('');
  const [modal, setModal] = useState<
    | null
    | { kind: 'car'; item?: Car }
    | { kind: 'refuel'; item?: CarRefuel }
    | { kind: 'service'; item?: CarService }
    | { kind: 'expense'; item?: CarExpense }
    | { kind: 'reminder'; item?: CarReminder }
  >(null);
  const today = todayISO();

  const car = cars.rows.find(c => c.id === carId) ?? cars.rows.find(c => c.is_current) ?? cars.rows[0];
  const currentCarId = car?.id;
  const myRefuels = useMemo(() => refuels.rows.filter(r => r.car_id === currentCarId), [refuels.rows, currentCarId]);
  const myExpenses = useMemo(() => expenses.rows.filter(r => r.car_id === currentCarId), [expenses.rows, currentCarId]);
  const myService = useMemo(() => service.rows.filter(r => r.car_id === currentCarId), [service.rows, currentCarId]);
  const myReminders = useMemo(() => reminders.rows.filter(r => r.car_id === currentCarId), [reminders.rows, currentCarId]);
  const stats = useMemo(() => fuelStats(myRefuels, today), [myRefuels, today]);
  const from =
    period === 'all'
      ? ([...myRefuels, ...myExpenses, ...myService].map(r => r.date).sort()[0] ?? addDaysISO(today, -90))
      : addDaysISO(today, -Number(period));
  const costs = useMemo(
    () => carCosts({ refuels: myRefuels, expenses: myExpenses, service: myService }, from, today),
    [myRefuels, myExpenses, myService, from, today],
  );

  const loading = [cars, refuels, expenses, service, reminders].some(q => q.isLoading);
  const error = [cars, refuels, expenses, service, reminders].find(q => q.error)?.error;
  const retry = () => {
    [cars, refuels, expenses, service, reminders].forEach(q => void q.refetch());
  };
  const fail = (e: unknown, what: string) => toast.error(friendlyError(e, what));

  const makeCurrent = async (c: Car) => {
    try {
      const { error: e } = await supabase.rpc('set_current_car', { p_car_id: c.id });
      if (e) throw e;
      await invalidate();
      setCarId(c.id);
      toast.success(`Текущий автомобиль: ${c.name}`);
    } catch (e) {
      fail(e, 'Не удалось сменить автомобиль');
    }
  };

  const removeCar = async (c: Car) => {
    if (
      !(await confirm({
        title: `Удалить автомобиль «${c.name}»?`,
        text: 'Вместе с ним удалятся заправки, ремонты, расходы и напоминания. Записи в общих расходах останутся.',
        confirmText: 'Удалить автомобиль',
        danger: true,
      }))
    )
      return;
    try {
      await delCar.mutateAsync(c.id);
      setCarId('');
      toast.success('Автомобиль удалён');
    } catch (e) {
      fail(e, 'Не удалось удалить автомобиль');
    }
  };

  const removeRow = async (kind: 'refuel' | 'service' | 'expense' | 'reminder', id: string, title: string) => {
    if (!(await confirm({ title: 'Удалить запись?', text: title, confirmText: 'Удалить', danger: true }))) return;
    try {
      await { refuel: delRefuel, service: delService, expense: delExpense, reminder: delReminder }[kind].mutateAsync(id);
      toast.success('Запись удалена');
    } catch (e) {
      fail(e, 'Не удалось удалить запись');
    }
  };

  const completeReminder = async (r: CarReminder) => {
    if (!car) return;
    try {
      if (r.kind === 'mileage' && r.interval_km) await saveReminder.mutateAsync({ id: r.id, due_mileage: car.mileage + r.interval_km, last_done_at: today });
      else await saveReminder.mutateAsync({ id: r.id, status: 'done', last_done_at: today });
      toast.success('Отмечено выполненным');
    } catch (e) {
      fail(e, 'Не удалось обновить напоминание');
    }
  };

  const updateMileage = async (v: string) => {
    if (!car || num(v) === car.mileage) return;
    try {
      await saveCar.mutateAsync({ id: car.id, mileage: Math.max(0, Math.round(num(v))) });
      toast.success('Пробег обновлён');
    } catch (e) {
      fail(e, 'Не удалось обновить пробег');
    }
  };

  const exportCosts = () =>
    downloadCSV(
      'car-expenses',
      [
        ...myRefuels.map(r => ({ date: r.date, mileage: r.mileage, type: 'Заправка', title: r.station || r.fuel_type, amount: r.total })),
        ...myService.map(r => ({ date: r.date, mileage: r.mileage, type: 'Обслуживание', title: r.title, amount: r.total })),
        ...myExpenses.map(r => ({ date: r.date, mileage: r.mileage, type: r.category, title: r.title, amount: r.amount })),
      ].sort((a, b) => b.date.localeCompare(a.date)),
      [
        { header: 'Дата', value: r => r.date },
        { header: 'Пробег', value: r => r.mileage },
        { header: 'Тип', value: r => r.type },
        { header: 'Описание', value: r => r.title },
        { header: 'Сумма', value: r => r.amount },
      ],
    );

  const close = () => setModal(null);
  const soonReminders = car ? myReminders.filter(r => r.status !== 'done' && reminderState(r, car.mileage, today).level !== 'ok').length : 0;
  const needService = car && myReminders.some(r => r.kind === 'mileage' && r.status !== 'done' && (r.due_mileage ?? 0) - car.mileage < 1000);

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Авто"
        code={codeFor('/cars')}
        subtitle="Сколько мне реально стоит машина — топливо, ремонт и прочие расходы"
        actions={
          car ? (
            <>
              <Button variant="outline" onClick={() => setModal({ kind: 'service' })}>
                <Wrench size={16} /> <span className="hidden sm:inline">Обслуживание</span>
              </Button>
              <Button variant="primary" onClick={() => setModal({ kind: 'refuel' })}>
                <Fuel size={16} /> Заправка
              </Button>
            </>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState onRetry={retry} />
      ) : loading ? (
        <Skeleton className="h-72" />
      ) : !car ? (
        <Panel label="Гараж">
          <EmptyState
            icon={<CarIcon size={18} />}
            title="Автомобиль не добавлен"
            text={'Добавьте машину — и вы увидите расход топлива,\nисторию обслуживания и реальную стоимость владения.'}
            action="Добавить автомобиль"
            onAction={() => setModal({ kind: 'car' })}
          />
        </Panel>
      ) : (
        <>
          {cars.rows.length > 1 && (
            <div className="no-bar -mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
              <Chips value={car.name} onChange={n => setCarId(cars.rows.find(c => c.name === n)?.id ?? '')} options={cars.rows.map(c => c.name)} />
            </div>
          )}

          <Tabs
            ariaLabel="Разделы авто"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'overview', label: 'Обзор' },
              { value: 'refuels', label: 'Заправки' },
              { value: 'service', label: 'Ремонт и ТО' },
              { value: 'expenses', label: 'Расходы' },
              { value: 'reminders', label: 'Напоминания' },
              { value: 'garage', label: 'Гараж' },
            ]}
          />

          {tab === 'overview' && (
            <div className="space-y-4">
              <Panel className="p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[17px] font-semibold leading-snug text-txt sm:text-[19px]">{car.name}</h2>
                      {car.is_current && <Badge tone="accent">текущий</Badge>}
                    </div>
                    <p className="mt-1 text-[12px] text-dim">{[car.year, car.engine, car.fuel_type].filter(Boolean).join(' · ') || 'характеристики не указаны'}</p>
                  </div>
                  <div className="w-full sm:w-40">
                    <label htmlFor="mileage" className="silk mb-1.5 block">
                      Пробег, км
                    </label>
                    <Input
                      id="mileage"
                      key={car.mileage}
                      inputMode="numeric"
                      defaultValue={car.mileage}
                      onBlur={e => void updateMileage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                      className="tnum font-medium"
                    />
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-line pt-4">
                  <div>
                    <p className="silk">Средний расход</p>
                    <Readout value={stats.consumption ?? 0} size="lg" tone={stats.consumption ? 'amber' : 'dim'} className="mt-1" />
                    <p className="mt-0.5 text-[10.5px] text-mute">{stats.consumption ? 'л / 100 км' : 'нужно 2 заправки «до полного»'}</p>
                  </div>
                  <div>
                    <p className="silk">Стоимость 1 км</p>
                    <Readout value={costs.perKm ?? 0} size="lg" tone={costs.perKm ? 'txt' : 'dim'} className="mt-1" />
                    <p className="mt-0.5 text-[10.5px] text-mute">{costs.perKm ? 'с учётом всех расходов' : 'нужен пробег в записях'}</p>
                  </div>
                </div>
              </Panel>

              {(soonReminders > 0 || needService) && (
                <div className="panel-flat flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                  <Badge tone="warn">внимание</Badge>
                  <p className="min-w-0 flex-1 text-[12px] text-dim">
                    {soonReminders > 0 ? `${soonReminders} напоминание(й) по обслуживанию подходит по сроку.` : 'Скоро плановое обслуживание по пробегу.'}
                  </p>
                  <PanelLink onClick={() => setTab('reminders')}>Открыть →</PanelLink>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="silk">Стоимость владения</span>
                <div className="flex items-center gap-2">
                  <Segmented
                    ariaLabel="Период"
                    value={period}
                    onChange={setPeriod}
                    options={[
                      { value: '90', label: '3 мес.' },
                      { value: '365', label: 'Год' },
                      { value: 'all', label: 'Всё время' },
                    ]}
                  />
                  <Tooltip label="Экспорт расходов в CSV">
                    <IconButton label="Экспорт расходов в CSV" size="icon-sm" onClick={exportCosts}>
                      <Download size={15} />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="panel min-w-0 px-4 py-3.5">
                  <p className="silk truncate">Всего за период</p>
                  <Readout value={costs.total} size="md" className="mt-2" />
                </div>
                <div className="panel min-w-0 px-4 py-3.5">
                  <p className="silk truncate">В месяц</p>
                  <Readout value={costs.total ? costs.perMonth : 0} size="md" className="mt-2" />
                </div>
                <div className="panel min-w-0 px-4 py-3.5">
                  <p className="silk truncate">Топливо в месяц</p>
                  <Readout value={stats.monthlyFuel} size="md" tone="amber" className="mt-2" />
                </div>
                <div className="panel min-w-0 px-4 py-3.5">
                  <p className="silk truncate">Топливо в год</p>
                  <Readout value={stats.yearlyFuel} size="md" tone="amber" className="mt-2" />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel label="Из чего складывается">
                  <ul className="-mx-4">
                    {(
                      [
                        ['Топливо', costs.fuel],
                        ['Ремонт и обслуживание', costs.service],
                        ['Прочие расходы', costs.other],
                      ] as Array<[string, number]>
                    ).map(([l, v]) => (
                      <KeyValue key={l} label={l} value={money(v)} />
                    ))}
                    <KeyValue label="Итого" value={money(costs.total)} last />
                  </ul>
                </Panel>
                <Panel label="Топливо">
                  <ul className="-mx-4">
                    <KeyValue label="Стоимость 1 км (топливо)" value={stats.costPerKm ? money(stats.costPerKm, { decimals: true }) : '—'} />
                    <KeyValue label="Заправок в выборке" value={myRefuels.length} />
                    <KeyValue label="Расход на 100 км" value={stats.consumption ? `${stats.consumption} л` : '—'} />
                    <KeyValue label="Топливо за всё время" value={money(myRefuels.reduce((s, r) => s + r.total, 0))} last />
                  </ul>
                </Panel>
              </div>

              {myRefuels.length === 0 && myService.length === 0 && myExpenses.length === 0 && (
                <Panel label="Журнал">
                  <EmptyState compact title="Записей пока нет" text="Запишите заправку или обслуживание — и здесь появятся расчёты." action="Записать заправку" onAction={() => setModal({ kind: 'refuel' })} />
                </Panel>
              )}
            </div>
          )}

          {tab === 'refuels' && (
            <Panel
              label={`Заправки · ${myRefuels.length}`}
              right={
                <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'refuel' })}>
                  <Plus size={14} /> Заправка
                </Button>
              }
              className="p-0 pb-0"
            >
              {myRefuels.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    icon={<Fuel size={18} />}
                    title="Заправок пока нет"
                    text="Записывайте заправки — расход и стоимость километра посчитаются сами."
                    action="Записать заправку"
                    onAction={() => setModal({ kind: 'refuel' })}
                  />
                </div>
              ) : (
                <ul>
                  {[...myRefuels].sort((a, b) => b.date.localeCompare(a.date)).map(r => (
                    <LogRow
                      key={r.id}
                      title={[fmtDate(r.date), r.station].filter(Boolean).join(' · ')}
                      meta={
                        <>
                          {r.liters} л × {money(r.price_per_liter, { decimals: true })}
                          {r.fuel_type ? ` · ${r.fuel_type}` : ''}
                          {r.mileage ? ` · ${int(r.mileage)} км` : ''}
                          {!r.full_tank ? ' · не полный бак' : ''}
                        </>
                      }
                      amount={money(r.total)}
                      actions={
                        <>
                          <IconButton label="Изменить заправку" size="icon-sm" onClick={() => setModal({ kind: 'refuel', item: r })}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton label="Удалить заправку" size="icon-sm" onClick={() => void removeRow('refuel', r.id, `${fmtDate(r.date)} · ${money(r.total)}`)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === 'service' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setModal({ kind: 'service' })}>
                  <Plus size={16} /> Запись
                </Button>
              </div>
              {myService.length === 0 ? (
                <Panel label="Ремонт и ТО">
                  <EmptyState
                    icon={<Wrench size={18} />}
                    title="История ремонта пуста"
                    text="Записывайте замену масла, ремонт и ТО: что сделано, запчасти, работа и итог."
                    action="Добавить запись"
                    onAction={() => setModal({ kind: 'service' })}
                  />
                </Panel>
              ) : (
                [...myService]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(s => (
                    <Panel key={s.id} className="p-4" label={s.title} right={<span className="tnum text-[11px] text-mute">{fmtDate(s.date)}{s.mileage ? ` · ${int(s.mileage)} км` : ''}</span>}>
                      <div className="-mr-1 -mt-9 flex justify-end">
                        <IconButton label="Изменить запись" size="icon-sm" onClick={() => setModal({ kind: 'service', item: s })}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label="Удалить запись" size="icon-sm" onClick={() => void removeRow('service', s.id, s.title)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                      {s.items.length > 0 && (
                        <ul className="-mx-4 mt-3">
                          {s.items.map((i, idx) => (
                            <KeyValue key={idx} label={i.name} value={money(i.amount)} />
                          ))}
                        </ul>
                      )}
                      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                        <span className="silk">Итого</span>
                        <span className="tnum text-[14px] font-semibold text-txt">{money(s.total)}</span>
                      </div>
                      {s.comment && <p className="mt-2 text-[11.5px] leading-relaxed text-dim">{s.comment}</p>}
                    </Panel>
                  ))
              )}
            </div>
          )}

          {tab === 'expenses' && (
            <Panel
              label={`Прочие расходы · ${myExpenses.length}`}
              right={
                <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'expense' })}>
                  <Plus size={14} /> Расход
                </Button>
              }
              className="p-0 pb-0"
            >
              {myExpenses.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="Расходов пока нет"
                    text="Мойка, страховка, налог, шиномонтаж, диагностика, запчасти — всё в одном месте."
                    action="Добавить расход"
                    onAction={() => setModal({ kind: 'expense' })}
                  />
                </div>
              ) : (
                <ul>
                  {[...myExpenses].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                    <LogRow
                      key={e.id}
                      title={[e.category, e.title].filter(Boolean).join(' · ')}
                      meta={<>{fmtDate(e.date)}{e.mileage ? ` · ${int(e.mileage)} км` : ''}</>}
                      amount={money(e.amount)}
                      actions={
                        <>
                          <IconButton label="Изменить расход" size="icon-sm" onClick={() => setModal({ kind: 'expense', item: e })}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton label="Удалить расход" size="icon-sm" onClick={() => void removeRow('expense', e.id, `${e.category} · ${money(e.amount)}`)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </>
                      }
                    />
                  ))}
                </ul>
              )}
            </Panel>
          )}

          {tab === 'reminders' && (
            <Panel
              label={`Обслуживание · ${myReminders.length}`}
              right={
                <Button size="sm" variant="primary" onClick={() => setModal({ kind: 'reminder' })}>
                  <Plus size={14} /> Напоминание
                </Button>
              }
              className="p-0 pb-0"
            >
              {myReminders.length === 0 ? (
                <div className="p-4">
                  <EmptyState
                    title="Напоминаний пока нет"
                    text="Например: замена масла через 7 000 км или ОСАГО до 15.05.2027."
                    action="Создать напоминание"
                    onAction={() => setModal({ kind: 'reminder' })}
                  />
                </div>
              ) : (
                <ul>
                  {myReminders.map(r => {
                    const st = reminderState(r, car.mileage, today);
                    const done = r.status === 'done';
                    return (
                      <LogRow
                        key={r.id}
                        dim={done}
                        title={
                          <span className="flex flex-wrap items-center gap-2">
                            {r.title}
                            {done ? (
                              <Badge tone="good">выполнено</Badge>
                            ) : (
                              <Badge tone={st.level === 'overdue' ? 'bad' : st.level === 'soon' ? 'warn' : 'neutral'}>{st.label}</Badge>
                            )}
                          </span>
                        }
                        meta={
                          <>
                            {r.kind === 'mileage' ? `на ${int(r.due_mileage ?? 0)} км` : `до ${fmtDate(r.due_date)}`}
                            {r.interval_km && r.kind === 'mileage' ? ` · каждые ${int(r.interval_km)} км` : ''}
                          </>
                        }
                        actions={
                          <>
                            {!done && (
                              <Button size="sm" variant="outline" onClick={() => void completeReminder(r)}>
                                <Check size={14} /> Выполнено
                              </Button>
                            )}
                            <IconButton label="Изменить напоминание" size="icon-sm" onClick={() => setModal({ kind: 'reminder', item: r })}>
                              <Pencil size={14} />
                            </IconButton>
                            <IconButton label="Удалить напоминание" size="icon-sm" onClick={() => void removeRow('reminder', r.id, r.title)}>
                              <Trash2 size={14} />
                            </IconButton>
                          </>
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </Panel>
          )}

          {tab === 'garage' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setModal({ kind: 'car' })}>
                  <Plus size={16} /> Автомобиль
                </Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                {cars.rows.map(c => (
                  <Panel key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="flex flex-wrap items-center gap-2 text-[14.5px] font-semibold text-txt">
                          {c.name}
                          {c.is_current && <Badge tone="accent">текущий</Badge>}
                        </h3>
                        <p className="tnum mt-1 text-[11.5px] text-mute">{[c.year, c.engine, `${int(c.mileage)} км`].filter(Boolean).join(' · ')}</p>
                      </div>
                      <div className="-mr-1 -mt-1 flex shrink-0">
                        <IconButton label="Изменить автомобиль" size="icon-sm" onClick={() => setModal({ kind: 'car', item: c })}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label="Удалить автомобиль" size="icon-sm" onClick={() => void removeCar(c)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>
                    {!c.is_current && (
                      <Button size="sm" variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => void makeCurrent(c)}>
                        <Star size={14} /> Сделать текущим
                      </Button>
                    )}
                  </Panel>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={modal?.kind === 'car'} onOpenChange={o => !o && close()} title={modal?.kind === 'car' && modal.item ? 'Изменить автомобиль' : 'Новый автомобиль'}>
        {modal?.kind === 'car' && <CarForm initial={modal.item} first={cars.rows.length === 0} onDone={close} />}
      </Modal>
      <Modal open={modal?.kind === 'refuel'} onOpenChange={o => !o && close()} title="Заправка">
        {modal?.kind === 'refuel' && <RefuelForm initial={modal.item} carId={car?.id} onDone={close} />}
      </Modal>
      <Modal open={modal?.kind === 'service'} onOpenChange={o => !o && close()} title="Обслуживание автомобиля">
        {modal?.kind === 'service' && <ServiceForm initial={modal.item} carId={car?.id} onDone={close} />}
      </Modal>
      <Modal open={modal?.kind === 'expense'} onOpenChange={o => !o && close()} title="Расход на автомобиль">
        {modal?.kind === 'expense' && <CarExpenseForm initial={modal.item} carId={car?.id} onDone={close} />}
      </Modal>
      <Modal open={modal?.kind === 'reminder'} onOpenChange={o => !o && close()} title="Напоминание">
        {modal?.kind === 'reminder' && <ReminderForm initial={modal.item} carId={car?.id} onDone={close} />}
      </Modal>
    </div>
  );
}
