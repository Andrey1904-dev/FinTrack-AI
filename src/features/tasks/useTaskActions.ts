import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useSaveRow } from '@/data/hooks';
import { addDaysISO, addMonthsISO, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import type { Task } from '@/types';

function nextDue(task: Task): string {
  const from = task.due_date && task.due_date > todayISO() ? task.due_date : todayISO();
  if (task.recurrence === 'daily') return addDaysISO(from, 1);
  if (task.recurrence === 'weekly') return addDaysISO(from, 7);
  return addMonthsISO(from, 1);
}

export function useTaskActions() {
  const save = useSaveRow('tasks');
  const del = useDeleteRow('tasks');
  const toast = useToast();

  const toggle = async (task: Task) => {
    try {
      if (task.status === 'todo') {
        await save.mutateAsync({ id: task.id, status: 'done', completed_at: new Date().toISOString() });
        if (task.recurrence !== 'none') {
          await save.mutateAsync({
            title: task.title, category: task.category, priority: task.priority, recurrence: task.recurrence, note: task.note,
            due_date: nextDue(task), status: 'todo',
          });
          toast.success('Выполнено. Следующее повторение уже создано');
        }
      } else {
        await save.mutateAsync({ id: task.id, status: 'todo', completed_at: null });
      }
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось обновить задачу'));
    }
  };

  const remove = async (task: Task) => {
    try {
      await del.mutateAsync(task.id);
      toast.success('Задача удалена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить задачу'));
    }
  };
  return { toggle, remove };
}
