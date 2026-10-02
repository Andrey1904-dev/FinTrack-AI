import { useState } from 'react';
import { Chips, Field, Input, Segmented, Select, Textarea } from '@/components/ui/form';
import { useSaveRow } from '@/data/hooks';
import { RECURRENCE_LABEL, TASK_CATEGORIES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import type { Task, TaskCategory } from '@/types';
import { FormShell, useSubmit } from './shared';

export function TaskForm({ initial, defaults, onDone }: { initial?: Task; defaults?: Partial<Task>; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? defaults?.title ?? '');
  const [category, setCategory] = useState<TaskCategory>(initial?.category ?? defaults?.category ?? 'today');
  const [due, setDue] = useState(initial?.due_date ?? defaults?.due_date ?? (category === 'today' ? todayISO() : ''));
  const [priority, setPriority] = useState<Task['priority']>(initial?.priority ?? 'medium');
  const [recurrence, setRecurrence] = useState<Task['recurrence']>(initial?.recurrence ?? 'none');
  const [note, setNote] = useState(initial?.note ?? '');
  const [fieldError, setFieldError] = useState('');
  const save = useSaveRow('tasks');
  const { saving, error, run } = useSubmit('Не удалось сохранить задачу', 'Задача сохранена', onDone);

  const submit = () => {
    if (!title.trim()) return setFieldError('Введите название задачи');
    setFieldError('');
    void run(() => save.mutateAsync({ id: initial?.id, title: title.trim(), category, due_date: due || null, priority, recurrence, note: note.trim() }));
  };
  return (
    <FormShell onSubmit={submit} saving={saving} error={error || fieldError}>
      <Field label="Задача">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Что нужно сделать?" autoFocus maxLength={200} />}</Field>
      <Field label="Категория">
        {() => <Chips value={TASK_CATEGORIES.find(c => c.value === category)?.label ?? ''} onChange={l => {
          const c = TASK_CATEGORIES.find(x => x.label === l)!.value;
          setCategory(c);
          if (c === 'today' && !due) setDue(todayISO());
        }} options={TASK_CATEGORIES.map(c => c.label)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дедлайн">{id => <Input id={id} type="date" value={due} onChange={e => setDue(e.target.value)} />}</Field>
        <Field label="Повторение">
          {id => <Select id={id} value={recurrence} onChange={e => setRecurrence(e.target.value as Task['recurrence'])}>{Object.entries(RECURRENCE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}
        </Field>
      </div>
      <Field label="Приоритет">
        {() => <Segmented value={priority} onChange={setPriority} className="w-full" options={[{ value: 'low', label: 'Низкий' }, { value: 'medium', label: 'Средний' }, { value: 'high', label: 'Высокий' }]} />}
      </Field>
      <Field label="Заметка">{id => <Textarea id={id} value={note} onChange={e => setNote(e.target.value)} className="min-h-[64px]" maxLength={1000} />}</Field>
    </FormShell>
  );
}
