import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Chips, Field, Input, MoneyInput, Segmented, Select } from '@/components/ui/form';
import { useCategoryOptions } from '@/data/categories';
import { useSaveRow } from '@/data/hooks';
import { todayISO } from '@/lib/dates';
import { num } from '@/lib/format';
import { parseQuickEntry } from '@/lib/calc';
import { uid } from '@/lib/utils';
import type { Operation } from '@/types';
import { FormShell, useSubmit } from './shared';

export function OperationForm({ type: initialType, initial, onDone }: { type: 'income' | 'expense'; initial?: Operation; onDone: () => void }) {
  const [type, setType] = useState<'income' | 'expense'>(initial?.type ?? initialType);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [category, setCategory] = useState(initial?.category ?? (initialType === 'income' ? 'Зарплата' : 'Продукты'));
  const [note, setNote] = useState(initial?.note ?? '');
  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [recurrence, setRecurrence] = useState<Operation['recurrence']>(initial?.recurrence ?? 'none');
  const [smart, setSmart] = useState('');
  const [fieldError, setFieldError] = useState('');
  const categories = useCategoryOptions(type);
  const save = useSaveRow('finance_operations');
  const noun = type === 'income' ? 'доход' : 'расход';
  const { saving, error, run } = useSubmit(`Не удалось сохранить ${noun}`, type === 'income' ? 'Доход сохранён' : 'Расход сохранён', onDone);

  const applySmart = (text: string) => {
    setSmart(text);
    const parsed = parseQuickEntry(text);
    if (!parsed) return;
    setType(parsed.type);
    setAmount(String(parsed.amount));
    setCategory(parsed.category);
    setNote(parsed.note);
  };
  const parsed = smart ? parseQuickEntry(smart) : null;

  const submit = () => {
    const value = num(amount);
    if (value <= 0) return setFieldError('Введите сумму больше нуля');
    if (!category.trim()) return setFieldError('Выберите категорию');
    setFieldError('');
    void run(() =>
      save.mutateAsync({
        id: initial?.id,
        ...(initial ? {} : { client_id: uid('os') }),
        type,
        amount: value,
        category: category.trim(),
        note: note.trim(),
        date,
        recurrence: type === 'income' ? recurrence : 'none',
      } as Partial<Operation>),
    );
  };

  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      {!initial && (
        <>
          <Segmented value={type} onChange={v => { setType(v); setCategory(v === 'income' ? 'Зарплата' : 'Продукты'); }} className="w-full"
            options={[{ value: 'expense', label: 'Расход' }, { value: 'income', label: 'Доход' }]} />
          <Field label="Умный ввод" hint={parsed ? `Распознано: ${parsed.type === 'income' ? 'доход' : 'расход'} ${parsed.amount} ₽ · ${parsed.category} · раздел «${parsed.section}». Проверьте поля ниже и сохраните.` : 'Например: +1200 бензин — поля заполнятся сами'}>
            {id => (
              <div className="relative">
                <Sparkles size={15} className="pointer-events-none absolute left-3 top-3 text-muted" />
                <Input id={id} value={smart} onChange={e => applySmart(e.target.value)} placeholder="+1200 бензин" className="pl-9" autoComplete="off" />
              </div>
            )}
          </Field>
        </>
      )}
      <Field label="Сумма, ₽">{id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} autoFocus={!initial} />}</Field>
      <Field label="Категория">
        {() => (
          <div className="space-y-2">
            <Chips value={category} onChange={setCategory} options={categories.includes(category) ? categories : [category, ...categories]} />
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Или своя категория" maxLength={80} aria-label="Своя категория" />
          </div>
        )}
      </Field>
      <Field label="Комментарий">{id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: Газпром" maxLength={300} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">{id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        {type === 'income' && (
          <Field label="Регулярность">
            {id => (
              <Select id={id} value={recurrence} onChange={e => setRecurrence(e.target.value as Operation['recurrence'])}>
                <option value="none">Разовый</option>
                <option value="weekly">Каждую неделю</option>
                <option value="monthly">Каждый месяц</option>
                <option value="yearly">Каждый год</option>
              </Select>
            )}
          </Field>
        )}
      </div>
    </FormShell>
  );
}
