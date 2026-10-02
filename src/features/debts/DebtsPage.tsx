import { Landmark, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts/charts';
import { Button } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { MoneyInput } from '@/components/ui/form';
import { Badge, Card, CardHeader, EmptyState, ErrorState, PageHeader, Progress, Skeleton, Stat, Tabs } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useInvalidate, useRows } from '@/data/hooks';
import { useQuick } from '@/features/forms/QuickProvider';
import { balanceAfter, debtHistory, debtProgress, simulatePayoff, singleDebtProgress, totalDebt } from '@/lib/calc';
import { fromISO, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCSV } from '@/lib/export';
import { compactMoney, fmtDate, fmtDateLong, money, num, pct, plural, progressBar, relativeDays } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Debt } from '@/types';
import { DebtForm } from './DebtForm';

type Tab = 'list' | 'history' | 'calc';
const KIND = { loan: 'Кредит', card: 'Кредитка', other: 'Долг' } as const;

function DebtCard({ debt, onEdit, onDelete }: { debt: Debt; onEdit: () => void; onDelete: () => void }) {
  const quick = useQuick();
  const p = singleDebtProgress(debt) * 100;
  const today = todayISO();
  return (
    <Card className={cn('p-4', debt.status === 'closed' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{debt.name}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">{debt.organization && <span>{debt.organization}</span>}<Badge>{KIND[debt.kind]}</Badge>{debt.status === 'closed' && <Badge tone="good">закрыт</Badge>}</p>
        </div>
        <span className="-mr-2 -mt-1 flex shrink-0">
          <Button variant="ghost" size="icon" aria-label="Изменить" onClick={onEdit}><Pencil size={15} /></Button>
          <Button variant="ghost" size="icon" aria-label="Удалить" onClick={onDelete}><Trash2 size={15} /></Button>
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between gap-2"><span className="tabular text-xl font-semibold">{money(debt.balance)}</span><span className="tabular text-xs text-muted">из {money(Math.max(debt.original_amount, debt.balance))}</span></div>
      <Progress value={p} tone="good" className="mt-2" label={`Погашено: ${debt.name}`} />
      <p className="mt-1.5 text-xs text-muted"><span className="font-mono tracking-tighter">{progressBar(p / 100, 14)}</span> {pct(p)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-muted">Ставка</dt><dd className="tabular mt-0.5 font-medium">{debt.interest_rate ? `${debt.interest_rate}%` : '—'}</dd></div>
        <div><dt className="text-muted">Платёж</dt><dd className="tabular mt-0.5 font-medium">{debt.min_payment ? money(debt.min_payment) : '—'}</dd></div>
        <div><dt className="text-muted">Дата</dt><dd className={cn('mt-0.5 font-medium', debt.next_payment_date && debt.next_payment_date < today && debt.status === 'active' && 'text-bad')}>{debt.next_payment_date ? fmtDate(debt.next_payment_date).slice(0, 5) : '—'}</dd></div>
      </dl>
      {debt.status === 'active' && debt.next_payment_date && <p className="mt-2 text-xs text-muted">Платёж {relativeDays(debt.next_payment_date, today)}</p>}
      {debt.kind === 'card' && debt.credit_limit > 0 && <p className="mt-1 text-xs text-muted">Лимит {money(debt.credit_limit)}, использовано {pct((debt.balance / debt.credit_limit) * 100)}</p>}
      {debt.status === 'active' && <Button size="sm" variant="primary" className="mt-3" onClick={() => quick.open('payment', { debtId: debt.id })}>Записать платёж</Button>}
    </Card>
  );
}

function Calculator({ debts }: { debts: Debt[] }) {
  const [extra, setExtra] = useState(30000);
  const active = useMemo(() => debts.filter(d => d.status === 'active'), [debts]);
  const base = useMemo(() => simulatePayoff(active, 0), [active]);
  const sim = useMemo(() => simulatePayoff(active, extra), [active, extra]);
  const noMin = active.some(d => d.min_payment <= 0);
  if (!active.length) return <Card><EmptyState title="Долгов для расчёта нет" text="Добавьте долг — калькулятор покажет, когда вы его закроете." /></Card>;
  const rows = [3, 6, 12].map(m => ({ m, v: balanceAfter(sim, m), b: balanceAfter(base, m) }));
  const monthsText = (n: number | null) => n === null ? 'не закрывается' : `${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])}`;
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor="extra" className="text-sm font-medium">Дополнительный платёж в месяц</label>
          <div className="w-40"><MoneyInput value={String(extra)} onChange={e => setExtra(Math.max(0, num(e.target.value)))} aria-label="Дополнительный платёж, ₽" /></div>
        </div>
        <input id="extra" type="range" min={0} max={300000} step={5000} value={Math.min(extra, 300000)} onChange={e => setExtra(Number(e.target.value))} className="mt-3 w-full" />
        <div className="mt-1 flex justify-between text-xs text-muted"><span>0</span><span>{compactMoney(150000)}</span><span>{compactMoney(300000)}</span></div>
        {noMin && <p className="mt-3 text-xs text-warn">У некоторых долгов не указан минимальный платёж — расчёт учитывает только дополнительную сумму.</p>}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Долг будет закрыт" value={sim.closeDate ? fmtDateLong(sim.closeDate) : '—'} sub={sim.months !== null ? `через ${monthsText(sim.months)}${base.months !== null && base.months > sim.months ? ` · на ${base.months - sim.months} мес. раньше` : ''}` : 'при таких платежах долг не гасится'} className="lg:col-span-2" />
        <Stat label="Платить в месяц" value={money(sim.monthlyOutlay)} sub={`минимальные ${money(sim.monthlyOutlay - extra)} + ${money(extra)}`} />
        <Stat label="Всего потребуется" value={sim.months !== null ? money(sim.totalPaid) : '—'} sub={sim.months !== null ? `из них проценты ${money(sim.totalInterest)}` : undefined} />
      </div>
      <Card>
        <CardHeader title="Сколько останется" />
        <ul className="divide-y divide-line p-2">
          <li className="flex justify-between px-2 py-2.5 text-sm"><span className="text-muted">Сейчас</span><span className="tabular font-medium">{money(sim.series[0])}</span></li>
          {rows.map(r => (
            <li key={r.m} className="flex items-center justify-between gap-3 px-2 py-2.5 text-sm">
              <span className="text-muted">Через {r.m} {plural(r.m, ['месяц', 'месяца', 'месяцев'])}</span>
              <span className="tabular font-medium">{money(r.v)}{extra > 0 && r.b > r.v && <span className="ml-2 text-xs font-normal text-good">на {money(r.b - r.v)} меньше</span>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted">Дополнительные деньги направляются в долг с самой высокой ставкой; освободившиеся платежи переходят к остальным. Расчёт приблизительный.</p>
    </div>
  );
}

export default function DebtsPage() {
  const debts = useRows('debts');
  const payments = useRows('debt_payments');
  const del = useDeleteRow('debts');
  const invalidate = useInvalidate();
  const confirm = useConfirm();
  const toast = useToast();
  const quick = useQuick();
  const [tab, setTab] = useState<Tab>('list');
  const [edit, setEdit] = useState<Debt | 'new' | null>(null);

  const today = todayISO();
  const progress = debtProgress(debts.rows);
  const active = debts.rows.filter(d => d.status === 'active');
  const history = useMemo(() => debtHistory(debts.rows, payments.rows, today), [debts.rows, payments.rows, today]);
  const names = useMemo(() => new Map(debts.rows.map(d => [d.id, d.name])), [debts.rows]);

  const removeDebt = async (d: Debt) => {
    if (!(await confirm({ title: `Удалить долг «${d.name}»?`, text: 'Вместе с ним удалится вся история платежей по нему. Записи в расходах останутся.', confirmText: 'Удалить долг', danger: true }))) return;
    try { await del.mutateAsync(d.id); await invalidate('debt_payments'); toast.success('Долг удалён'); } catch (e) { toast.error(friendlyError(e, 'Не удалось удалить долг')); }
  };
  const undo = async (id: string) => {
    if (!(await confirm({ title: 'Отменить платёж?', text: 'Остаток долга вернётся, а связанный расход будет удалён.', confirmText: 'Отменить платёж', danger: true }))) return;
    try {
      const { error } = await supabase.rpc('delete_debt_payment', { p_payment_id: id });
      if (error) throw error;
      await invalidate('debts', 'debt_payments', 'finance_operations');
      toast.success('Платёж отменён');
    } catch (e) { toast.error(friendlyError(e, 'Не удалось отменить платёж')); }
  };
  const exportDebts = () => downloadCSV('debts', debts.rows, [
    { header: 'Название', value: d => d.name }, { header: 'Организация', value: d => d.organization }, { header: 'Первоначальная сумма', value: d => d.original_amount },
    { header: 'Остаток', value: d => d.balance }, { header: 'Процент', value: d => d.interest_rate }, { header: 'Мин. платёж', value: d => d.min_payment },
    { header: 'Дата платежа', value: d => d.next_payment_date }, { header: 'Статус', value: d => d.status },
  ]);

  const loading = debts.isLoading || payments.isLoading;
  const error = debts.error || payments.error;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Долги" subtitle="Сколько я должен и когда закрою?" actions={<>
        {active.length > 0 && <Button onClick={() => quick.open('payment')}>Записать платёж</Button>}
        <Button variant="primary" onClick={() => setEdit('new')}><Plus size={16} /> Долг</Button>
      </>} />
      {error ? <ErrorState onRetry={() => { void debts.refetch(); void payments.refetch(); }} /> : loading ? <Skeleton className="h-64" /> : debts.rows.length === 0 ? (
        <Card><EmptyState icon={<Landmark size={20} />} title="Долгов пока нет" text={'Добавьте кредит или кредитную карту —\nя покажу общий долг, прогресс и дату закрытия.'} action="Добавить долг" onAction={() => setEdit('new')} /></Card>
      ) : (
        <>
          <Card className="mb-5 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs text-muted">Общий долг</p><p className="tabular text-3xl font-semibold tracking-tight">{money(totalDebt(debts.rows))}</p></div>
              <div className="text-right text-sm text-muted"><p>{active.length} {plural(active.length, ['активный долг', 'активных долга', 'активных долгов'])}</p><p>в месяц минимум {money(active.reduce((s, d) => s + d.min_payment, 0))}</p></div>
            </div>
            <Progress value={progress * 100} tone="good" className="mt-4 h-2.5" label="Общий прогресс погашения" />
            <p className="mt-2 text-xs text-muted"><span className="font-mono tracking-tighter">{progressBar(progress, 20)}</span> {pct(progress * 100)} погашено</p>
          </Card>
          <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Долги' }, { value: 'history', label: 'История погашения' }, { value: 'calc', label: 'Калькулятор' }]} />
          {tab === 'list' && <div className="grid gap-3 md:grid-cols-2">{debts.rows.map(d => <DebtCard key={d.id} debt={d} onEdit={() => setEdit(d)} onDelete={() => void removeDebt(d)} />)}</div>}
          {tab === 'history' && (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Остаток долга" action={<Button size="sm" variant="ghost" onClick={exportDebts}>CSV</Button>} />
                <div className="p-4">
                  {payments.rows.length === 0 ? <p className="py-10 text-center text-sm text-muted">Платежей пока нет. Запишите первый платёж — и здесь появится график погашения.</p>
                    : <LineChart ariaLabel="Остаток долга по времени" tone="good" points={history.map(h => ({ x: fromISO(h.date).getTime(), y: h.balance, label: fromISO(h.date).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }).replace('.', '') }))} />}
                </div>
              </Card>
              {payments.rows.length > 0 && (
                <Card>
                  <CardHeader title="Платежи" />
                  <ul className="mt-2 divide-y divide-line">
                    {payments.rows.slice(0, 50).map(p => (
                      <li key={p.id} className="group flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1"><p className="truncate text-sm">{names.get(p.debt_id) ?? 'Долг'}</p><p className="truncate text-xs text-muted">{fmtDate(p.paid_at)}{p.comment ? ` · ${p.comment}` : ''}{p.balance_after !== null ? ` · остаток ${money(p.balance_after)}` : ''}</p></div>
                        <span className="tabular text-sm font-medium">{money(p.amount)}</span>
                        <Button variant="ghost" size="icon" aria-label="Отменить платёж" className="opacity-50 group-hover:opacity-100" onClick={() => void undo(p.id)}><Undo2 size={14} /></Button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )}
          {tab === 'calc' && <Calculator debts={debts.rows} />}
        </>
      )}
      <Modal open={!!edit} onOpenChange={o => !o && setEdit(null)} title={edit === 'new' ? 'Новый долг' : 'Изменить долг'}>
        {edit && <DebtForm initial={edit === 'new' ? undefined : edit} onDone={() => setEdit(null)} />}
      </Modal>
    </div>
  );
}
