import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Field, MoneyInput, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, Panel, Progress, Skeleton } from '@/components/ui/misc';
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
    try {
      await saveBudgets.mutateAsync(next);
      toast.success(ok);
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось сохранить лимит'));
    }
  };
  const add = async () => {
    const cat = (category || categories[0]).trim();
    if (!cat || num(limit) <= 0) return toast.error('Выберите категорию и введите сумму лимита.');
    await persist({ ...budgets, [cat]: num(limit) }, 'Лимит сохранён');
    setLimit('');
  };

  if (isLoading || ops.isLoading) return <Skeleton className="h-48" />;
  if (ops.error) return <ErrorState onRetry={() => void ops.refetch() } />;

  const entries = Object.entries(budgets)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalLimit = entries.reduce((s, [, v]) => s + Number(v), 0);
  const totalSpent = entries.reduce((s, [cat]) => s + (spent.get(cat) ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="max-w-[64ch] text-[12px] leading-relaxed text-mute">
        Месячные лимиты по категориям. Telegram-бот предупредит, когда потрачено 80% и 100%.
      </p>

      <Panel label="Новый лимит">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
          <Field label="Категория">
            {id => (
              <Select id={id} value={category || categories[0]} onChange={e => setCategory(e.target.value)}>
                {categories.map(c => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Лимит в месяц, ₽">
            {id => <MoneyInput id={id} value={limit} onChange={e => setLimit(e.target.value)} />}
          </Field>
          <Button variant="primary" onClick={() => void add()}>
            <Plus size={15} /> Задать
          </Button>
        </div>
      </Panel>

      {entries.length === 0 ? (
        <Panel>
          <EmptyState
            title="Лимитов пока нет"
            text={'Задайте лимит на продукты или развлечения —\nи следите, сколько ещё можно потратить.'}
          />
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border border-line bg-rail/30 px-4 py-3">
            <span className="silk">Итого по лимитам</span>
            <span className="tnum text-[12.5px] text-dim">
              <span className={totalSpent > totalLimit ? 'text-red' : 'text-txt'}>{money(totalSpent)}</span> из {money(totalLimit)}
            </span>
          </div>

          <Panel flat className="overflow-hidden">
            <ul>
              {entries.map(([cat, lim]) => {
                const s = spent.get(cat) ?? 0;
                const p = (s / lim) * 100;
                return (
                  <li key={cat} className="border-b border-line/60 px-3 py-3.5 last:border-0 sm:px-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[12.5px] text-txt">{cat}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="tnum text-[11.5px] text-mute">
                          <span className={p >= 100 ? 'text-red' : p >= 80 ? 'text-warn' : 'text-txt'}>{money(s)}</span> из {money(lim)} ·{' '}
                          {pct(p)}
                        </span>
                        <IconButton
                          label={`Убрать лимит: ${cat}`}
                          size="icon-sm"
                          onClick={() => {
                            const { [cat]: _removed, ...rest } = budgets;
                            void persist(rest, 'Лимит убран');
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </span>
                    </div>
                    <Progress value={p} h={7} tone={p >= 100 ? 'bad' : p >= 80 ? 'warn' : 'accent'} label={`Лимит: ${cat}`} />
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
