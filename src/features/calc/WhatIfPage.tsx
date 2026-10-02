import { AlertTriangle, Save, SlidersHorizontal, Trash2, Wand2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { Card, CardHeader, ErrorState, PageHeader, Progress, Skeleton, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useRows, useSaveRow } from '@/data/hooks';
import { calcWhatIf, defaultWhatIf, monthlyAverage, totalDebt } from '@/lib/calc';
import { friendlyError } from '@/lib/errors';
import { money, num, pct, plural } from '@/lib/format';
import type { Scenario, WhatIfParams } from '@/types';
import { asText, NumField } from './NumField';

type Draft = Record<keyof WhatIfParams, string>;
const GROUPS: Array<{ title: string; fields: Array<{ key: keyof WhatIfParams; label: string; suffix?: string; hint?: string }> }> = [
  { title: 'Сейчас', fields: [
    { key: 'income', label: 'Доход в месяц', suffix: '₽' },
    { key: 'livingExpenses', label: 'Обычные расходы в месяц', suffix: '₽', hint: 'без платежей по долгам' },
    { key: 'savings', label: 'Накопления', suffix: '₽' },
  ] },
  { title: 'Долги', fields: [
    { key: 'debtTotal', label: 'Общий долг', suffix: '₽' },
    { key: 'debtPayment', label: 'Платёж в месяц', suffix: '₽' },
    { key: 'debtRate', label: 'Средняя ставка', suffix: '% годовых' },
    { key: 'extraDebtPayment', label: 'Платить сверх минимума', suffix: '₽/мес' },
  ] },
  { title: 'Покупка автомобиля', fields: [
    { key: 'carPrice', label: 'Цена', suffix: '₽' },
    { key: 'downPayment', label: 'Первоначальный взнос', suffix: '₽' },
    { key: 'termMonths', label: 'Срок кредита', suffix: 'мес.' },
    { key: 'ratePct', label: 'Ставка', suffix: '% годовых' },
    { key: 'carRunningMonthly', label: 'Содержание в месяц', suffix: '₽', hint: 'топливо, страховка, ТО' },
  ] },
];
const KEYS = GROUPS.flatMap(g => g.fields.map(f => f.key));
const toDraft = (p: Partial<WhatIfParams>): Draft => Object.fromEntries(KEYS.map(k => [k, asText(p[k])])) as Draft;
const toParams = (d: Draft): WhatIfParams => ({ ...defaultWhatIf, ...(Object.fromEntries(KEYS.map(k => [k, Math.max(0, num(d[k]))])) as unknown as WhatIfParams) });

export default function WhatIfPage() {
  const ops = useRows('finance_operations');
  const debts = useRows('debts');
  const goals = useRows('financial_goals');
  const scenarios = useRows('car_scenarios');
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
    setDraft(d => ({
      ...d,
      income: asText(Math.round(avg.income)),
      livingExpenses: asText(Math.max(0, Math.round(avg.expense - payment))),
      debtTotal: asText(Math.round(total)), debtPayment: asText(Math.round(payment)), debtRate: asText(Math.round(rate * 10) / 10),
      savings: asText(Math.round(goalsSaved)),
    }));
    toast.success(avg.months ? `Подставлены средние за ${avg.months} ${plural(avg.months, ['месяц', 'месяца', 'месяцев'])} и ваши долги` : 'Операций пока мало — подставлены только долги');
  };
  const reset = () => { setDraft(toDraft({ termMonths: 60 })); setName(''); setEditId(null); };
  const saveScenario = async () => {
    if (!name.trim()) return toast.error('Введите название сценария');
    try { await save.mutateAsync({ id: editId ?? undefined, name: name.trim(), kind: 'whatif', params }); toast.success('Сценарий сохранён'); if (!editId) reset(); } catch (e) { toast.error(friendlyError(e, 'Не удалось сохранить сценарий')); }
  };
  const remove = async (s: Scenario) => {
    if (!(await confirm({ title: `Удалить сценарий «${s.name}»?`, confirmText: 'Удалить', danger: true }))) return;
    try { await del.mutateAsync(s.id); if (editId === s.id) reset(); toast.success('Сценарий удалён'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить сценарий')); }
  };

  const hasData = params.income > 0 || params.debtTotal > 0 || params.carPrice > 0;
  const share = r.obligationShare * 100;

  return (
    <div className="animate-fade-in">
      <PageHeader title="What-if" subtitle="Что будет, если…" actions={<Button onClick={fillReal}><Wand2 size={16} /> Подставить мои данные</Button>} />
      {error ? <ErrorState onRetry={() => { void ops.refetch(); void debts.refetch(); void scenarios.refetch(); }} /> : loading ? <Skeleton className="h-64" /> : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            {GROUPS.map(g => (
              <Card key={g.title} className="p-5">
                <h2 className="mb-3 text-sm font-semibold">{g.title}</h2>
                <div className="grid gap-3 sm:grid-cols-2">{g.fields.map(f => <NumField key={f.key} label={f.label} suffix={f.suffix} hint={f.hint} value={draft[f.key]} onChange={set(f.key)} />)}</div>
              </Card>
            ))}
          </div>
          <div className="space-y-4">
            {!hasData ? (
              <Card className="p-5 text-sm text-muted"><SlidersHorizontal className="mb-2" size={20} />Введите доход, долги или цену автомобиля — результат появится здесь. Либо нажмите «Подставить мои данные».</Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Свободно сейчас" value={money(r.freeBefore)} tone={r.freeBefore < 0 ? 'bad' : undefined} sub="в месяц" />
                  <Stat label="Свободно после" value={money(r.freeAfter)} tone={r.freeAfter < 0 ? 'bad' : 'good'} sub="в месяц" />
                  {r.carLoanPayment > 0 && <Stat label="Платёж по автокредиту" value={money(r.carLoanPayment)} sub={`кредит ${money(r.carLoan)}`} />}
                  <Stat label="Обязательные платежи" value={money(r.monthlyObligations)} sub="долги + автокредит" />
                  {params.carPrice > 0 && <Stat label="Накопления после взноса" value={money(r.savingsAfterDown)} tone={r.savingsAfterDown < 0 ? 'bad' : undefined} />}
                  {params.debtTotal > 0 && <Stat label="Долг закроется" value={r.debtMonths === null ? 'не закроется' : `${r.debtMonths} ${plural(r.debtMonths, ['мес.', 'мес.', 'мес.'])}`} sub={`проценты ${money(r.debtInterest)}`} />}
                </div>
                {params.income > 0 && (
                  <Card className="p-4">
                    <div className="mb-2 flex justify-between text-sm"><span className="text-muted">Доля дохода на платежи</span><span className="tabular font-medium">{pct(r.obligationShare)}</span></div>
                    <Progress value={Math.min(100, share)} tone={share > 50 ? 'bad' : share > 35 ? 'warn' : 'good'} label="Доля дохода на платежи" />
                    <p className="mt-2 text-xs text-muted">Ориентир: комфортно до 35%, рискованно выше 50%. Это не рекомендация, а подсказка для размышления.</p>
                  </Card>
                )}
                {r.freeAfter < 0 && (
                  <p role="alert" className="flex gap-2 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm text-warn"><AlertTriangle size={16} className="mt-0.5 shrink-0" />При таких параметрах расходы превысят доход на {money(-r.freeAfter)} в месяц.</p>
                )}
                <p className="text-xs text-muted">Прогноз по месяцам — на вкладке «Прогноз» в разделе <Link className="text-accent hover:underline" to="/finance">Финансы</Link>.</p>
              </>
            )}
            <Card className="p-4">
              <Field label="Название сценария">{id => <Input id={id} value={name} onChange={e => setName(e.target.value)} placeholder="Купить авто в кредит" maxLength={80} />}</Field>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" className="flex-1" onClick={() => void saveScenario()} disabled={save.isPending}><Save size={16} /> {editId ? 'Обновить' : 'Сохранить сценарий'}</Button>
                {(editId || hasData) && <Button onClick={reset}>Очистить</Button>}
              </div>
            </Card>
            {saved.length > 0 && (
              <Card>
                <CardHeader title="Сохранённые сценарии" />
                <ul className="divide-y divide-line">
                  {saved.map(s => (
                    <li key={s.id} className="flex items-center gap-2 px-4 py-2.5">
                      <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => { setDraft(toDraft(s.params)); setName(s.name); setEditId(s.id); }}>{s.name}</button>
                      <Button variant="ghost" size="icon" aria-label={`Удалить сценарий ${s.name}`} onClick={() => void remove(s)}><Trash2 size={14} /></Button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
