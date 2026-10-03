import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { CheckRow, Field, Input, MoneyInput, Select, Textarea } from '@/components/ui/form';
import { useInvalidate, useSaveRow } from '@/data/hooks';
import { useAuth } from '@/data/auth';
import { useCurrentCar } from '@/features/cars/useCars';
import { supabase } from '@/lib/supabase';
import { todayISO } from '@/lib/dates';
import { money, num } from '@/lib/format';
import { uid } from '@/lib/utils';
import type { CarService, ServiceItem } from '@/types';
import { FormShell, useSubmit } from './shared';

interface Draft { name: string; amount: string; kind: ServiceItem['kind'] }

export function ServiceForm({ initial, carId, onDone }: { initial?: CarService; carId?: string; onDone: () => void }) {
  const { cars, current } = useCurrentCar();
  const [car, setCar] = useState(initial?.car_id ?? carId ?? current?.id ?? '');
  const selected = cars.find(c => c.id === car);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [mileage, setMileage] = useState(initial?.mileage ? String(initial.mileage) : selected?.mileage ? String(selected.mileage) : '');
  const [items, setItems] = useState<Draft[]>(
    initial?.items?.length
      ? initial.items.map(i => ({ name: i.name, amount: String(i.amount), kind: i.kind }))
      : [{ name: '', amount: '', kind: 'part' }, { name: 'Работа', amount: '', kind: 'labor' }],
  );
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [asExpense, setAsExpense] = useState(!initial);
  const [fieldError, setFieldError] = useState('');
  const { user } = useAuth();
  const save = useSaveRow('car_service');
  const invalidate = useInvalidate();
  const { saving, error, run } = useSubmit('Не удалось сохранить запись обслуживания', 'Запись обслуживания сохранена', onDone);

  const clean = items.filter(i => num(i.amount) > 0).map(i => ({ name: i.name.trim() || (i.kind === 'labor' ? 'Работа' : 'Запчасть'), amount: num(i.amount), kind: i.kind }));
  const parts = clean.filter(i => i.kind === 'part').reduce((s, i) => s + i.amount, 0);
  const labor = clean.filter(i => i.kind === 'labor').reduce((s, i) => s + i.amount, 0);
  const total = parts + labor;
  const update = (idx: number, patch: Partial<Draft>) => setItems(list => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = () => {
    if (!car) return setFieldError('Сначала добавьте автомобиль в разделе «Авто»');
    if (!title.trim()) return setFieldError('Укажите, что сделано');
    setFieldError('');
    void run(async () => {
      let operationId: string | null = initial?.operation_id ?? null;
      if (asExpense && !operationId && total > 0) {
        const { data, error: err } = await supabase.from('finance_operations').insert({
          user_id: user?.id, client_id: uid('os'), type: 'expense', amount: total, category: 'Автомобиль', note: `Обслуживание: ${title.trim()}`, date,
        }).select('id').single();
        if (err) throw err;
        operationId = (data as { id: string }).id;
      }
      try {
        await save.mutateAsync({
          id: initial?.id, car_id: car, date, mileage: Math.round(num(mileage)), title: title.trim(),
          parts_cost: parts, labor_cost: labor, items: clean, total, comment: comment.trim(), operation_id: operationId,
        });
      } catch (e) {
        if (operationId && !initial?.operation_id) await supabase.from('finance_operations').delete().eq('id', operationId);
        throw e;
      }
      if (selected && num(mileage) > selected.mileage) {
        await supabase.from('cars').update({ mileage: Math.round(num(mileage)) }).eq('id', selected.id);
      }
      await invalidate('cars', 'finance_operations');
    });
  };

  if (!cars.length) return <p className="py-6 text-center text-[12.5px] text-mute">Сначала добавьте автомобиль в разделе «Авто».</p>;

  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      {cars.length > 1 && (
        <Field label="Автомобиль">{id => <Select id={id} value={car} onChange={e => setCar(e.target.value)}>{cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>}</Field>
      )}
      <Field label="Что сделано">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Замена масла" autoFocus maxLength={120} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Дата">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="Пробег, км">{id => <MoneyInput id={id} value={mileage} onChange={e => setMileage(e.target.value)} />}</Field>
      </div>
      <div className="space-y-2">
        <p className="silk">Запчасти и работа</p>
        {items.map((it, idx) => (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Input value={it.name} onChange={e => update(idx, { name: e.target.value })} placeholder={it.kind === 'labor' ? 'Работа' : 'Запчасть'} aria-label="Название" className="min-w-0 flex-1 basis-[160px]" />
            <Select value={it.kind} onChange={e => update(idx, { kind: e.target.value as ServiceItem['kind'] })} aria-label="Тип" className="w-[110px] shrink-0 px-2">
              <option value="part">Запчасть</option>
              <option value="labor">Работа</option>
            </Select>
            <MoneyInput value={it.amount} onChange={e => update(idx, { amount: e.target.value })} aria-label="Сумма" className="w-[104px] shrink-0 text-right" />
            <IconButton label="Убрать строку" size="icon-sm" onClick={() => setItems(list => list.filter((_, i) => i !== idx))}><Trash2 size={15} /></IconButton>
          </div>
        ))}
        <Button size="sm" variant="ghost" onClick={() => setItems(list => [...list, { name: '', amount: '', kind: 'part' }])}><Plus size={14} /> Добавить строку</Button>
        <div className="flex items-center justify-between border border-line bg-rail/40 px-3 py-2.5">
          <span className="silk">Итого</span>
          <span className="tnum text-[14px] font-semibold text-txt">{money(total)}</span>
        </div>
      </div>
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[60px]" maxLength={500} />}</Field>
      {!initial && <CheckRow checked={asExpense} onChange={setAsExpense} label="Учесть в расходах" />}
    </FormShell>
  );
}
