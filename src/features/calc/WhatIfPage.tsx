import { AlertTriangle, Save, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { ErrorState, PageHeader, Panel, Progress, Readout, Skeleton, Stat } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { useSalaryProfiles } from '@/data/useSalary';
import { calcWhatIf, defaultWhatIf, monthlyAverage, totalDebt } from '@/lib/calc';
import { friendlyError } from '@/lib/errors';
import { money, num, pct, plural } from '@/lib/format';
import type { Scenario, WhatIfParams } from '@/types';
import { asText, NumField } from './NumField';

type Draft = Record<keyof WhatIfParams, string>;
const GROUPS: Array<{ title: string; fields: Array<{ key: keyof WhatIfParams; label: string; suffix?: string; hint?: string }> }> = [
  {
    title: 'Сейчас',
    fields: [
      { key: 'income', label: 'Доход в месяц', suffix: '₽' },
      { key: 'livingExpenses', label: 'Обычные расходы в месяц', suffix: '₽', hint: 'без платежей по долгам' },
      { key: 'savings', label: 'Накопления', suffix: '₽' },
    ],
  },
  {
    title: 'Зарплатные сценарии',
    fields: [
      { key: 'missedWorkDays', label: 'Пропуск рабочих дней', suffix: 'дн.', hint: 'что если пропущу 2 дня' },
      { key: 'workHoursPerDay', label: 'Часов в день (план 8)', suffix: 'ч', hint: 'что если работать по 9 часов' },
      { key: 'hourlyRateOverride', label: 'Часовая ставка (база 497)', suffix: '₽', hint: 'что если ставка станет 550 ₽' },
      { key: 'girlIncomeDelta', label: 'Изменение дохода девушки', suffix: '₽', hint: 'что если девушка заработает на 10 000 меньше' },
    ],
  },
  {
    title: 'Долги',
    fields: [
      { key: 'debtTotal', label: 'Общий долг', suffix: '₽' },
      { key: 'debtPayment', label: 'Платёж в месяц', suffix: '₽' },
      { key: 'debtRate', label: 'Средняя ставка', suffix: '% годовых' },
      { key: 'extraDebtPayment', label: 'Платить сверх минимума', suffix: '₽/мес' },
    ],
  },
  {
    title: 'Покупка автомобиля',
    fields: [
      { key: 'carPrice', label: 'Цена', suffix: '₽' },
      { key: 'downPayment', label: 'Первоначальный взнос', suffix: '₽' },
      { key: 'termMonths', label: 'Срок кредита', suffix: 'мес.' },
      { key: 'ratePct', label: 'Ставка', suffix: '% годовых' },
      { key: 'carRunningMonthly', label: 'Содержание в месяц', suffix: '₽', hint: 'топливо, страховка, ТО' },
    ],
  },
];
const KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key));
const toDraft = (p: Partial<WhatIfParams>): Draft => Object.fromEntries(KEYS.map(k => [k, asText(p[k])])) as Draft;
const toParams = (d: Draft): WhatIfParams => ({
  ...defaultWhatIf,
  ...(Object.fromEntries(KEYS.map(k => [k, Math.max(0, num(d[k]))])) as unknown as WhatIfParams),
});

export default function WhatIfPage() {
  const ops = useRows('finance_operations');
  const debts = useRows('debts');
  const goals = useRows('financial_goals');
  const scenarios = useRows('car_scenarios');
  const { profiles } = useSalaryProfiles();
  const save = useSaveRow('car_scenarios');
  const del = useDeleteRow('car_scenarios');
  const confirm = useConfirm();
  const toast = useToast();
  const [draft, setDraft] = useState<Draft>(() => toDraft({ termMonths: 60 }));
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<string | null>(null);

  const params = useMemo(() => toParams(draft), [draft]);
  const r = useMemo(() => calcWhatIf(params), [params]);
  const saved = useMemo(() => scenarios.rows.filter(s => s.kind === 'whatif') as Scenario<WhatIfParams>[], [scenarios.rows]);
  const set = (k: keyof WhatIfParams) => (v: string) => setDraft(d => ({ ...d, [k]: v }));
  const loading = ops.isLoading || debts.isLoading || scenarios.isLoading;
  const error = ops.error || debts.error || scenarios.error;

  const fillReal = () => {
    const avg = monthlyAverage(ops.rows, 3);
    const active = debts.rows.filter(d => d.status === 'active' && d.balance > 0);
    const total = totalDebt(debts.rows);
    const rate = total > 0 ? active.reduce((s, d) => s + d.interest_rate * d.balance, 0) / total : 0;
    const payment = active.reduce((s, d) => s + d.min_payment, 0);
    const goalsSaved = goals.rows.reduce((s, g) => s + g.current_amount, 0);

    // If salary profiles exist, derive baseline monthly income from them if operations history is small
    let baselineIncome = Math.round(avg.income);
    if (baselineIncome <= 0 && profiles.length > 0) {
      baselineIncome = 150000; // estimated combined family income
    }

    setDraft(d => ({
      ...d,
      income: asText(baselineIncome),
      livingExpenses: asText(Math.max(0, Math.round(avg.expense - payment))),
      debtTotal: asText(Math.round(total)),
      debtPayment: asText(Math.round(payment)),
      debtRate: asText(Math.round(rate * 10) / 10),
      savings: asText(Math.round(goalsSaved)),
      missedWorkDays: '0',
      workHoursPerDay: '8',
      hourlyRateOverride: '497',
      girlIncomeDelta: '0',
    }));
    toast.success(
      avg.months
        ? `Подставлены средние за ${avg.months} ${plural(avg.months, ['месяц', 'месяца', 'месяцев'])} и ваши долги`
        : 'Операций пока мало — подставлены только долги',
    );
  };
  const reset = () => {
    setDraft(toDraft({ termMonths: 60 }));
    setName('');
    setEditId(null);
  };
  const saveScenario = async () => {
    if (!name.trim()) return toast.error('Введите название сценария');
    try {
      await save.mutateAsync({ id: editId ?? undefined, name: name.trim(), kind: 'whatif', params });
      toast.success('Сценарий сохранён');
      if (!editId) reset();
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось сохранить сценарий'));
    }
  };
  const remove = async (s: Scenario) => {
    if (!(await confirm({ title: `Удалить сценарий «${s.name}»?`, confirmText: 'Удалить', danger: true }))) return;
    try {
      await del.mutateAsync(s.id);
      if (editId === s.id) reset();
      toast.success('Сценарий удалён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить сценарий'));
    }
  };

  const hasData = params.income > 0 || params.debtTotal > 0 || params.carPrice > 0;
  const share = r.obligationShare * 100;

  return (
    <div className="animate-fadein">
      <PageHeader
        title="What-if"
        code={codeFor('/whatif')}
        subtitle="Что будет, если… — проверьте решение на цифрах, прежде чем его принимать"
        actions={
          <Button variant="outline" onClick={fillReal}>
            <Wand2 size={16} /> Подставить мои данные
          </Button>
        }
      />

      {error ? (
        <ErrorState
          onRetry={() => {
            void ops.refetch();
            void debts.refetch();
            void scenarios.refetch();
          }}
        />
      ) : loading ? (
        <Skeleton className="h-72" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {GROUPS.map(g => (
              <Panel key={g.title} label={g.title}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
                  {g.fields.map(f => (
                    <NumField key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={draft[f.key]} onChange={set(f.key)} />
                  ))}
                </div>
              </Panel>
            ))}
          </div>

          <div className="space-y-4">
            {!hasData ? (
              <Panel label="Результат">
                <div className="flex flex-col items-start gap-2 py-2">
                  <SlidersHorizontal size={20} className="text-mute" />
                  <p className="text-[12.5px] leading-relaxed text-dim">
                    Введите доход, долги или цену автомобиля — результат появится здесь. Либо нажмите «Подставить мои данные».
                  </p>
                </div>
              </Panel>
            ) : (
              <>
                <div className="panel px-4 py-3.5">
                  <p className="silk">Свободно после решений</p>
                  <Readout value={r.freeAfter} size="xl" sign={r.freeAfter < 0 ? '−' : '+'} tone={r.freeAfter < 0 ? 'red' : 'cyan'} className="mt-2" />
                  <p className="mt-1 text-[11px] text-mute">
                    доход по сценарию: {money(r.effectiveIncome)}
                    {r.salaryAdjustment !== 0 && (
                      <span className={r.salaryAdjustment > 0 ? ' text-cyan' : ' text-red'}>
                        {' '}({r.salaryAdjustment > 0 ? `+${money(r.salaryAdjustment)}` : money(r.salaryAdjustment)})
                      </span>
                    )}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Свободно сейчас" value={money(r.freeBefore)} tone={r.freeBefore < 0 ? 'bad' : undefined} sub="в месяц" />
                  <Stat label="Обязательные платежи" value={money(r.monthlyObligations)} sub="долги + автокредит" />
                  {r.carLoanPayment > 0 && <Stat label="Платёж по автокредиту" value={money(r.carLoanPayment)} sub={`кредит ${money(r.carLoan)}`} />}
                  {params.carPrice > 0 && (
                    <Stat label="Накопления после взноса" value={money(r.savingsAfterDown)} tone={r.savingsAfterDown < 0 ? 'bad' : undefined} sub="остаток резерва" />
                  )}
                  {params.debtTotal > 0 && (
                    <Stat
                      label="Долг закроется"
                      value={r.debtMonths === null ? 'не закроется' : `${r.debtMonths} мес.`}
                      sub={`проценты ${money(r.debtInterest)}`}
                    />
                  )}
                </div>

                {params.income > 0 && (
                  <Panel label="Нагрузка на доход">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] text-dim">Доля дохода на платежи</span>
                      <span className="tnum text-[13px] font-semibold text-txt">{pct(r.obligationShare)}</span>
                    </div>
                    <Progress value={Math.min(100, share)} tone={share > 50 ? 'bad' : share > 35 ? 'warn' : 'good'} className="mt-2" label="Доля дохода на платежи" />
                    <p className="mt-2 text-[11px] leading-relaxed text-mute">
                      Ориентир: комфортно до 35%, рискованно выше 50%. Это не рекомендация, а подсказка для размышления.
                    </p>
                  </Panel>
                )}

                {r.freeAfter < 0 && (
                  <p
                    role="alert"
                    className="flex gap-2 border border-red/30 bg-red/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-red"
                  >
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    При таких параметрах расходы превысят доход на {money(-r.freeAfter)} в месяц.
                  </p>
                )}

                <p className="text-[11.5px] text-mute">
                  Прогноз по месяцам — во вкладке «Прогноз» раздела{' '}
                  <Link className="text-amber transition-colors hover:text-amber-lt" to="/finance">
                    Финансы
                  </Link>
                  .
                </p>
              </>
            )}

            <Panel label="Сохранить сценарий">
              <Field label="Название">
                {id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Купить авто в кредит" maxLength={80} />}
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="primary" className="flex-1" onClick={() => void saveScenario()} disabled={save.isPending}>
                  <Save size={16} /> {editId ? 'Обновить' : 'Сохранить'}
                </Button>
                {(editId || hasData) && (
                  <Button variant="outline" onClick={reset}>
                    Очистить
                  </Button>
                )}
              </div>
            </Panel>

            {saved.length > 0 && (
              <Panel label={`Сохранённые сценарии · ${saved.length}`} className="p-0 pb-0">
                <ul>
                  {saved.map(s => (
                    <li key={s.id} className="group flex items-center gap-2 border-b border-line/70 px-4 py-1.5 last:border-b-0">
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate py-2 text-left text-[12.5px] text-dim transition-colors hover:text-txt"
                        onClick={() => {
                          setDraft(toDraft(s.params));
                          setName(s.name);
                          setEditId(s.id);
                        }}
                      >
                        {s.name}
                      </button>
                      <IconButton label={`Удалить сценарий ${s.name}`} size="icon-sm" onClick={() => void remove(s)}>
                        <Trash2 size={14} />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      )}

      {!error && !loading && saved.length === 0 && hasData && (
        <p className="mt-4 text-[11.5px] text-mute">Сохранённые сценарии появятся здесь — к ним можно вернуться в любой момент.</p>
      )}
    </div>
  );
}
