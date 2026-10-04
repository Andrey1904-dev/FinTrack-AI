import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Chips, Field, Input, MoneyInput, Segmented, Select } from '@/components/ui/form';
import { useCategoryOptions } from '@/data/categories';
import { useSaveRow } from '@/data/hooks';
import { parseQuickEntry, parseSalaryQuickEntry } from '@/lib/calc';
import { todayISO } from '@/lib/dates';
import { num } from '@/lib/format';
import { uid } from '@/lib/utils';
import type { Operation } from '@/types';
import { FormShell, useSubmit } from './shared';
import { useQuick } from './QuickProvider';
import { Button } from '@/components/ui/button';

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
  const quick = useQuick();

  const applySmart = (text: string) => {
    setSmart(text);
    // First check salary parsing
    const salaryParsed = parseSalaryQuickEntry(text);
    if (salaryParsed) return; // handled via hint UI
    const parsed = parseQuickEntry(text);
    if (!parsed) return;
    setType(parsed.type);
    setAmount(String(parsed.amount));
    setCategory(parsed.category);
    setNote(parsed.note);
  };
  const parsed = smart ? parseQuickEntry(smart) : null;
  const salaryParsed = smart ? parseSalaryQuickEntry(smart) : null;

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
          <Segmented
            ariaLabel="Тип операции"
            value={type}
            onChange={v => {
              setType(v);
              setCategory(v === 'income' ? 'Зарплата' : 'Продукты');
            }}
            className="w-full"
            options={[
              { value: 'expense', label: 'Расход' },
              { value: 'income', label: 'Доход' },
            ]}
          />
          <Field
            label="Умный ввод"
            hint={
              salaryParsed
                ? `Распознано как зарплата: ${salaryParsed.type === 'salary_hours' ? `${salaryParsed.hours} ч` : `${salaryParsed.cases} чехлов`} на ${salaryParsed.date}. Нажмите кнопку ниже, чтобы внести рабочие часы.`
                : parsed
                  ? `Распознано: ${parsed.type === 'income' ? 'доход' : 'расход'} ${parsed.amount} ₽ · ${parsed.category} · раздел «${parsed.section}». Проверьте поля ниже и сохраните.`
                  : 'Например: +1200 бензин — поля заполнятся сами. Также понимает: «Отработал сегодня 8 часов», «350 чехлов»'
            }
          >
            {id => (
              <div className="space-y-2">
                <div className="relative">
                  <Sparkles size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                  <Input id={id} value={smart} onChange={e => applySmart(e.target.value)} placeholder="+1200 бензин или отработал 8 часов" className="pl-9" autoComplete="off" />
                </div>
                {salaryParsed && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      quick.open('salary_hours', { hours: salaryParsed.hours, date: salaryParsed.date });
                      onDone();
                    }}
                  >
                    Внести {salaryParsed.hours ? `${salaryParsed.hours} ч` : `${salaryParsed.cases} чехлов`} в зарплату
                  </Button>
                )}
              </div>
            )}
          </Field>
        </>
      )}

      <Field label="Сумма, ₽">
        {id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} autoFocus={!initial} />}
      </Field>

      <Field label="Категория">
        {() => (
          <div className="space-y-2">
            <Chips value={category} onChange={setCategory} options={categories.includes(category) ? categories : [category, ...categories]} />
            <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="Или своя категория" maxLength={80} aria-label="Своя категория" />
          </div>
        )}
      </Field>

      <Field label="Комментарий">
        {id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: Газпром" maxLength={300} />}
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
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
