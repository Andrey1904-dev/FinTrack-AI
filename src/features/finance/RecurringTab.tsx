import { Check, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/data/auth';
import { useDeleteRow, useInvalidate, useRows, useSaveRow } from '@/data/hooks';
import { advance, describeFrequency, monthlyEquivalent } from '@/lib/calc';
import { daysBetween, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtDate, money, relativeDays } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { cn, uid } from '@/lib/utils';
import type { RecurringPayment } from '@/types';
import { RecurringForm } from './RecurringForm';

export function RecurringTab() {
  const { rows, isLoading, error, refetch } = useRows('recurring_payments');
  const save = useSaveRow('recurring_payments');
  const del = useDeleteRow('recurring_payments');
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();
  const { user } = useAuth();
  const [edit, setEdit] = useState<RecurringPayment | 'new' | null>(null);
  const today = todayISO();

  const markPaid = async (p: RecurringPayment) => {
    try {
      const { error: err } = await supabase.from('finance_operations').insert({
        user_id: user?.id, client_id: uid('os'), type: p.kind, amount: p.amount, category: p.category,
        note: p.title, date: p.next_date > today ? today : p.next_date,
      });
      if (err) throw err;
      await save.mutateAsync({ id: p.id, next_date: advance(p.next_date, p.frequency, p.day_of_month) });
      await invalidate('finance_operations');
      toast.success(p.kind === 'income' ? 'Доход записан, дата сдвинута' : 'Платёж записан в расходы, дата сдвинута');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось записать платёж'));
    }
  };
  const toggleActive = async (p: RecurringPayment) => {
    try { await save.mutateAsync({ id: p.id, active: !p.active }); } catch (e) { toast.error(friendlyError(e, 'Не удалось обновить платёж')); }
  };
  const remove = async (p: RecurringPayment) => {
    if (!(await confirm({ title: 'Удалить повторяющийся платёж?', text: p.title, confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(p.id); toast.success('Платёж удалён'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить платёж')); }
  };

  if (error) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <Skeleton className="h-48" />;
  const sorted = [...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.next_date.localeCompare(b.next_date));
  const monthly = rows.filter(r => r.active && r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{rows.length ? <>Обязательные платежи в месяц: <span className="tabular text-fg">{money(monthly)}</span></> : 'Подписки, связь, коммунальные услуги, зарплата — всё, что повторяется.'}</p>
        <Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Платёж</Button>
      </div>
      {rows.length === 0 ? (
        <Card><EmptyState icon={<Repeat size={20} />} title="Повторяющихся платежей пока нет" text={'Добавьте МТС, телевидение, коммунальные услуги или зарплату —\nприложение само создаст будущие события и напомнит о них.'} action="Добавить платёж" onAction={() => setEdit('new')} /></Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {sorted.map(p => {
              const d = daysBetween(today, p.next_date);
              return (
                <li key={p.id} className={cn('group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3', !p.active && 'opacity-50')}>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">{p.title}{!p.active && <Badge>пауза</Badge>}</p>
                    <p className="text-xs text-muted">{describeFrequency(p)} · {p.category}</p>
                    {p.active && <p className={cn('mt-0.5 text-xs', d < 0 ? 'text-bad' : d <= 3 ? 'text-warn' : 'text-muted')}>
                      {d < 0 ? `Платёж ${relativeDays(p.next_date, today)}` : d === 0 ? 'Платёж сегодня' : `Следующий платёж ${relativeDays(p.next_date, today)}`} · {fmtDate(p.next_date)}</p>}
                  </div>
                  <span className={cn('tabular text-sm font-semibold', p.kind === 'income' && 'text-good')}>{p.kind === 'income' ? '+' : ''}{money(p.amount)}</span>
                  <span className="flex items-center gap-0.5">
                    {p.active && <Button size="sm" onClick={() => void markPaid(p)}><Check size={14} /> {p.kind === 'income' ? 'Получено' : 'Оплачено'}</Button>}
                    <Button variant="ghost" size="icon" aria-label={p.active ? 'Поставить на паузу' : 'Возобновить'} onClick={() => void toggleActive(p)}>{p.active ? <Pause size={14} /> : <Play size={14} />}</Button>
                    <Button variant="ghost" size="icon" aria-label="Изменить" onClick={() => setEdit(p)}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" aria-label="Удалить" onClick={() => void remove(p)}><Trash2 size={14} /></Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Повторяющийся платёж' : 'Изменить платёж'}>
        {edit && <RecurringForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
