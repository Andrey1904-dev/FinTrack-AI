import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, IconButton } from '@/components/ui/button';
import { Field, MoneyInput, Select } from '@/components/ui/form';
import { EmptyState, ErrorState, Panel, Progress, Skeleton } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useCategoryOptions } from '@/data/categories';
import { useFinanceProfile, useProfile, useRows } from '@/data/hooks';
import { byCategory, calcMonthlyBudget, calcMonthlyBudgetActuals } from '@/lib/calc';
import { useSalaryData } from '@/data/useSalary';
import { monthKey, monthStart, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { fmtMonth, money, num, pct } from '@/lib/format';
import type { MonthlyBudgetPlan, ProfileSettings } from '@/types';

const PLAN_FIELDS: Array<{ key: keyof MonthlyBudgetPlan; label: string }> = [
  { key: 'expected_income', label: 'Ожидаемый доход, ₽' },
  { key: 'mandatory_expenses', label: 'Расходы без долгов и накоплений, ₽' },
  { key: 'debt_payment', label: 'Платежи по долгам, ₽' },
  { key: 'savings_target', label: 'Цель по накоплениям, ₽' },
];

function parsePlanAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed < 1_000_000_000_000 ? parsed : null;
}

/** Monthly category limits are stored in finance_profiles; the plan/fact snapshot is stored in the user's profile settings. */
export function BudgetsTab() {
  const { financeProfile, isLoading: financeLoading, saveBudgets } = useFinanceProfile();
  const { profile, isLoading: profileLoading, save: saveProfile } = useProfile();
  const today = todayISO();
  const month = monthKey(today);
  const from = monthStart(month);
  const ops = useRows('finance_operations', { from, to: today });
  const debtPayments = useRows('debt_payments', { from, to: today });
  const categories = useCategoryOptions('expense');
  const toast = useToast();
  const [category, setCategory] = useState('');
  const [limit, setLimit] = useState('');
  const budgets = useMemo(() => financeProfile?.budgets ?? {}, [financeProfile]);
  const spent = useMemo(() => new Map(byCategory(ops.rows, 'expense', month).map(c => [c.category, c.value])), [ops.rows, month]);
  const { familySummary } = useSalaryData(month);

  const plan = useMemo(() => {
    const existing = profile?.settings?.monthly_budgets?.[month];
    const defaultIncome = familySummary.forecast > 0 ? familySummary.forecast : 0;
    return existing ?? {
      expected_income: defaultIncome,
      mandatory_expenses: 0,
      debt_payment: 0,
      savings_target: 0,
    };
  }, [profile, month, familySummary.forecast]);
  const actuals = useMemo(() => calcMonthlyBudgetActuals(ops.rows, debtPayments.rows, month), [ops.rows, debtPayments.rows, month]);
  const planLines = useMemo(() => calcMonthlyBudget(plan, actuals), [plan, actuals]);
  const [draft, setDraft] = useState<Partial<Record<keyof MonthlyBudgetPlan, string>>>({});

  const savePlan = async () => {
    const value = (key: keyof MonthlyBudgetPlan) => parsePlanAmount(draft[key] ?? String(plan[key] ?? ''));
    const expectedIncome = value('expected_income');
    const mandatoryExpenses = value('mandatory_expenses');
    const debtPayment = value('debt_payment');
    const savingsTarget = value('savings_target');
    if (expectedIncome === null || mandatoryExpenses === null || debtPayment === null || savingsTarget === null) {
      toast.error('Введите неотрицательные суммы, максимум два знака после запятой.');
      return;
    }
    const nextPlan: MonthlyBudgetPlan = {
      expected_income: expectedIncome,
      mandatory_expenses: mandatoryExpenses,
      debt_payment: debtPayment,
      savings_target: savingsTarget,
    };
    const settings: ProfileSettings = {
      ...(profile?.settings ?? {}),
      monthly_budgets: { ...(profile?.settings?.monthly_budgets ?? {}), [month]: nextPlan },
    };
    try {
      await saveProfile.mutateAsync({ settings });
      setDraft({});
      toast.success('Месячный план сохранён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось сохранить план'));
    }
  };

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

  if (financeLoading || profileLoading || ops.isLoading || debtPayments.isLoading) return <Skeleton className="h-48" />;
  if (ops.error || debtPayments.error) return <ErrorState onRetry={() => void Promise.all([ops.refetch(), debtPayments.refetch()])} />;

  const entries = Object.entries(budgets)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalLimit = entries.reduce((s, [, v]) => s + Number(v), 0);
  const totalSpent = entries.reduce((s, [cat]) => s + (spent.get(cat) ?? 0), 0);

  return (
    <div className="space-y-4">
      <Panel label={`План-факт · ${fmtMonth(month)}`}>
        <p className="mb-4 text-[11.5px] leading-relaxed text-mute">
          Факт берётся из операций текущего месяца и зарегистрированных платежей по долгам. Накопления считаются по расходам категории «Накопления».
        </p>
        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            void savePlan();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {PLAN_FIELDS.map(({ key, label }) => (
              <Field key={key} label={label}>
                {id => (
                  <MoneyInput
                    id={id}
                    value={draft[key] ?? (plan[key] ? String(plan[key]) : '')}
                    onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="outline" size="sm" type="submit" disabled={saveProfile.isPending}>
              {saveProfile.isPending ? 'Сохраняем…' : 'Сохранить план на месяц'}
            </Button>
          </div>
        </form>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {planLines.map(line => {
            const completion = line.completion ?? 0;
            const tone = line.kind === 'expense'
              ? completion >= 100 ? 'bad' : completion >= 80 ? 'warn' : 'accent'
              : completion >= 100 ? 'good' : 'accent';
            const remainingText = line.kind === 'expense' && line.remaining < 0
              ? `Превышение ${money(Math.abs(line.remaining))}`
              : `До плана ${money(line.remaining)}`;
            return (
              <div key={line.key} className="border border-line/70 bg-rail/20 px-3 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[11.5px] text-dim">{line.label}</span>
                  <span className="silk-b shrink-0 text-mute">{line.completion === null ? 'план не задан' : pct(line.completion)}</span>
                </div>
                <p className="tnum mt-2 text-[13px] text-txt">{money(line.actual)} <span className="text-mute">/ {money(line.planned)}</span></p>
                {line.planned > 0 && <Progress className="mt-2" value={completion} tone={tone} label={`Выполнение плана: ${line.label}`} />}
                <p className="silk mt-1.5">{remainingText}</p>
              </div>
            );
          })}
        </div>
      </Panel>

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
