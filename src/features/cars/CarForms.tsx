import { useState } from 'react';
import { Chips, Field, Input, MoneyInput, Segmented, Select, Textarea } from '@/components/ui/form';
import { useAuth } from '@/data/auth';
import { useInvalidate, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { CAR_EXPENSE_CATEGORIES, FUEL_TYPES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { num } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { uid } from '@/lib/utils';
import type { Car, CarExpense, CarReminder } from '@/types';
import { useCurrentCar } from './useCars';

export function CarForm({ initial, first, onDone }: { initial?: Car; first?: boolean; onDone: () => void }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [year, setYear] = useState(initial?.year ? String(initial.year) : '');
  const [engine, setEngine] = useState(initial?.engine ?? '');
  const [mileage, setMileage] = useState(initial ? String(initial.mileage) : '');
  const [fuel, setFuel] = useState(initial?.fuel_type ?? 'АИ-95');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('cars');
  const { saving, error, run } = useSubmit('Не удалось сохранить автомобиль', 'Автомобиль сохранён', onDone);
  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!name.trim()) return setErr('Введите название автомобиля');
      const y = year.trim() ? Math.round(num(year)) : null;
      if (y !== null && (y < 1900 || y > 2100)) return setErr('Проверьте год выпуска');
      setErr('');
      void run(() => save.mutateAsync({
        id: initial?.id, name: name.trim(), year: y, engine: engine.trim(), mileage: Math.max(0, Math.round(num(mileage))),
        fuel_type: fuel, comment: comment.trim(), ...(initial ? {} : { is_current: !!first }),
      }));
    }}>
      <Field label="Автомобиль">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Например: VAZ-2114" autoFocus maxLength={80} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Год">{id => <MoneyInput id={id} value={year} onChange={e => setYear(e.target.value)} placeholder="2006" />}</Field>
        <Field label="Двигатель">{id => <Input id={id} value={engine} onChange={e => setEngine(e.target.value)} placeholder="1.5" maxLength={40} />}</Field>
      </div>
      <Field label="Пробег, км">{id => <MoneyInput id={id} value={mileage} onChange={e => setMileage(e.target.value)} />}</Field>
      <Field label="Топливо">{() => <Chips value={fuel} onChange={setFuel} options={FUEL_TYPES} />}</Field>
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[56px]" />}</Field>
    </FormShell>
  );
}

export function CarExpenseForm({ initial, carId, onDone }: { initial?: CarExpense; carId?: string; onDone: () => void }) {
  const { cars, current } = useCurrentCar();
  const { user } = useAuth();
  const [car, setCar] = useState(initial?.car_id ?? carId ?? current?.id ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Масло');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [mileage, setMileage] = useState(initial?.mileage ? String(initial.mileage) : '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [asExpense, setAsExpense] = useState(!initial);
  const [err, setErr] = useState('');
  const save = useSaveRow('car_expenses');
  const { saving, error, run } = useSubmit('Не удалось сохранить расход на авто', 'Расход на авто сохранён', onDone);
  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!car) return setErr('Сначала добавьте автомобиль');
      if (num(amount) <= 0) return setErr('Введите сумму');
      setErr('');
      void run(async () => {
        let operationId: string | null = initial?.operation_id ?? null;
        if (asExpense && !operationId) {
          const { data, error: e } = await supabase.from('finance_operations').insert({
            user_id: user?.id, client_id: uid('os'), type: 'expense', amount: num(amount), category: 'Автомобиль',
            note: `${category}${title.trim() ? ': ' + title.trim() : ''}`, date,
          }).select('id').single();
          if (e) throw e;
          operationId = (data as { id: string }).id;
        }
        try {
          await save.mutateAsync({ id: initial?.id, car_id: car, category, title: title.trim(), amount: num(amount), date, mileage: Math.round(num(mileage)), comment: comment.trim(), operation_id: operationId });
        } catch (e) {
          if (operationId && !initial?.operation_id) await supabase.from('finance_operations').delete().eq('id', operationId);
          throw e;
        }
      });
    }}>
      {cars.length > 1 && <Field label="Автомобиль">{id => <Select id={id} value={car} onChange={e => setCar(e.target.value)}>{cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
      <Field label="Тип расхода">{() => <Chips value={category} onChange={setCategory} options={CAR_EXPENSE_CATEGORIES} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Сумма, ₽">{id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />}</Field>
        <Field label="Дата">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Описание">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} maxLength={120} />}</Field>
        <Field label="Пробег, км">{id => <MoneyInput id={id} value={mileage} onChange={e => setMileage(e.target.value)} />}</Field>
      </div>
      <Field label="Комментарий">{id => <Input id={id} value={comment} onChange={e => setComment(e.target.value)} maxLength={300} />}</Field>
      {!initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={asExpense} onChange={e => setAsExpense(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" /> Учесть в расходах</label>}
    </FormShell>
  );
}

export function ReminderForm({ initial, carId, onDone }: { initial?: CarReminder; carId?: string; onDone: () => void }) {
  const { cars, current } = useCurrentCar();
  const [car, setCar] = useState(initial?.car_id ?? carId ?? current?.id ?? '');
  const selected = cars.find(c => c.id === car);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [kind, setKind] = useState<CarReminder['kind']>(initial?.kind ?? 'mileage');
  const [km, setKm] = useState(initial?.due_mileage !== null && initial?.due_mileage !== undefined ? String(Math.max(0, initial.due_mileage - (selected?.mileage ?? 0))) : '');
  const [repeat, setRepeat] = useState(initial?.interval_km ? String(initial.interval_km) : '');
  const [date, setDate] = useState(initial?.due_date ?? '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('car_reminders');
  const { saving, error, run } = useSubmit('Не удалось сохранить напоминание', 'Напоминание сохранено', onDone);
  const due = (selected?.mileage ?? 0) + Math.round(num(km));
  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!car) return setErr('Сначала добавьте автомобиль');
      if (!title.trim()) return setErr('Введите название напоминания');
      if (kind === 'mileage' && num(km) <= 0) return setErr('Укажите, через сколько километров напомнить');
      if (kind === 'date' && !date) return setErr('Укажите дату');
      setErr('');
      void run(() => save.mutateAsync({
        id: initial?.id, car_id: car, title: title.trim(), kind, comment: comment.trim(),
        due_mileage: kind === 'mileage' ? due : null, due_date: kind === 'date' ? date : null,
        interval_km: kind === 'mileage' ? Math.round(num(repeat) || num(km)) || null : null, status: 'active',
      }));
    }}>
      {cars.length > 1 && <Field label="Автомобиль">{id => <Select id={id} value={car} onChange={e => setCar(e.target.value)}>{cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>}
      <Field label="Что напомнить">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Замена масла, ОСАГО…" autoFocus maxLength={120} />}</Field>
      <Segmented value={kind} onChange={setKind} className="w-full" options={[{ value: 'mileage', label: 'По пробегу' }, { value: 'date', label: 'По дате' }]} />
      {kind === 'mileage' ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Через, км" hint={`Срок: ${due.toLocaleString('ru-RU')} км`}>{id => <MoneyInput id={id} value={km} onChange={e => setKm(e.target.value)} placeholder="7000" />}</Field>
            <Field label="Повторять каждые, км" hint="Пусто — как «через»">{id => <MoneyInput id={id} value={repeat} onChange={e => setRepeat(e.target.value)} />}</Field>
          </div>
        </>
      ) : (
        <Field label="Дата">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
      )}
      <Field label="Комментарий">{id => <Input id={id} value={comment} onChange={e => setComment(e.target.value)} maxLength={300} />}</Field>
    </FormShell>
  );
}

export function useCarInvalidate() {
  const inv = useInvalidate();
  return () => inv('cars', 'car_refuels', 'car_expenses', 'car_service', 'car_reminders', 'finance_operations');
}
