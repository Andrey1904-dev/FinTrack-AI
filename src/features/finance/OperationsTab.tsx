import { ChevronLeft, ChevronRight, Download, Pencil, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBars } from '@/components/charts/charts';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Input, Segmented } from '@/components/ui/form';
import { EmptyState, ErrorState, Panel, PanelLink, Skeleton, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows } from '@/data/hooks';
import { OperationForm } from '@/features/forms/OperationForm';
import { useQuick } from '@/features/forms/QuickProvider';
import { byCategory, monthStats } from '@/lib/calc';
import { monthKey, shiftMonthKey, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCSV } from '@/lib/export';
import { Tooltip } from '@/components/ui/menu';
import { fmtDate, fmtDateShort, fmtMonth, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Operation } from '@/types';

export function OperationsTab() {
  const { rows, isLoading, error, refetch } = useRows('finance_operations');
  const del = useDeleteRow('finance_operations');
  const confirm = useConfirm();
  const toast = useToast();
  const quick = useQuick();
  const [month, setMonth] = useState(monthKey(todayISO()));
  const [type, setType] = useState<'all' | 'expense' | 'income'>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(40);
  const [edit, setEdit] = useState<Operation | null>(null);

  const stats = useMemo(() => monthStats(rows, month), [rows, month]);
  const cats = useMemo(() => byCategory(rows, 'expense', month), [rows, month]);
  const inMonth = useMemo(() => rows.filter(o => monthKey(o.date) === month), [rows, month]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inMonth.filter(o => (type === 'all' || o.type === type) && (!s || `${o.category} ${o.note} ${o.amount}`.toLowerCase().includes(s)));
  }, [inMonth, type, q]);
  const groups = useMemo(() => {
    const map = new Map<string, Operation[]>();
    for (const o of list.slice(0, limit)) map.set(o.date, [...(map.get(o.date) ?? []), o]);
    return [...map.entries()];
  }, [list, limit]);

  const remove = async (o: Operation) => {
    if (!(await confirm({ title: 'Удалить запись?', text: `${o.category} · ${money(o.amount)} · ${fmtDate(o.date)}`, confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(o.id);
      toast.success('Запись удалена');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить запись'));
    }
  };
  const exportOps = (t: 'expense' | 'income') =>
    downloadCSV(t === 'expense' ? 'expenses' : 'income', rows.filter(o => o.type === t), [
      { header: 'Дата', value: o => o.date },
      { header: 'Сумма', value: o => o.amount },
      { header: 'Категория', value: o => o.category },
      { header: 'Комментарий', value: o => o.note },
      ...(t === 'income' ? [{ header: 'Регулярность', value: (o: Operation) => o.recurrence }] : []),
    ]);

  if (error) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading)
    return (
      <div className="space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  if (rows.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={<Receipt size={17} />}
          title="Операций пока нет"
          text={'Добавьте первый расход или доход,\nчтобы начать отслеживать деньги.'}
          action="Добавить расход"
          onAction={() => quick.open('expense')}
        />
        <div className="-mt-3 pb-5 text-center">
          <Button variant="ghost" size="sm" onClick={() => quick.open('income')}>
            или добавить доход
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      {/* month switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Tooltip label="Предыдущий месяц">
            <IconButton label="Предыдущий месяц" onClick={() => setMonth(shiftMonthKey(month, -1))}>
              <ChevronLeft size={17} />
            </IconButton>
          </Tooltip>
          <span className="min-w-[128px] text-center text-[12.5px] font-medium text-txt">{fmtMonth(month)}</span>
          <Tooltip label="Следующий месяц">
            <IconButton label="Следующий месяц" onClick={() => setMonth(shiftMonthKey(month, 1))}>
              <ChevronRight size={17} />
            </IconButton>
          </Tooltip>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => exportOps('expense')}>
            <Download size={13} /> <span className="hidden sm:inline">Расходы</span> CSV
          </Button>
          <Button size="sm" onClick={() => exportOps('income')}>
            <Download size={13} /> <span className="hidden sm:inline">Доходы</span> CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Доход" value={money(stats.income)} tone="good" />
        <Stat label="Расходы" value={money(stats.expense)} tone="bad" />
        <Stat label="Свободно" value={money(stats.free)} tone={stats.free < 0 ? 'bad' : 'accent'} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel flat className="min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              ariaLabel="Тип операций"
              value={type}
              onChange={v => {
                setType(v);
                setLimit(40);
              }}
              className="sm:w-[300px]"
              options={[
                { value: 'all', label: 'Все' },
                { value: 'expense', label: 'Расходы' },
                { value: 'income', label: 'Доходы' },
              ]}
            />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Поиск по записям"
              aria-label="Поиск по операциям"
              type="search"
              className="sm:max-w-[220px]"
            />
          </div>

          {list.length === 0 ? (
            <p className="px-4 py-12 text-center text-[12px] text-mute">В этом месяце записей нет.</p>
          ) : (
            <div>
              {groups.map(([date, ops]) => (
                <section key={date}>
                  <h4 className="silk flex items-center gap-2 border-b border-line/60 bg-ink/40 px-4 py-2">
                    {fmtDateShort(date)}
                    {date === todayISO() && <span className="text-amber">· сегодня</span>}
                  </h4>
                  <ul>
                    {ops.map(o => (
                      <li key={o.id} className="group flex items-center gap-2 border-b border-line/60 px-3 py-2 last:border-0 sm:gap-3 sm:px-4">
                        <div className="min-w-0 flex-1 py-1">
                          <p className="truncate text-[12.5px] text-txt">{o.category}</p>
                          {(o.note || o.recurrence !== 'none') && (
                            <p className="silk mt-1 truncate">
                              {o.note}
                              {o.recurrence !== 'none' ? `${o.note ? ' · ' : ''}регулярный` : ''}
                            </p>
                          )}
                        </div>
                        <span className={cn('tnum shrink-0 text-[13px] font-medium', o.type === 'income' ? 'text-cyan' : 'text-txt')}>
                          {o.type === 'income' ? '+' : '−'}
                          {money(o.amount).replace('−', '')}
                        </span>
                        <span className="flex shrink-0 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                          <IconButton label="Изменить" size="icon-sm" onClick={() => setEdit(o)}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton label="Удалить" size="icon-sm" onClick={() => void remove(o)}>
                            <Trash2 size={14} />
                          </IconButton>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {list.length > limit && (
                <div className="border-t border-line p-3 text-center">
                  <Button variant="ghost" onClick={() => setLimit(l => l + 40)}>
                    Показать ещё
                  </Button>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel
          label="Куда уходят деньги"
          className="min-w-0 self-start"
          right={<PanelLink onClick={() => quick.open('expense')}>+ расход</PanelLink>}
        >
          {cats.length ? (
            <CategoryBars items={cats} limit={8} />
          ) : (
            <EmptyState compact title="Расходов в этом месяце нет" />
          )}
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <span className="silk">Записей в месяце</span>
            <span className="tnum text-[12px] text-dim">{inMonth.length}</span>
          </div>
        </Panel>
      </div>

      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title="Изменить запись">
        {edit && <OperationForm key={edit.id} type={edit.type} initial={edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
