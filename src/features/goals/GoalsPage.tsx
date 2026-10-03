import { Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { CheckRow, Chips, Field, Input, MoneyInput, Segmented, Textarea } from '@/components/ui/form';
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Progress, Readout, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { FormShell, useSubmit } from '@/features/forms/shared';
import { GOAL_CATEGORIES } from '@/lib/constants';
import { daysBetween, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDate, money, num, pct, plural, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Goal } from '@/types';

function GoalForm({ initial, onDone }: { initial?: Goal; onDone: () => void }) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'Финансы');
  const [target, setTarget] = useState(initial ? String(initial.target_amount) : '');
  const [current, setCurrent] = useState(initial ? String(initial.current_amount) : '');
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [done, setDone] = useState(initial?.status === 'done');
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [err, setErr] = useState('');
  const save = useSaveRow('financial_goals');
  const { saving, error, run } = useSubmit('Не удалось сохранить цель', 'Цель сохранена', onDone);

  return (
    <FormShell
      saving={saving}
      error={error || err}
      onSubmit={() => {
        if (!title.trim()) return setErr('Введите название цели');
        if (num(target) <= 0) return setErr('Укажите целевую сумму');
        setErr('');
        void run(() =>
          save.mutateAsync({
            id: initial?.id,
            title: title.trim(),
            category: category.trim() || 'Финансы',
            target_amount: num(target),
            current_amount: num(current),
            deadline: deadline || null,
            comment: comment.trim(),
            status: done || num(current) >= num(target) ? 'done' : 'active',
          }),
        );
      }}
    >
      <Field label="Название">
        {id => <Input id={id} value={title} onChange={e => setTitle(e.target.value)} placeholder="Например: Накопить резерв" autoFocus maxLength={120} />}
      </Field>
      <Field label="Категория">{() => <Chips value={category} onChange={setCategory} options={[...new Set([category, ...GOAL_CATEGORIES])]} />}</Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Целевая сумма, ₽">{id => <MoneyInput id={id} value={target} onChange={e => setTarget(e.target.value)} />}</Field>
        <Field label="Накоплено, ₽">{id => <MoneyInput id={id} value={current} onChange={e => setCurrent(e.target.value)} />}</Field>
      </div>
      <Field label="Дедлайн" hint="Необязательно — по нему считаем нужный темп накоплений">
        {id => <Input id={id} type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />}
      </Field>
      <Field label="Комментарий">{id => <Textarea id={id} value={comment} onChange={e => setComment(e.target.value)} className="min-h-[72px]" maxLength={500} />}</Field>
      {initial && <CheckRow checked={done} onChange={setDone} label="Цель достигнута" />}
    </FormShell>
  );
}

function Contribute({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const save = useSaveRow('financial_goals');
  const { saving, error, run } = useSubmit('Не удалось обновить цель', 'Сумма добавлена', onDone);
  const left = Math.max(0, goal.target_amount - goal.current_amount);

  return (
    <FormShell
      saving={saving}
      error={error || err}
      submitText="Добавить"
      onSubmit={() => {
        if (num(amount) === 0) return setErr('Введите сумму');
        const next = Math.max(0, goal.current_amount + num(amount));
        setErr('');
        void run(() =>
          save.mutateAsync({
            id: goal.id,
            current_amount: next,
            status: goal.target_amount > 0 && next >= goal.target_amount ? 'done' : 'active',
          }),
        );
      }}
    >
      <div className="border border-line bg-rail/40 px-3 py-2.5">
        <p className="silk">Осталось накопить</p>
        <Readout value={left} size="md" tone={left <= 0 ? 'cyan' : 'txt'} className="mt-1.5" />
        <p className="tnum mt-1 text-[11px] text-mute">
          {money(goal.current_amount)} из {money(goal.target_amount)}
        </p>
      </div>
      <Field label="Сколько добавить, ₽" hint="Отрицательная сумма уменьшит накопленное">
        {id => <MoneyInput id={id} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />}
      </Field>
      {left > 0 && (
        <div className="flex flex-wrap gap-2">
          {[Math.round(left / 4), Math.round(left / 2), left].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map(v => (
            <Button key={v} type="button" size="sm" variant="outline" onClick={() => setAmount(String(v))}>
              +{money(v)}
            </Button>
          ))}
        </div>
      )}
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
  const [filter, setFilter] = useState<'active' | 'done' | 'all'>('active');
  const today = todayISO();

  const remove = async (g: Goal) => {
    if (!(await confirm({ title: 'Удалить цель?', text: g.title, confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(g.id);
      toast.success('Цель удалена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить цель'));
    }
  };

  const { list, saved, savedAll, activeCount } = useMemo(() => {
    const sorted = [...rows].sort(
      (a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999'),
    );
    const filtered = sorted.filter(g => (filter === 'all' ? true : filter === 'done' ? g.status === 'done' : g.status !== 'done'));
    return {
      list: filtered,
      saved: rows.filter(g => g.status !== 'done').reduce((s, g) => s + g.current_amount, 0),
      savedAll: rows.reduce((s, g) => s + g.target_amount, 0),
      activeCount: rows.filter(g => g.status !== 'done').length,
    };
  }, [rows, filter]);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Цели"
        code={codeFor('/goals')}
        subtitle="К чему я иду: сколько накоплено, сколько осталось и в каком темпе двигаться"
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus size={16} /> Цель
          </Button>
        }
      />

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64" />
      ) : rows.length === 0 ? (
        <Panel label="Цели">
          <EmptyState
            icon={<Target size={18} />}
            title="Целей пока нет"
            text={'Поставьте цель: купить автомобиль, закрыть долги,\nнакопить резерв — и следите за прогрессом.'}
            action="Создать цель"
            onAction={() => setEdit('new')}
          />
        </Panel>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Panel flat className="min-w-0 px-4 py-3.5">
              <p className="silk truncate">Накоплено</p>
              <Readout value={saved} size="md" tone="cyan" className="mt-2" />
            </Panel>
            <Panel flat className="min-w-0 px-4 py-3.5">
              <p className="silk truncate">Общая цель</p>
              <Readout value={savedAll} size="md" className="mt-2" />
            </Panel>
            <Stat label="Активные цели" value={activeCount} sub={`${plural(rows.length, ['цель', 'цели', 'целей'])} всего`} />
            <Stat
              label="Средний прогресс"
              value={`${Math.round(savedAll ? (saved / savedAll) * 100 : 0)}%`}
              tone="accent"
              sub="по всем целям"
            />
          </div>

          <div className="mb-4">
            <Segmented
              ariaLabel="Фильтр целей"
              value={filter}
              onChange={setFilter}
              className="w-full sm:w-auto"
              options={[
                { value: 'active', label: 'В работе' },
                { value: 'done', label: 'Достигнутые' },
                { value: 'all', label: 'Все' },
              ]}
            />
          </div>

          {list.length === 0 ? (
            <Panel label="Цели">
              <EmptyState compact title={filter === 'done' ? 'Достигнутых целей пока нет' : 'Нет целей в работе'} text="Смените фильтр или создайте новую цель." />
            </Panel>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {list.map((g, i) => {
                const p = g.target_amount ? (g.current_amount / g.target_amount) * 100 : 0;
                const left = Math.max(0, g.target_amount - g.current_amount);
                const daysLeft = g.deadline ? daysBetween(today, g.deadline) : null;
                const months = daysLeft && daysLeft > 0 ? Math.max(1, Math.ceil(daysLeft / 30.4)) : null;
                const isDone = g.status === 'done';
                const behind = !isDone && daysLeft !== null && daysLeft < 0;
                return (
                  <Panel key={g.id} delay={i * 40} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="truncate text-[15px] font-semibold leading-snug text-txt">{g.title}</h2>
                        <p className="mt-1 flex items-center gap-2 text-[11px] text-mute">
                          <span className="silk-b">{g.category}</span>
                          {isDone && <Badge tone="good">Достигнута</Badge>}
                          {behind && <Badge tone="bad">Срок прошёл</Badge>}
                        </p>
                      </div>
                      <div className="-mr-1.5 -mt-1 flex shrink-0">
                        <IconButton label="Изменить цель" size="icon-sm" onClick={() => setEdit(g)}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label="Удалить цель" size="icon-sm" onClick={() => void remove(g)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Readout value={g.current_amount} size="lg" tone={isDone ? 'cyan' : 'txt'} />
                      <span className="tnum text-[11.5px] text-mute">из {money(g.target_amount)}</span>
                    </div>

                    <Progress value={p} tone={isDone ? 'good' : behind ? 'bad' : 'accent'} className="mt-2.5" label={g.title} />

                    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-mute">
                      <span className="tnum">{pct(Math.min(100, p))} · осталось {money(left)}</span>
                      {g.deadline && !isDone && (
                        <span className={cn('tnum', behind && 'text-red')}>
                          {fmtDate(g.deadline)} · {relativeDays(g.deadline, today)}
                        </span>
                      )}
                    </div>

                    {months !== null && left > 0 && (
                      <p className="mt-2.5 border border-line bg-rail/40 px-3 py-2 text-[11.5px] text-dim">
                        Чтобы успеть к сроку, откладывайте около <span className="tnum font-semibold text-txt">{money(left / months)}</span> в месяц.
                      </p>
                    )}
                    {g.comment && <p className="mt-2.5 text-[11.5px] leading-relaxed text-dim">{g.comment}</p>}

                    {!isDone && (
                      <Button size="sm" variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => setAdd(g)}>
                        <Plus size={14} /> Пополнить
                      </Button>
                    )}
                  </Panel>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая цель' : 'Изменить цель'}>
        {edit && <GoalForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
      <Modal open={!!add} onOpenChange={o => !o && setAdd(null)} title={add ? `Пополнить: ${add.title}` : 'Пополнить цель'}>
        {add && <Contribute goal={add} onDone={() => setAdd(null)} />}
      </Modal>
    </div>
  );
}
