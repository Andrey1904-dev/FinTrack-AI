import { CheckSquare, Flag, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { IconButton, Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Segmented } from '@/components/ui/form';
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Share, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useRows } from '@/data/hooks';
import { TaskForm } from '@/features/forms/TaskForm';
import { PRIORITY_LABEL, TASK_CATEGORIES } from '@/lib/constants';
import { todayISO } from '@/lib/dates';
import { fmtDate, plural, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Task, TaskCategory } from '@/types';
import { useTaskActions } from './useTaskActions';

const PRIORITY_TONE = { low: 'neutral', medium: 'warn', high: 'bad' } as const;
const RANK = { high: 0, medium: 1, low: 2 };

/** Single task line. Exported for reuse on the Today screen. */
export function TaskRow({ task, onEdit }: { task: Task; onEdit?: (t: Task) => void }) {
  const { toggle, remove } = useTaskActions();
  const today = todayISO();
  const done = task.status === 'done';
  const overdue = !done && task.due_date && task.due_date < today;
  const category = TASK_CATEGORIES.find(c => c.value === task.category)?.label;
  return (
    <li className="group flex items-start gap-3 border-b border-line/70 px-4 py-3 last:border-b-0">
      <label className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={done}
          onChange={() => void toggle(task)}
          aria-label={`${done ? 'Снять отметку' : 'Отметить выполненной'}: ${task.title}`}
          className="h-[18px] w-[18px] rounded-[2px] accent-[#F0A828]"
        />
      </label>
      <div className="min-w-0 flex-1 py-[3px]">
        <p className={cn('text-[13.5px] leading-snug', done ? 'text-mute line-through' : 'text-txt')}>{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-mute">
          {task.due_date && <span className={cn('tnum', overdue && 'text-red')}>{overdue ? relativeDays(task.due_date, today) : fmtDate(task.due_date)}</span>}
          {task.priority !== 'medium' && (
            <Badge tone={PRIORITY_TONE[task.priority]}>
              <Flag size={10} />
              {PRIORITY_LABEL[task.priority]}
            </Badge>
          )}
          {task.recurrence !== 'none' && (
            <span className="inline-flex items-center gap-1">
              <Repeat size={10} /> повтор
            </span>
          )}
          {category && <span>{category}</span>}
        </div>
        {task.note && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-dim">{task.note}</p>}
      </div>
      <div className="flex shrink-0 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {onEdit && (
          <IconButton label="Изменить задачу" size="icon-sm" onClick={() => onEdit(task)}>
            <Pencil size={14} />
          </IconButton>
        )}
        <IconButton label="Удалить задачу" size="icon-sm" onClick={() => void remove(task)}>
          <Trash2 size={14} />
        </IconButton>
      </div>
    </li>
  );
}

export default function TasksPage() {
  const { rows, isLoading, error, refetch } = useRows('tasks');
  const [cat, setCat] = useState<'all' | TaskCategory>('all');
  const [show, setShow] = useState<'open' | 'done'>('open');
  const [edit, setEdit] = useState<Task | 'new' | null>(null);
  const today = todayISO();

  const open = useMemo(() => rows.filter(t => t.status === 'todo'), [rows]);
  const done = useMemo(() => rows.filter(t => t.status === 'done'), [rows]);
  const overdue = open.filter(t => t.due_date && t.due_date < today).length;
  const progress = rows.length ? (done.length / rows.length) * 100 : 0;

  const list = useMemo(
    () =>
      rows
        .filter(t => (cat === 'all' || t.category === cat) && (show === 'open' ? t.status === 'todo' : t.status === 'done'))
        .sort((a, b) =>
          show === 'done'
            ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
            : (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || RANK[a.priority] - RANK[b.priority],
        ),
    [rows, cat, show],
  );

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Задачи"
        code={codeFor('/tasks')}
        subtitle="Что нужно сделать — по приоритету и сроку, без лишнего шума"
        actions={
          <Button variant="primary" onClick={() => setEdit('new')}>
            <Plus size={16} /> Задача
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Активные" value={open.length} sub={open.length ? `из ${rows.length} задач` : 'всё закрыто'} />
        <Stat label="Просрочено" value={overdue} tone={overdue ? 'bad' : undefined} sub={overdue ? 'требует внимания' : 'держите темп'} />
        <Stat label="Выполнено" value={done.length} tone="good" sub={`за всё время`} />
        <Panel flat className="min-w-0 px-4 py-3.5">
          <p className="silk truncate">Прогресс</p>
          <p className="tnum mt-2 text-[16px] font-medium leading-tight text-txt sm:text-[18px]">{Math.round(progress)}%</p>
          <Share value={progress} tone={progress >= 70 ? '#31D3C4' : '#F0A828'} className="mt-2" />
        </Panel>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-bar -mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <Segmented
            ariaLabel="Категория задач"
            value={cat}
            onChange={setCat}
            options={[{ value: 'all', label: 'Все' }, ...TASK_CATEGORIES]}
          />
        </div>
        <Segmented
          ariaLabel="Статус задач"
          value={show}
          onChange={setShow}
          className="w-full lg:w-auto"
          options={[
            { value: 'open', label: 'Активные' },
            { value: 'done', label: 'Выполненные' },
          ]}
        />
      </div>

      {error ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Panel flat={false} className="overflow-hidden p-0">
          {list.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<CheckSquare size={18} />}
                title={show === 'open' ? (cat === 'all' ? 'Активных задач нет' : 'В этой категории пусто') : 'Выполненных задач пока нет'}
                text={
                  show === 'open'
                    ? 'Добавьте задачу — например, «Оплатить коммунальные до 10-го».'
                    : 'Отмечайте задачи галочкой — они появятся здесь.'
                }
                action={show === 'open' ? 'Добавить задачу' : undefined}
                onAction={show === 'open' ? () => setEdit('new') : undefined}
              />
            </div>
          ) : (
            <>
              <p className="silk border-b border-line px-4 py-2.5">
                {list.length} {plural(list.length, ['задача', 'задачи', 'задач'])}
                {cat !== 'all' && ` · ${TASK_CATEGORIES.find(c => c.value === cat)?.label}`}
              </p>
              <ul>
                {list.map(t => (
                  <TaskRow key={t.id} task={t} onEdit={setEdit} />
                ))}
              </ul>
            </>
          )}
        </Panel>
      )}

      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новая задача' : 'Изменить задачу'}>
        {edit && (
          <TaskForm
            initial={edit === 'new' ? undefined : edit}
            defaults={cat !== 'all' ? { category: cat } : undefined}
            onDone={() => setEdit(null)}
          />
        )}
      </Modal>
    </div>
  );
}
