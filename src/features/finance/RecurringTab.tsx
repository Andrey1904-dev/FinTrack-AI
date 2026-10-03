import { Check, Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, Panel, Skeleton, Stat } from '@/components/ui/misc';
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
        user_id: user?.id,
        client_id: uid('os'),
        type: p.kind,
        amount: p.amount,
        category: p.category,
        note: p.title,
        date: p.next_date > today ? today : p.next_date,
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
    try {
      await save.mutateAsync({ id: p.id, active: !p.active });
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось обновить платёж'));
    }
  };

  const remove = async (p: RecurringPayment) => {
    if (!(await confirm({ title: 'Удалить повторяющийся платёж?', text: p.title, confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(p.id);
      toast.success('Платёж удалён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить платёж'));
    }
  };

  if (error) return <ErrorState onRetry={() => void refetch()} />;
  if (isLoading) return <Skeleton className="h-48" />;

  const sorted = [...rows].sort((a, b) => Number(b.active) - Number(a.active) || a.next_date.localeCompare(b.next_date));
  const monthly = rows.filter(r => r.active && r.kind === 'expense').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const incoming = rows.filter(r => r.active && r.kind === 'income').reduce((s, r) => s + monthlyEquivalent(r), 0);
  const paused = rows.filter(r => !r.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[52ch] text-[12px] leading-relaxed text-mute">
          {rows.length
            ? 'Подписки, связь, коммунальные услуги, зарплата — всё, что повторяется. Отметьте платёж, и дата сдвинется сама.'
            : 'Подписки, связь, коммунальные услуги, зарплата — всё, что повторяется.'}
        </p>
        <Button variant="primary" onClick={() => setEdit('new')}>
          <Plus size={15} /> Платёж
        </Button>
      </div>

      {rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Repeat size={17} />}
            title="Повторяющихся платежей пока нет"
            text={'Добавьте МТС, телевидение, коммунальные услуги или зарплату —\nприложение само создаст будущие события и напомнит о них.'}
            action="Добавить платёж"
            onAction={() => setEdit('new')}
          />
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Обязательные в месяц" value={money(monthly)} tone="bad" />
            <Stat label="Регулярный доход" value={money(incoming)} tone="good" />
            <Stat label="На паузе" value={String(paused)} sub={`всего ${rows.length}`} />
          </div>

          <Panel flat className="min-w-0 overflow-hidden">
            <ul>
              {sorted.map(p => {
                const d = daysBetween(today, p.next_date);
                return (
                  <li key={p.id} className={cn('group border-b border-line/60 px-3 py-3 last:border-0 sm:px-4', !p.active && 'opacity-55')}>
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                      <div className="min-w-0 flex-1 basis-[190px]">
                        <p className="flex items-center gap-2 text-[12.5px] font-medium text-txt">
                          <span className="truncate">{p.title}</span>
                          {!p.active && <Badge>пауза</Badge>}
                          {p.kind === 'income' && <Badge tone="good">доход</Badge>}
                        </p>
                        <p className="silk mt-1">
                          {describeFrequency(p)} · {p.category}
                        </p>
                        {p.active && (
                          <p className={cn('mt-1.5 text-[11.5px]', d < 0 ? 'text-red' : d <= 3 ? 'text-warn' : 'text-mute')}>
                            {d < 0 ? `Платёж ${relativeDays(p.next_date, today)}` : d === 0 ? 'Платёж сегодня' : `Следующий ${relativeDays(p.next_date, today)}`}
                            <span className="text-engrave"> · </span>
                            <span className="tnum">{fmtDate(p.next_date)}</span>
                          </p>
                        )}
                      </div>

                      <span className={cn('tnum shrink-0 text-[13.5px] font-semibold', p.kind === 'income' ? 'text-cyan' : 'text-txt')}>
                        {p.kind === 'income' ? '+' : '−'}
                        {money(p.amount).replace('−', '')}
                      </span>

                      <span className="flex shrink-0 items-center gap-0.5">
                        {p.active && (
                          <Button size="sm" variant="outline" onClick={() => void markPaid(p)}>
                            <Check size={14} /> {p.kind === 'income' ? 'Получено' : 'Оплачено'}
                          </Button>
                        )}
                        <IconButton label={p.active ? 'Поставить на паузу' : 'Возобновить'} size="icon-sm" onClick={() => void toggleActive(p)}>
                          {p.active ? <Pause size={14} /> : <Play size={14} />}
                        </IconButton>
                        <IconButton label="Изменить" size="icon-sm" onClick={() => setEdit(p)}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton label="Удалить" size="icon-sm" onClick={() => void remove(p)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}

      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Повторяющийся платёж' : 'Изменить платёж'}>
        {edit && <RecurringForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
