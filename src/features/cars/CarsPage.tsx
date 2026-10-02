import { Car as CarIcon, Check, Fuel, Pencil, Plus, Star, Trash2, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Input, Segmented } from '@/components/ui/form';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Stat, Tabs } from '@/components/ui/misc';
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
  const [modal, setModal] = useState<null | { kind: 'car'; item?: Car } | { kind: 'refuel'; item?: CarRefuel } | { kind: 'service'; item?: CarService } | { kind: 'expense'; item?: CarExpense } | { kind: 'reminder'; item?: CarReminder }>(null);
  const today = todayISO();

  const car = cars.rows.find(c => c.id === carId) ?? cars.rows.find(c => c.is_current) ?? cars.rows[0];
  const mine = <T extends { car_id: string }>(rows: T[]) => rows.filter(r => r.car_id === car?.id);
  const myRefuels = useMemo(() => mine(refuels.rows), [refuels.rows, car?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const myExpenses = useMemo(() => mine(expenses.rows), [expenses.rows, car?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const myService = useMemo(() => mine(service.rows), [service.rows, car?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const myReminders = useMemo(() => mine(reminders.rows), [reminders.rows, car?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const stats = useMemo(() => fuelStats(myRefuels, today), [myRefuels, today]);
  const from = period === 'all' ? ([...myRefuels, ...myExpenses, ...myService].map(r => r.date).sort()[0] ?? addDaysISO(today, -90)) : addDaysISO(today, -Number(period));
  const costs = useMemo(() => carCosts({ refuels: myRefuels, expenses: myExpenses, service: myService }, from, today), [myRefuels, myExpenses, myService, from, today]);

  const loading = [cars, refuels, expenses, service, reminders].some(q => q.isLoading);
  const error = [cars, refuels, expenses, service, reminders].find(q => q.error)?.error;
  const retry = () => { [cars, refuels, expenses, service, reminders].forEach(q => void q.refetch()); };
  const fail = (e: unknown, what: string) => toast.error(friendlyError(e, what));

  const makeCurrent = async (c: Car) => {
    try { const { error: e } = await supabase.rpc('set_current_car', { p_car_id: c.id }); if (e) throw e; await invalidate(); setCarId(c.id); toast.success(`Текущий автомобиль: ${c.name}`); } catch (e) { fail(e, 'Не удалось сменить автомобиль'); }
  };
  const removeCar = async (c: Car) => {
    if (!(await confirm({ title: `Удалить автомобиль «${c.name}»?`, text: 'Вместе с ним удалятся заправки, ремонты, расходы и напоминания. Записи в общих расходах останутся.', confirmText: 'Удалить автомобиль', danger: true }))) return;
    try { await delCar.mutateAsync(c.id); setCarId(''); toast.success('Автомобиль удалён'); } catch (e) { fail(e, 'Не удалось удалить автомобиль'); }
  };
  const removeRow = async (kind: 'refuel' | 'service' | 'expense' | 'reminder', id: string, title: string) => {
    if (!(await confirm({ title: 'Удалить запись?', text: title, confirmText: 'Удалить', danger: true }))) return;
    try {
      await { refuel: delRefuel, service: delService, expense: delExpense, reminder: delReminder }[kind].mutateAsync(id);
      toast.success('Запись удалена');
    } catch (e) { fail(e, 'Не удалось удалить запись'); }
  };
  const completeReminder = async (r: CarReminder) => {
    if (!car) return;
    try {
      if (r.kind === 'mileage' && r.interval_km) await saveReminder.mutateAsync({ id: r.id, due_mileage: car.mileage + r.interval_km, last_done_at: today });
      else await saveReminder.mutateAsync({ id: r.id, status: 'done', last_done_at: today });
      toast.success('Отмечено выполненным');
    } catch (e) { fail(e, 'Не удалось обновить напоминание'); }
  };
  const updateMileage = async (v: string) => {
    if (!car || num(v) === car.mileage) return;
    try { await saveCar.mutateAsync({ id: car.id, mileage: Math.max(0, Math.round(num(v))) }); toast.success('Пробег обновлён'); } catch (e) { fail(e, 'Не удалось обновить пробег'); }
  };
  const exportCosts = () => downloadCSV('car-expenses', [
    ...myRefuels.map(r => ({ date: r.date, mileage: r.mileage, type: 'Заправка', title: r.station || r.fuel_type, amount: r.total })),
    ...myService.map(r => ({ date: r.date, mileage: r.mileage, type: 'Обслуживание', title: r.title, amount: r.total })),
    ...myExpenses.map(r => ({ date: r.date, mileage: r.mileage, type: r.category, title: r.title, amount: r.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [
    { header: 'Дата', value: r => r.date }, { header: 'Пробег', value: r => r.mileage }, { header: 'Тип', value: r => r.type },
    { header: 'Описание', value: r => r.title }, { header: 'Сумма', value: r => r.amount },
  ]);

  const close = () => setModal(null);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Авто" subtitle="Сколько мне реально стоит машина?" actions={car ? <>
        <Button onClick={() => setModal({ kind: 'refuel' })}><Fuel size={16} /> Заправка</Button>
        <Button onClick={() => setModal({ kind: 'service' })}><Wrench size={16} /> Обслуживание</Button>
      </> : undefined} />
      {error ? <ErrorState onRetry={retry} /> : loading ? <Skeleton className="h-64" /> : !car ? (
        <Card><EmptyState icon={<CarIcon size={20} />} title="Автомобиль не добавлен" text={'Добавьте машину — и вы увидите расход топлива,\nисторию обслуживания и реальную стоимость владения.'} action="Добавить автомобиль" onAction={() => setModal({ kind: 'car' })} /></Card>
      ) : (
        <>
          {cars.rows.length > 1 && <div className="mb-4"><Chips value={car.name} onChange={n => setCarId(cars.rows.find(c => c.name === n)?.id ?? '')} options={cars.rows.map(c => c.name)} /></div>}
          <Tabs value={tab} onChange={setTab} tabs={[
            { value: 'overview', label: 'Обзор' }, { value: 'refuels', label: 'Заправки' }, { value: 'service', label: 'Ремонт и ТО' },
            { value: 'expenses', label: 'Расходы' }, { value: 'reminders', label: 'Напоминания' }, { value: 'garage', label: 'Гараж' },
          ]} />

          {tab === 'overview' && (
            <div className="space-y-4">
              <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div><h2 className="text-lg font-semibold">{car.name}</h2><p className="mt-0.5 text-sm text-muted">{[car.year, car.engine, car.fuel_type].filter(Boolean).join(' · ')}</p></div>
                <div className="flex items-end gap-2">
                  <div className="w-36"><label htmlFor="mileage" className="mb-1 block text-xs text-muted">Пробег, км</label>
                    <Input id="mileage" key={car.mileage} inputMode="numeric" defaultValue={car.mileage} onBlur={e => void updateMileage(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} className="tabular font-medium" /></div>
                </div>
              </Card>
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">Стоимость владения</h3>
                <div className="flex items-center gap-2"><Segmented value={period} onChange={setPeriod} options={[{ value: '90', label: '3 мес.' }, { value: '365', label: 'Год' }, { value: 'all', label: 'Всё время' }]} />
                  <Button size="sm" variant="ghost" onClick={exportCosts}>CSV</Button></div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label="Всего за период" value={money(costs.total)} />
                <Stat label="В месяц" value={costs.total ? money(costs.perMonth) : '—'} />
                <Stat label="Стоимость 1 км" value={costs.perKm ? money(costs.perKm, { decimals: true }) : '—'} sub={costs.perKm ? 'с учётом всех расходов' : 'нужен пробег в записях'} />
                <Stat label="Средний расход" value={stats.consumption ? `${stats.consumption} л/100 км` : '—'} sub={stats.consumption ? undefined : 'нужно 2 заправки с пробегом'} />
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <Card>
                  <CardHeader title="Из чего складывается" />
                  <ul className="divide-y divide-line p-2">
                    {[['Топливо', costs.fuel], ['Ремонт и обслуживание', costs.service], ['Прочие расходы', costs.other]].map(([l, v]) => (
                      <li key={l as string} className="flex justify-between px-2 py-2.5 text-sm"><span className="text-muted">{l}</span><span className="tabular font-medium">{money(v as number)}</span></li>
                    ))}
                  </ul>
                </Card>
                <Card>
                  <CardHeader title="Топливо" />
                  <ul className="divide-y divide-line p-2">
                    <li className="flex justify-between px-2 py-2.5 text-sm"><span className="text-muted">Стоимость 1 км (топливо)</span><span className="tabular font-medium">{stats.costPerKm ? money(stats.costPerKm, { decimals: true }) : '—'}</span></li>
                    <li className="flex justify-between px-2 py-2.5 text-sm"><span className="text-muted">Топливо в месяц</span><span className="tabular font-medium">{stats.monthlyFuel ? money(stats.monthlyFuel) : '—'}</span></li>
                    <li className="flex justify-between px-2 py-2.5 text-sm"><span className="text-muted">Топливо в год</span><span className="tabular font-medium">{stats.yearlyFuel ? money(stats.yearlyFuel) : '—'}</span></li>
                  </ul>
                </Card>
              </div>
              {myRefuels.length === 0 && myService.length === 0 && myExpenses.length === 0 && (
                <Card><EmptyState title="Записей пока нет" text="Запишите заправку или обслуживание — и здесь появятся расчёты." action="Записать заправку" onAction={() => setModal({ kind: 'refuel' })} /></Card>
              )}
            </div>
          )}

          {tab === 'refuels' && (
            <Card>
              <CardHeader title="Заправки" action={<Button size="sm" variant="primary" onClick={() => setModal({ kind: 'refuel' })}><Plus size={14} /> Заправка</Button>} />
              {myRefuels.length === 0 ? <EmptyState icon={<Fuel size={20} />} title="Заправок пока нет" text="Записывайте заправки — расход и стоимость километра посчитаются сами." action="Записать заправку" onAction={() => setModal({ kind: 'refuel' })} /> : (
                <ul className="mt-2 divide-y divide-line">
                  {myRefuels.map(r => (
                    <li key={r.id} className="group flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1"><p className="text-sm">{fmtDate(r.date)}{r.station ? ` · ${r.station}` : ''}</p>
                        <p className="text-xs text-muted">{r.liters} л × {money(r.price_per_liter, { decimals: true })}{r.fuel_type ? ` · ${r.fuel_type}` : ''}{r.mileage ? ` · ${int(r.mileage)} км` : ''}{!r.full_tank ? ' · не полный бак' : ''}</p></div>
                      <span className="tabular text-sm font-medium">{money(r.total)}</span>
                      <span className="flex opacity-50 group-hover:opacity-100"><Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setModal({ kind: 'refuel', item: r })}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void removeRow('refuel', r.id, `${fmtDate(r.date)} · ${money(r.total)}`)}><Trash2 size={14} /></Button></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'service' && (
            <div className="space-y-3">
              <div className="flex justify-end"><Button variant="primary" onClick={() => setModal({ kind: 'service' })}><Plus size={16} /> Запись</Button></div>
              {myService.length === 0 ? <Card><EmptyState icon={<Wrench size={20} />} title="История ремонта пуста" text="Записывайте замену масла, ремонт и ТО: что сделано, запчасти, работа и итог." action="Добавить запись" onAction={() => setModal({ kind: 'service' })} /></Card>
                : myService.map(s => (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="text-xs text-muted">{fmtDate(s.date)}{s.mileage ? ` · ${int(s.mileage)} км` : ''}</p><h3 className="mt-0.5 font-semibold">{s.title}</h3></div>
                      <span className="-mr-2 -mt-1 flex"><Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setModal({ kind: 'service', item: s })}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void removeRow('service', s.id, s.title)}><Trash2 size={14} /></Button></span>
                    </div>
                    {s.items.length > 0 && <ul className="mt-3 space-y-1 text-sm">{s.items.map((i, idx) => <li key={idx} className="flex justify-between gap-3"><span className="text-muted">{i.name}</span><span className="tabular">{money(i.amount)}</span></li>)}</ul>}
                    <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-semibold"><span>Итого</span><span className="tabular">{money(s.total)}</span></div>
                    {s.comment && <p className="mt-2 text-xs text-muted">{s.comment}</p>}
                  </Card>
                ))}
            </div>
          )}

          {tab === 'expenses' && (
            <Card>
              <CardHeader title="Прочие расходы" action={<Button size="sm" variant="primary" onClick={() => setModal({ kind: 'expense' })}><Plus size={14} /> Расход</Button>} />
              {myExpenses.length === 0 ? <EmptyState title="Расходов пока нет" text="Мойка, страховка, налог, шиномонтаж, диагностика, запчасти — всё в одном месте." action="Добавить расход" onAction={() => setModal({ kind: 'expense' })} /> : (
                <ul className="mt-2 divide-y divide-line">
                  {myExpenses.map(e => (
                    <li key={e.id} className="group flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm">{e.category}{e.title ? ` · ${e.title}` : ''}</p><p className="text-xs text-muted">{fmtDate(e.date)}{e.mileage ? ` · ${int(e.mileage)} км` : ''}</p></div>
                      <span className="tabular text-sm font-medium">{money(e.amount)}</span>
                      <span className="flex opacity-50 group-hover:opacity-100"><Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setModal({ kind: 'expense', item: e })}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void removeRow('expense', e.id, `${e.category} · ${money(e.amount)}`)}><Trash2 size={14} /></Button></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === 'reminders' && (
            <Card>
              <CardHeader title="Обслуживание и напоминания" action={<Button size="sm" variant="primary" onClick={() => setModal({ kind: 'reminder' })}><Plus size={14} /> Напоминание</Button>} />
              {myReminders.length === 0 ? <EmptyState title="Напоминаний пока нет" text="Например: замена масла через 7 000 км или ОСАГО до 15.05.2027." action="Создать напоминание" onAction={() => setModal({ kind: 'reminder' })} /> : (
                <ul className="mt-2 divide-y divide-line">
                  {myReminders.map(r => {
                    const st = reminderState(r, car.mileage, today);
                    const done = r.status === 'done';
                    return (
                      <li key={r.id} className={cn('group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', done && 'opacity-50')}>
                        <div className="min-w-0 flex-1 basis-44"><p className="truncate text-sm font-medium">{r.title}</p>
                          <p className="text-xs text-muted">{r.kind === 'mileage' ? `на ${int(r.due_mileage ?? 0)} км` : `до ${fmtDate(r.due_date)}`}{r.interval_km && r.kind === 'mileage' ? ` · каждые ${int(r.interval_km)} км` : ''}</p></div>
                        {done ? <Badge tone="good">выполнено</Badge> : <Badge tone={st.level === 'overdue' ? 'bad' : st.level === 'soon' ? 'warn' : 'neutral'}>{st.label}</Badge>}
                        <span className="flex items-center gap-0.5">
                          {!done && <Button size="sm" onClick={() => void completeReminder(r)}><Check size={14} /> Выполнено</Button>}
                          <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setModal({ kind: 'reminder', item: r })}><Pencil size={14} /></Button>
                          <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void removeRow('reminder', r.id, r.title)}><Trash2 size={14} /></Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {tab === 'garage' && (
            <div className="space-y-3">
              <div className="flex justify-end"><Button variant="primary" onClick={() => setModal({ kind: 'car' })}><Plus size={16} /> Автомобиль</Button></div>
              <div className="grid gap-3 md:grid-cols-2">
                {cars.rows.map(c => (
                  <Card key={c.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div><h3 className="font-semibold">{c.name} {c.is_current && <Badge tone="accent" className="ml-1 align-middle">текущий</Badge>}</h3><p className="mt-0.5 text-xs text-muted">{[c.year, c.engine, `${int(c.mileage)} км`].filter(Boolean).join(' · ')}</p></div>
                      <span className="-mr-2 -mt-1 flex"><Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setModal({ kind: 'car', item: c })}><Pencil size={14} /></Button>
                        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void removeCar(c)}><Trash2 size={14} /></Button></span>
                    </div>
                    {!c.is_current && <Button size="sm" className="mt-3" onClick={() => void makeCurrent(c)}><Star size={14} /> Сделать текущим</Button>}
                  </Card>
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
