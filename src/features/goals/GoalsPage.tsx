import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Chips, Field, Input, MoneyInput, Textarea } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Progress, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { GOAL_CATEGORIES } from '@/lib/constants';
import { daysBetween, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDate, money, num, pct, relativeDays } from '@/lib/format';
import type { Goal } from '@/types';

function GoalForm({ initial, onDone }: { initial?: Goal; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Финансы');
  const [target, setTarget] = useState(initial ? String(initial.target_amount) : '');
  const [current, setCurrent] = useState(initial ? String(initial.current_amount) : '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('financial_goals');
  const { saving, error, run } = useSubmit('Не удалось сохранить цель', 'Цель сохранена', onDone);
  return (
    <FormShell saving={saving} error={error || err} onSubmit={() => {
      if (!title.trim()) return setErr('Введите название цели');
      if (num(target) <= 0) return setErr('Укажите целевую сумму');
      setErr('');
      void run(() => save.mutateAsync({
        id: initial?.id, title: title.trim(), category: category.trim() || 'Финансы', target_amount: num(target), current_amount: num(current),
        deadline: deadline || null, comment: comment.trim(), status: num(current) >= num(target) ? 'done' : 'active',
      }));
    }}>
      <Field label="Название">{id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Накопить резерв" autoFocus maxLength={120} />}</Field>
      <Field label="Категория">{() => <Chips value={category} onChange={setCategory} options={[...new Set([category, ...GOAL_CATEGORIES])]} />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Целевая сумма, ₽">{id => <MoneyInput id={id} value={target} onChange={e => setTarget(e.target.value)} />}</Field>
        <Field label="Накоплено, ₽">{id => <MoneyInput id={id} value={current} onChange={e => setCurrent(e.target.value)} />}</Field>
      </div>
      <Field label="Дедлайн">{id => <Input id={id} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />}</Field>
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[60px]" />}</Field>
    </FormShell>
  );
}

function Contribute({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const save = useSaveRow('financial_goals');
  const { saving, error, run } = useSubmit('Не удалось обновить цель', 'Сумма добавлена', onDone);
  return (
    <FormShell saving={saving} error={error || err} submitText="Добавить" onSubmit={() => {
      if (num(amount) === 0) return setErr('Введите сумму');
      const next = Math.max(0, goal.current_amount + num(amount));
      setErr('');
      void run(() => save.mutateAsync({ id: goal.id, current_amount: next, status: goal.target_amount > 0 && next >= goal.target_amount ? 'done' : 'active' }));
    }}>
      <p className="text-sm text-muted">Сейчас накоплено {money(goal.current_amount)} из {money(goal.target_amount)}. Для уменьшения введите отрицательную сумму.</p>
      <Field label="Сколько добавить, ₽">{id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />}</Field>
    </FormShell>
  );
}

export default function GoalsPage() {
  const { rows, isLoading, error, refetch } = useRows('financial_goals');
  const del = useDeleteRow('financial_goals');
  const confirm = useConfirm();
  const toast = useToast();
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const today = todayISO();

  const remove = async (g: Goal) => {
    if (!(await confirm({ title: 'Удалить цель?', text: g.title, confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(g.id); toast.success('Цель удалена'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить цель')); }
  };
  const list = [...rows].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Цели" subtitle="К чему я сейчас иду?" actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Цель</Button>} />
      {error ? <ErrorState onRetry={() => void refetch()} /> : isLoading ? <Skeleton className="h-48" /> : list.length === 0 ? (
        <Card><EmptyState icon={<Target size={20} />} title="Целей пока нет" text={'Поставьте цель: купить автомобиль, закрыть долги,\nнакопить резерв — и следите за прогрессом.'} action="Создать цель" onAction={() => setEdit('new')} /></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.map(g => {
            const p = g.target_amount ? (g.current_amount / g.target_amount) * 100 : 0;
            const left = Math.max(0, g.target_amount - g.current_amount);
            const months = g.deadline ? Math.max(1, Math.ceil(daysBetween(today, g.deadline) / 30.4)) : null;
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0"><h3 className="truncate font-semibold">{g.title}</h3><p className="mt-0.5 text-xs text-muted">{g.category}</p></div>
                  <span className="-mr-2 -mt-1 flex shrink-0">
                    <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setEdit(g)}><Pencil size={15} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(g)}><Trash2 size={15} /></Button>
                  </span>
                </div>
                <div className="mt-4 flex items-baseline justify-between"><span className="tabular text-lg font-semibold">{money(g.current_amount)}</span><span className="tabular text-sm text-muted">из {money(g.target_amount)}</span></div>
                <Progress value={p} tone={g.status === 'done' ? 'good' : 'accent'} className="mt-2" label={g.title} />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>{g.status === 'done' ? <Badge tone="good">Достигнута</Badge> : `${pct(Math.min(100, p))} · осталось ${money(left)}`}</span>
                  {g.deadline && g.status !== 'done' && <span>{fmtDate(g.deadline)} · {relativeDays(g.deadline, today)}</span>}
                </div>
                {months && g.status !== 'done' && left > 0 && <p className="mt-2 text-xs text-muted">Чтобы успеть к сроку, нужно откладывать около <span className="text-fg">{money(left / months)}</span> в месяц.</p>}
                {g.comment && <p className="mt-2 text-xs text-muted/90">{g.comment}</p>}
                {g.status !== 'done' && <Button size="sm" className="mt-3" onClick={() => setAdd(g)}><Plus size={14} /> Пополнить</Button>}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая цель' : 'Изменить цель'}>
        {edit && <GoalForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
      <Modal open={!!add} onOpenChange={o => !o && setAdd(null)} title={add ? `Пополнить: ${add.title}` : ''}>
        {add && <Contribute goal={add} onDone={() => setAdd(null)} />}
      </Modal>
    </div>
  );
}
