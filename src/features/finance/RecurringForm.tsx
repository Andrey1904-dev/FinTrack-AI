import { useState } from 'react';
import { Chips, Field, Input, MoneyInput, Segmented, Select, Textarea } from '@/components/ui/form';
import { useCategoryOptions } from '@/data/categories';
import { useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { FREQUENCY_LABEL } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { num } from '@/lib/format';
import type { Frequency, RecurringPayment } from '@/types';

export function RecurringForm({ initial, onDone }: { initial?: RecurringPayment; onDone: () => void }) {
  const [kind, setKind] = useState<'expense' | 'income'>(initial?.kind ?? 'expense');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.category ?? 'Коммунальные услуги');
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly');
  const [next, setNext] = useState(initial?.next_date ?? todayISO());
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const categories = useCategoryOptions(kind);
  const save = useSaveRow('recurring_payments');
  const { saving, error, run } = useSubmit('Не удалось сохранить платёж', 'Платёж сохранён', onDone);

  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!title.trim()) return setErr('Введите название');
      if (num(amount) <= 0) return setErr('Введите сумму');
      if (!next) return setErr('Укажите дату ближайшего платежа');
      setErr('');
      void run(() => save.mutateAsync({
        id: initial?.id, title: title.trim(), amount: num(amount), kind, category: category.trim() || 'Другое', frequency,
        next_date: next, day_of_month: Number(next.slice(8, 10)), comment: comment.trim(), active: initial?.active ?? true,
      }));
    }}>
      <Segmented value={kind} onChange={v => { setKind(v); setCategory(v === 'income' ? 'Зарплата' : 'Коммунальные услуги'); }} className="w-full"
        options={[{ value: 'expense', label: 'Платёж' }, { value: 'income', label: 'Доход (зарплата)' }]} />
      <Field label="Название">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'income' ? 'Например: Зарплата' : 'Например: МТС'} autoFocus maxLength={120} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Сумма, ₽">{id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} />}</Field>
        <Field label="Повторяется">{id => <Select id={id} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)}>{Object.entries(FREQUENCY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
      </div>
      <Field label="Ближайший платёж" hint="Дальнейшие даты рассчитаются автоматически">{id => <Input id={id} type="date" value={next} onChange={e => setNext(e.target.value)} />}</Field>
      <Field label="Категория">{() => <Chips value={category} onChange={setCategory} options={categories.includes(category) ? categories : [category, ...categories]} />}</Field>
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[56px]" />}</Field>
    </FormShell>
  );
}
