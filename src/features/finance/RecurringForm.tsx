import { useState } from 'react';
import { Field, Input, MoneyInput, Segmented, Select } from '@/components/ui/form';
import { useSaveRow } from '@/data/hooks';
import { FREQUENCY_LABEL } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { num } from '@/lib/format';
import type { RecurringPayment } from '@/types';
import { FormShell, useSubmit } from '@/features/forms/shared';

export function RecurringForm({ initial, onDone }: { initial?: RecurringPayment; onDone: () => void }) {
  const [kind, setKind] = useState<RecurringPayment['kind']>(initial?.kind ?? 'expense');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [frequency, setFrequency] = useState<RecurringPayment['frequency']>(initial?.frequency ?? 'monthly');
  const [day, setDay] = useState(initial?.day_of_month ? String(initial.day_of_month) : '1');
  const [next, setNext] = useState(initial?.next_date ?? todayISO());
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('recurring_payments');
  const { saving, error, run } = useSubmit('Не удалось сохранить платёж', 'Платёж сохранён', onDone);

  return (
    <FormShell
      saving={saving}
      error={error || err}
      onSubmit={() => {
        if (!title.trim()) return setErr('Введите название платежа');
        if (num(amount) <= 0) return setErr('Введите сумму');
        setErr('');
        void run(() =>
          save.mutateAsync({
            id: initial?.id,
            title: title.trim(),
            amount: num(amount),
            kind,
            category: category.trim() || 'Другое',
            frequency,
            day_of_month: frequency === 'monthly' ? Math.min(31, Math.max(1, Math.round(num(day)) || 1)) : null,
            next_date: next,
            active: initial?.active ?? true,
            comment: comment.trim(),
          }),
        );
      }}
    >
      <Segmented
        ariaLabel="Тип платежа"
        value={kind}
        onChange={k => setKind(k)}
        className="w-full"
        options={[
          { value: 'expense', label: 'Платёж' },
          { value: 'income', label: 'Доход' },
        ]}
      />
      <Field label="Название">
        {id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Интернет, МТС, аренда" autoFocus maxLength={120} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Сумма, ₽">{id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} />}</Field>
        <Field label="Категория">{id => <Input id={id} value={category} onChange={e => setCategory(e.target.value)} placeholder="Связь" maxLength={80} />}</Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Периодичность">
          {id => (
            <Select id={id} value={frequency} onChange={e => setFrequency(e.target.value as RecurringPayment['frequency'])}>
              {(Object.entries(FREQUENCY_LABEL) as Array<[RecurringPayment['frequency'], string]>).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {frequency === 'monthly' ? (
          <Field label="День месяца">{id => <Input id={id} inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} />}</Field>
        ) : (
          <Field label="Ближайшая дата">{id => <Input id={id} type="date" value={next} onChange={e => setNext(e.target.value)} />}</Field>
        )}
      </div>
      {frequency === 'monthly' && (
        <Field label="Ближайшая дата" hint="Дата первого или следующего списания">
          {id => <Input id={id} type="date" value={next} onChange={e => setNext(e.target.value)} />}
        </Field>
      )}
      <Field label="Комментарий">{id => <Input id={id} value={comment} onChange={e => setComment(e.target.value)} maxLength={300} />}</Field>
    </FormShell>
  );
}
