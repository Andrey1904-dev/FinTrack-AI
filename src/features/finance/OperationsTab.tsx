import { Download, Pencil, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CategoryBars } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Input, Segmented } from '@/components/ui/form';
import { Card, CardHeader, EmptyState, ErrorState, Skeleton, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows } from '@/data/hooks';
import { OperationForm } from '@/features/forms/OperationForm';
import { useQuick } from '@/features/forms/QuickProvider';
import { byCategory, monthStats } from '@/lib/calc';
import { monthKey, shiftMonthKey, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCSV } from '@/lib/export';
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
    try { await del.mutateAsync(o.id); toast.success('Запись удалена'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить запись')); }
  };
  const exportOps = (t: 'expense' | 'income') => downloadCSV(t === 'expense' ? 'expenses' : 'income', rows.filter(o => o.type === t), [
    { header: 'Дата', value: o => o.date }, { header: 'Сумма', value: o => o.amount }, { header: 'Категория', value: o => o.category },
    { header: 'Комментарий', value: o => o.note }, ...(t === 'income' ? [{ header: 'Регулярность', value: (o: Operation) => o.recurrence }] : []),
  ]);

  if (error) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>;
  if (rows.length === 0) {
    return (
      <Card><EmptyState icon={<Receipt size={20} />} title="Операций пока нет" text={'Добавьте первый расход или доход,\nчтобы начать отслеживать деньги.'} action="Добавить расход" onAction={() => quick.open('expense')} />
        <div className="-mt-4 pb-6 text-center"><Button variant="ghost" size="sm" onClick={() => quick.open('income')}>или добавить доход</Button></div></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonthKey(month, -1))}>‹</Button>
          <span className="min-w-36 text-center text-sm font-medium">{fmtMonth(month)}</span>
          <Button variant="ghost" size="icon" aria-label="Следующий месяц" onClick={() => setMonth(shiftMonthKey(month, 1))}>›</Button>
        </div>
        <div className="flex gap-2"><Button size="sm" onClick={() => exportOps('expense')}><Download size={14} /> Расходы CSV</Button><Button size="sm" className="max-sm:hidden" onClick={() => exportOps('income')}><Download size={14} /> Доходы CSV</Button></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Доход" value={money(stats.income)} />
        <Stat label="Расходы" value={money(stats.expense)} />
        <Stat label="Свободно" value={money(stats.free)} tone={stats.free < 0 ? 'bad' : 'good'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex flex-col gap-3 p-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <Segmented value={type} onChange={v => { setType(v); setLimit(40); }} options={[{ value: 'all', label: 'Все' }, { value: 'expense', label: 'Расходы' }, { value: 'income', label: 'Доходы' }]} />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Поиск" aria-label="Поиск по операциям" className="sm:max-w-[200px]" />
          </div>
          {list.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted">В этом месяце записей нет.</p> : (
            <div>
              {groups.map(([date, ops]) => (
                <section key={date}>
                  <h4 className="bg-bg/40 px-4 py-1.5 text-xs font-medium text-muted">{fmtDateShort(date)}{date === todayISO() ? ' · сегодня' : ''}</h4>
                  <ul className="divide-y divide-line">
                    {ops.map(o => (
                      <li key={o.id} className="group flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{o.category}</p>
                          {(o.note || o.recurrence !== 'none') && <p className="truncate text-xs text-muted">{o.note}{o.recurrence !== 'none' ? ` · регулярный` : ''}</p>}
                        </div>
                        <span className={cn('tabular shrink-0 text-sm font-medium', o.type === 'income' && 'text-good')}>{o.type === 'income' ? '+' : '−'}{money(o.amount).replace('−', '')}</span>
                        <span className="flex shrink-0 opacity-50 transition-opacity group-hover:opacity-100">
                          <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setEdit(o)}><Pencil size={14} /></Button>
                          <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(o)}><Trash2 size={14} /></Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
              {list.length > limit && <div className="p-3 text-center"><Button variant="ghost" onClick={() => setLimit(l => l + 40)}>Показать ещё</Button></div>}
            </div>
          )}
        </Card>
        <Card className="self-start">
          <CardHeader title="Куда уходят деньги" />
          <div className="p-4 pt-3">{cats.length ? <CategoryBars items={cats} limit={8} /> : <p className="py-6 text-center text-sm text-muted">Расходов в этом месяце нет.</p>}</div>
        </Card>
      </div>
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title="Изменить запись">
        {edit && <OperationForm type={edit.type} initial={edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
