import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, MoneyInput, Select } from '@/components/ui/form';
import { Card, EmptyState, ErrorState, Progress, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useCategoryOptions } from '@/data/categories';
import { useFinanceProfile, useRows } from '@/data/hooks';
import { byCategory } from '@/lib/calc';
import { monthKey, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { money, num, pct } from '@/lib/format';

/** Monthly category limits. They live in finance_profiles.budgets, so the Telegram bot's budget alerts use the same values. */
export function BudgetsTab() {
  const { financeProfile, isLoading, saveBudgets } = useFinanceProfile();
  const ops = useRows('finance_operations');
  const categories = useCategoryOptions('expense');
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const budgets = useMemo(() => financeProfile?.budgets ?? {}, [financeProfile]);
  const spent = useMemo(() => new Map(byCategory(ops.rows, 'expense', monthKey(todayISO())).map(c => [c.category, c.value])), [ops.rows]);

  const persist = async (next: Record<string, number>, ok: string) => {
    try { await saveBudgets.mutateAsync(next); toast.success(ok); } catch (e) { toast.error(friendlyError(e, 'Не удалось сохранить лимит')); }
  };
  const add = async () => {
    const cat = (category || categories[0]).trim();
    if (!cat || num(limit) <= 0) return toast.error('Выберите категорию и введите сумму лимита.');
    await persist({ ...budgets, [cat]: num(limit) }, 'Лимит сохранён');
    setLimit('');
  };

  if (isLoading || ops.isLoading) return <Skeleton className="h-48" />;
  if (ops.error) return <ErrorState onRetry={() => void ops.refetch()} />;
  const entries = Object.entries(budgets).filter(([, v]) => Number(v) > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Месячные лимиты по категориям. Telegram-бот предупредит, когда потрачено 80% и 100%.</p>
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Категория" className="min-w-40 flex-1">{id => <Select id={id} value={category || categories[0]} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</Select>}</Field>
          <Field label="Лимит в месяц, ₽" className="w-40">{id => <MoneyInput id={id} value={limit} onChange={e => setLimit(e.target.value)} />}</Field>
          <Button variant="primary" onClick={() => void add()}><Plus size={16} /> Задать</Button>
        </div>
      </Card>
      {entries.length === 0 ? <Card><EmptyState title="Лимитов пока нет" text="Задайте лимит на продукты или развлечения — и следите, сколько ещё можно потратить." /></Card> : (
        <Card><ul className="divide-y divide-line">
          {entries.map(([cat, lim]) => {
            const s = spent.get(cat) ?? 0;
            const p = (s / lim) * 100;
            return (
              <li key={cat} className="px-4 py-3">
                <div className="mb-1.5 flex items-center justify-between gap-2 text-sm"><span>{cat}</span>
                  <span className="flex items-center gap-1"><span className="tabular text-muted"><span className="text-fg">{money(s)}</span> из {money(lim)} · {pct(p)}</span>
                    <Button variant="ghost" size="icon" aria-label={`Убрать лимит: ${cat}`} onClick={() => { const { [cat]: _removed, ...rest } = budgets; void persist(rest, 'Лимит убран'); }}><Trash2 size={14} /></Button></span></div>
                <Progress value={p} tone={p >= 100 ? 'bad' : p >= 80 ? 'warn' : 'accent'} label={`Лимит: ${cat}`} />
              </li>
            );
          })}
        </ul></Card>
      )}
    </div>
  );
}
