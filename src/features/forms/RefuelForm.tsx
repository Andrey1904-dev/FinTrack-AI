import { useState } from 'react';
import { Field, Input, MoneyInput, Select, Chips } from '@/components/ui/form';
import { useSaveRow } from '@/data/hooks';
import { useAuth } from '@/data/auth';
import { useCurrentCar } from '@/features/cars/useCars';
import { supabase } from '@/lib/supabase';
import { FUEL_TYPES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { num, round2 } from '@/lib/format';
import { uid } from '@/lib/utils';
import type { CarRefuel } from '@/types';
import { FormShell, useSubmit } from './shared';

export function RefuelForm({ initial, carId, onDone }: { initial?: CarRefuel; carId?: string; onDone: () => void }) {
  const { cars, current } = useCurrentCar();
  const [car, setCar] = useState(initial?.car_id ?? carId ?? current?.id ?? '');
  const selected = cars.find(c => c.id === car);
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [mileage, setMileage] = useState(initial?.mileage ? String(initial.mileage) : selected?.mileage ? String(selected.mileage) : '');
  const [liters, setLiters] = useState(initial ? String(initial.liters) : '');
  const [price, setPrice] = useState(initial ? String(initial.price_per_liter) : '');
  const [total, setTotal] = useState(initial ? String(initial.total) : '');
  const [station, setStation] = useState(initial?.station ?? '');
  const [fuel, setFuel] = useState(initial?.fuel_type || selected?.fuel_type || 'АИ-95');
  const [full, setFull] = useState(initial?.full_tank ?? true);
  const [asExpense, setAsExpense] = useState(!initial);
  const [fieldError, setFieldError] = useState('');
  const { user } = useAuth();
  const save = useSaveRow('car_refuels');
  const { saving, error, run } = useSubmit('Не удалось сохранить заправку', 'Заправка записана', onDone);

  const onLiters = (v: string) => {
    setLiters(v);
    if (num(v) > 0 && num(price) > 0) setTotal(String(round2(num(v) * num(price))));
  };
  const onPrice = (v: string) => {
    setPrice(v);
    if (num(v) > 0 && num(liters) > 0) setTotal(String(round2(num(v) * num(liters))));
  };
  const onTotal = (v: string) => {
    setTotal(v);
    if (num(v) > 0 && num(liters) > 0) setPrice(String(round2(num(v) / num(liters))));
  };

  const submit = () => {
    if (!car) return setFieldError('Сначала добавьте автомобиль в разделе «Авто»');
    if (num(liters) <= 0) return setFieldError('Укажите количество литров');
    if (num(total) <= 0) return setFieldError('Укажите сумму или цену за литр');
    setFieldError('');
    void run(async () => {
      let operationId: string | null = initial?.operation_id ?? null;
      if (asExpense && !operationId) {
        const { data, error: err } = await supabase.from('finance_operations').insert({
          user_id: user?.id, client_id: uid('os'), type: 'expense', amount: num(total), category: 'Топливо',
          note: station.trim() ? `Заправка · ${station.trim()}` : 'Заправка', date,
        }).select('id').single();
        if (err) throw err;
        operationId = (data as { id: string }).id;
      }
      try {
        await save.mutateAsync({
          id: initial?.id, car_id: car, date, mileage: Math.round(num(mileage)), liters: num(liters),
          price_per_liter: num(price) || round2(num(total) / num(liters)), total: num(total), station: station.trim(),
          fuel_type: fuel, full_tank: full, operation_id: operationId,
        });
      } catch (e) {
        if (operationId && !initial?.operation_id) await supabase.from('finance_operations').delete().eq('id', operationId);
        throw e;
      }
      if (selected && num(mileage) > selected.mileage) {
        await supabase.from('cars').update({ mileage: Math.round(num(mileage)) }).eq('id', selected.id);
      }
    });
  };

  if (!cars.length) return <p className="py-6 text-center text-sm text-muted">Сначала добавьте автомобиль в разделе «Авто».</p>;

  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      {cars.length > 1 && (
        <Field label="Автомобиль">{id => <Select id={id} value={car} onChange={e => setCar(e.target.value)}>{cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="Пробег, км">{id => <MoneyInput id={id} value={mileage} onChange={e => setMileage(e.target.value)} />}</Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Литры">{id => <MoneyInput id={id} value={liters} onChange={e => onLiters(e.target.value)} autoFocus />}</Field>
        <Field label="₽ за литр">{id => <MoneyInput id={id} value={price} onChange={e => onPrice(e.target.value)} />}</Field>
        <Field label="Сумма, ₽">{id => <MoneyInput id={id} value={total} onChange={e => onTotal(e.target.value)} />}</Field>
      </div>
      <Field label="Топливо">{() => <Chips value={fuel} onChange={setFuel} options={FUEL_TYPES} />}</Field>
      <Field label="АЗС">{id => <Input id={id} value={station} onChange={e => setStation(e.target.value)} placeholder="Например: Газпром" maxLength={80} />}</Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={full} onChange={e => setFull(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" /> Полный бак (для точного расчёта расхода)</label>
      {!initial && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={asExpense} onChange={e => setAsExpense(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--accent))]" /> Учесть в расходах (категория «Топливо»)</label>}
    </FormShell>
  );
}
