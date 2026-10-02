import { CheckSquare, Flag, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/form';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui/misc';
import { useRows } from '@/data/hooks';
import { TaskForm } from '@/features/forms/TaskForm';
import { PRIORITY_LABEL, TASK_CATEGORIES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { fmtDate, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Task, TaskCategory } from '@/types';
import { useTaskActions } from './useTaskActions';

const PRIORITY_TONE = { low: 'neutral', medium: 'warn', high: 'bad' } as const;
const RANK = { high: 0, medium: 1, low: 2 };

export function TaskRow({ task, onEdit }: { task: Task; onEdit?: (t: Task) => void }) {
  const { toggle, remove } = useTaskActions();
  const today = todayISO();
  const overdue = task.status === 'todo' && task.due_date && task.due_date < today;
  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <input type="checkbox" checked={task.status === 'done'} onChange={() => void toggle(task)} aria-label={`Выполнено: ${task.title}`} className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded accent-[hsl(var(--accent))]" />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', task.status === 'done' && 'text-muted line-through')}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {task.due_date && <span className={cn(overdue && 'text-bad')}>{overdue ? relativeDays(task.due_date, today) : fmtDate(task.due_date)}</span>}
          {task.priority !== 'medium' && <Badge tone={PRIORITY_TONE[task.priority]}><Flag size={11} className="mr-1" />{PRIORITY_LABEL[task.priority]}</Badge>}
          {task.recurrence !== 'none' && <span className="inline-flex items-center gap-1"><Repeat size={11} /> повтор</span>}
          <span>{TASK_CATEGORIES.find(c => c.value === task.category)?.label}</span>
        </div>
        {task.note && <p className="mt-1 line-clamp-2 text-xs text-muted/90">{task.note}</p>}
      </div>
      <span className="flex opacity-60 transition-opacity group-hover:opacity-100">
        {onEdit && <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => onEdit(task)}><Pencil size={14} /></Button>}
        <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(task)}><Trash2 size={14} /></Button>
      </span>
    </li>
  );
}

export default function TasksPage() {
  const { rows, isLoading, error, refetch } = useRows('tasks');
  const [cat, setCat] = useState<'all' | TaskCategory>('all');
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [edit, setEdit] = useState<Task | 'new' | null>(null);

  const list = useMemo(() => rows
    .filter(t => (cat === 'all' || t.category === cat) && (show === 'open' ? t.status === 'todo' : t.status === 'done'))
    .sort((a, b) => show === 'done'
      ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
      : (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || RANK[a.priority] - RANK[b.priority]), [rows, cat, show]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Задачи" subtitle="Что нужно сделать — просто и без лишнего" actions={<Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Задача</Button>} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={cat} onChange={setCat} options={[{ value: 'all', label: 'Все' }, ...TASK_CATEGORIES]} />
        </div>
        <Segmented value={show} onChange={setShow} options={[{ value: 'open', label: 'Активные' }, { value: 'done', label: 'Выполненные' }]} />
      </div>
      {error ? <ErrorState onRetry={() => void refetch()} /> : isLoading ? <Skeleton className="h-48" /> : (
        <Card>
          {list.length === 0 ? (
            <EmptyState icon={<CheckSquare size={20} />} title={show === 'open' ? 'Активных задач нет' : 'Выполненных задач пока нет'}
              text={show === 'open' ? 'Добавьте задачу — например, «Оплатить коммунальные».' : undefined}
              action={show === 'open' ? 'Добавить задачу' : undefined} onAction={() => setEdit('new')} />
          ) : <ul className="divide-y divide-line">{list.map(t => <TaskRow key={t.id} task={t} onEdit={setEdit} />)}</ul>}
        </Card>
      )}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая задача' : 'Изменить задачу'}>
        {edit && <TaskForm initial={edit === 'new' ? undefined : edit} defaults={cat !== 'all' ? { category: cat } : undefined} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
