import { Landmark, Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts/charts';
import { Button, IconButton } from '@/components/ui/button';
import { Modal, useConfirm } from '@/components/ui/dialog';
import { MoneyInput } from '@/components/ui/form';
import { Badge, EmptyState, ErrorState, PageHeader, Panel, PanelLink, Progress, Readout, Share, Skeleton, Stat, Tabs } from '@/components/ui/misc';
import { codeFor } from '@/features/layout/nav';
import { useToast } from '@/components/ui/toast';
import { useDeleteRow, useInvalidate, useRows } from '@/data/hooks';
import { useQuick } from '@/features/forms/QuickProvider';
import { balanceAfter, debtHistory, debtProgress, simulatePayoff, singleDebtProgress, totalDebt } from '@/lib/calc';
import { fromISO, todayISO } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadCSV } from '@/lib/export';
import { compactMoney, fmtDate, fmtDateLong, money, num, pct, plural, relativeDays } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import type { Debt } from '@/types';
import { DebtForm } from './DebtForm';
import { useSalarySummary } from '@/data/useSalary';

type Tab = 'list' | 'history' | 'calc';
const KIND = { loan: 'Кредит', card: 'Кредитка', other: 'Долг' } as const;

function DebtCard({ debt, onEdit, onDelete }: { debt: Debt; onEdit: () => void; onDelete: () => void }) {
  const quick = useQuick();
  const p = singleDebtProgress(debt) * 100;
  const today = todayISO();
  const overdue = debt.status === 'active' && debt.next_payment_date && debt.next_payment_date < today;

  return (
    <Panel flat className={cn('min-w-0 px-4 py-3.5', debt.status === 'closed' && 'opacity-60')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13.5px] font-semibold text-txt">{debt.name}</h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {debt.organization && <span className="silk">{debt.organization}</span>}
            <Badge>{KIND[debt.kind]}</Badge>
            {debt.status === 'closed' && <Badge tone="good">закрыт</Badge>}
          </p>
        </div>
        <span className="-mr-1 -mt-1 flex shrink-0">
          <IconButton label="Изменить" size="icon-sm" onClick={onEdit}>
            <Pencil size={15} />
          </IconButton>
          <IconButton label="Удалить" size="icon-sm" onClick={onDelete}>
            <Trash2 size={15} />
          </IconButton>
        </span>
      </div>

      <div className="mt-4">
        <Readout value={debt.balance} tone="cyan" size="lg" />
        <p className="silk mt-2">из {money(Math.max(debt.original_amount, debt.balance))}</p>
      </div>

      <Progress value={p} tone="good" h={7} className="mt-3" label={`Погашено: ${debt.name}`} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="silk">погашено</span>
        <span className="tnum text-[12px] text-cyan">{pct(p)}</span>
      </div>

      <dl className="mt-3.5 grid grid-cols-3 gap-2 border-t border-line pt-3">
        <div>
          <dt className="silk mb-1.5">Ставка</dt>
          <dd className="tnum text-[12.5px] text-txt">{debt.interest_rate ? `${debt.interest_rate}%` : '—'}</dd>
        </div>
        <div>
          <dt className="silk mb-1.5">Платёж</dt>
          <dd className="tnum text-[12.5px] text-txt">{debt.min_payment ? money(debt.min_payment) : '—'}</dd>
        </div>
        <div>
          <dt className="silk mb-1.5">Дата</dt>
          <dd className={cn('tnum text-[12.5px]', overdue ? 'text-red' : 'text-txt')}>
            {debt.next_payment_date ? fmtDate(debt.next_payment_date).slice(0, 5) : '—'}
          </dd>
        </div>
      </dl>

      {debt.status === 'active' && debt.next_payment_date && (
        <p className={cn('mt-2.5 text-[11px]', overdue ? 'text-red' : 'text-mute')}>Платёж {relativeDays(debt.next_payment_date, today)}</p>
      )}
      {debt.kind === 'card' && debt.credit_limit > 0 && (
        <p className="mt-2 text-[11px] text-mute">
          Лимит {money(debt.credit_limit)}, использовано {pct((debt.balance / debt.credit_limit) * 100)}
        </p>
      )}

      {debt.status === 'active' && (
        <Button size="sm" variant="outline" className="mt-3.5 w-full sm:w-auto" onClick={() => quick.open('payment', { debtId: debt.id })}>
          Записать платёж
        </Button>
      )}
    </Panel>
  );
}

function Calculator({ debts }: { debts: Debt[] }) {
  const [extra, setExtra] = useState(30000);
  const active = useMemo(() => debts.filter(d => d.status === 'active'), [debts]);
  const base = useMemo(() => simulatePayoff(active, 0), [active]);
  const sim = useMemo(() => simulatePayoff(active, extra), [active, extra]);
  const noMin = active.some(d => d.min_payment <= 0);
  const monthsText = (n: number | null) =>
    n === null ? 'не закрывается' : `${n} ${plural(n, ['месяц', 'месяца', 'месяцев'])}`;

  if (!active.length)
    return (
      <Panel>
        <EmptyState title="Долгов для расчёта нет" text="Добавьте долг — калькулятор покажет, когда вы его закроете." />
      </Panel>
    );

  const rows = [3, 6, 12].map(m => ({ m, v: balanceAfter(sim, m), b: balanceAfter(base, m) }));

  return (
    <div className="space-y-4">
      <Panel label="Дополнительный платёж в месяц" screw right={<span className="tnum text-[14px] text-amber">{money(extra)}</span>}>
        <div className="mb-3 max-w-[220px]">
          <MoneyInput value={String(extra)} onChange={e => setExtra(Math.max(0, num(e.target.value)))} aria-label="Дополнительный платёж, ₽" />
        </div>
        <input
          id="extra"
          type="range"
          min={0}
          max={300000}
          step={5000}
          value={Math.min(extra, 300000)}
          onChange={e => setExtra(Number(e.target.value))}
          aria-label="Дополнительный платёж, ползунок"
        />
        <div className="mt-1 flex justify-between">
          <span className="silk">0</span>
          <span className="silk">{compactMoney(150000)}</span>
          <span className="silk">{compactMoney(300000)}</span>
        </div>
        {noMin && (
          <p className="mt-3 text-[11px] leading-relaxed text-warn">
            У некоторых долгов не указан минимальный платёж — расчёт учитывает только дополнительную сумму.
          </p>
        )}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel flat className="col-span-2 min-w-0 px-4 py-3.5">
          <p className="silk">Долг будет закрыт</p>
          <p className="tnum mt-2 text-[18px] font-medium text-txt sm:text-[21px]">{sim.closeDate ? fmtDateLong(sim.closeDate) : '—'}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-mute">
            {sim.months !== null
              ? `через ${monthsText(sim.months)}${base.months !== null && base.months > sim.months ? ` · на ${base.months - sim.months} мес. раньше` : ''}`
              : 'при таких платежах долг не гасится'}
          </p>
        </Panel>
        <Stat label="Платить в месяц" value={money(sim.monthlyOutlay)} sub={`минимум ${money(sim.monthlyOutlay - extra)} + ${money(extra)}`} />
        <Stat
          label="Всего потребуется"
          value={sim.months !== null ? money(sim.totalPaid) : '—'}
          sub={sim.months !== null ? `из них проценты ${money(sim.totalInterest)}` : undefined}
        />
      </div>

      <Panel label="Сколько останется" flat>
        <ul>
          <li className="flex items-center justify-between border-b border-line/60 py-2.5 text-[12.5px]">
            <span className="text-mute">Сейчас</span>
            <span className="tnum text-txt">{money(sim.series[0])}</span>
          </li>
          {rows.map(r => (
            <li key={r.m} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line/60 py-2.5 text-[12.5px] last:border-0">
              <span className="text-mute">
                Через {r.m} {plural(r.m, ['месяц', 'месяца', 'месяцев'])}
              </span>
              <span className="tnum text-txt">
                {money(r.v)}
                {extra > 0 && r.b > r.v && <span className="ml-2 text-[11px] text-cyan">на {money(r.b - r.v)} меньше</span>}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <p className="text-[11px] leading-relaxed text-mute">
        Дополнительные деньги направляются в долг с самой высокой ставкой; освободившиеся платежи переходят к остальным. Расчёт приблизительный.
      </p>
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
    if (
      !(await confirm({
        title: `Удалить долг «${d.name}»?`,
        text: 'Вместе с ним удалится вся история платежей по нему. Записи в расходах останутся.',
        confirmText: 'Удалить долг',
        danger: true,
      }))
    )
      return;
    try {
      await del.mutateAsync(d.id);
      await invalidate('debt_payments');
      toast.success('Долг удалён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось удалить долг'));
    }
  };
  const undo = async (id: string) => {
    if (!(await confirm({ title: 'Отменить платёж?', text: 'Остаток долга вернётся, а связанный расход будет удалён.', confirmText: 'Отменить платёж', danger: true })))
      return;
    try {
      const { error } = await supabase.rpc('delete_debt_payment', { p_payment_id: id });
      if (error) throw error;
      await invalidate('debts', 'debt_payments', 'finance_operations');
      toast.success('Платёж отменён');
    } catch (e) {
      toast.error(friendlyError(e, 'Не удалось отменить платёж'));
    }
  };
  const exportDebts = () =>
    downloadCSV('debts', debts.rows, [
      { header: 'Название', value: d => d.name },
      { header: 'Организация', value: d => d.organization },
      { header: 'Первоначальная сумма', value: d => d.original_amount },
      { header: 'Остаток', value: d => d.balance },
      { header: 'Процент', value: d => d.interest_rate },
      { header: 'Мин. платёж', value: d => d.min_payment },
      { header: 'Дата платежа', value: d => d.next_payment_date },
      { header: 'Статус', value: d => d.status },
    ]);

  const recurring = useRows('recurring_payments');
  const { summary: salarySummary } = useSalarySummary();

  const loading = debts.isLoading || payments.isLoading || recurring.isLoading;
  const error = debts.error || payments.error || recurring.error;
  const monthlyMin = active.reduce((s, d) => s + d.min_payment, 0);
  const remainingTotal = debts.rows.reduce((s, d) => s + d.balance, 0);
  const originalTotal = debts.rows.reduce((s, d) => s + Math.max(d.original_amount, d.balance), 0);
  const paid = Math.max(0, originalTotal - remainingTotal);

  const expectedIncome = salarySummary.totalForecast > 0 ? salarySummary.totalForecast : recurring.rows.filter(r => r.active && r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const mandatoryExpenses = recurring.rows.filter(r => r.active && r.kind === 'expense').reduce((s, r) => s + r.amount, 0);
  const freeAfterDebts = expectedIncome - mandatoryExpenses - monthlyMin;

  return (
    <div className="animate-fadein">
      <PageHeader
        title="Долги"
        code={codeFor('/debts')}
        subtitle="Сколько я должен и когда закрою."
        actions={
          <>
            {active.length > 0 && <Button onClick={() => quick.open('payment')}>Записать платёж</Button>}
            <Button variant="primary" onClick={() => setEdit('new')}>
              <Plus size={15} /> Долг
            </Button>
          </>
        }
      />

      {error ? (
        <ErrorState
          onRetry={() => {
            void debts.refetch();
            void payments.refetch();
          }}
        />
      ) : loading ? (
        <Skeleton className="h-64" />
      ) : debts.rows.length === 0 ? (
        <Panel>
          <EmptyState
            icon={<Landmark size={17} />}
            title="Долгов пока нет"
            text={'Добавьте кредит или кредитную карту —\nя покажу общий долг, прогресс и дату закрытия.'}
            action="Добавить долг"
            onAction={() => setEdit('new')}
          />
        </Panel>
      ) : (
        <>
          <section className="rise panel mb-5 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
              <div>
                <p className="silk mb-2.5">Общий долг</p>
                <Readout value={totalDebt(debts.rows)} tone="cyan" size="xl" />
              </div>
              <dl className="flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="silk mb-1.5">Погашено</dt>
                  <dd className="disp text-[26px] leading-none text-amber">{Math.round(progress * 100)}%</dd>
                </div>
                <div>
                  <dt className="silk mb-1.5">Минимум в месяц</dt>
                  <dd className="tnum text-[15px] text-txt">{money(monthlyMin)}</dd>
                </div>
                <div>
                  <dt className="silk mb-1.5">Активных</dt>
                  <dd className="tnum text-[15px] text-txt">
                    {active.length} <span className="text-[11px] text-mute">из {debts.rows.length}</span>
                  </dd>
                </div>
              </dl>
            </div>
            <Share value={progress * 100} tone="#31D3C4" h={7} className="mt-5" />
            <p className="silk mt-2.5">
              уплачено {money(paid)} · осталось {money(totalDebt(debts.rows))}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
              <Stat label="Ожидаемый доход" value={money(expectedIncome)} tone="good" sub="зарплаты + доходы" />
              <Stat label="Обязательные расходы" value={money(mandatoryExpenses)} tone="bad" sub="повторяющиеся" />
              <Stat label="Долги в месяц" value={money(monthlyMin)} sub="минимум" />
              <Stat label="Свободно после долгов" value={money(freeAfterDebts)} tone={freeAfterDebts >= 0 ? 'accent' : 'bad'} sub="доход − расходы − долги" />
            </div>
          </section>

          <Tabs
            ariaLabel="Разделы долгов"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'list', label: 'Долги' },
              { value: 'history', label: 'История погашения' },
              { value: 'calc', label: 'Калькулятор' },
            ]}
          />

          {tab === 'list' && (
            <div className="grid gap-4 lg:grid-cols-2">
              {debts.rows.map(d => (
                <DebtCard key={d.id} debt={d} onEdit={() => setEdit(d)} onDelete={() => void removeDebt(d)} />
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-4">
              <Panel label="Остаток долга" right={<Button size="sm" variant="ghost" onClick={exportDebts}>CSV</Button>}>
                {payments.rows.length === 0 ? (
                  <EmptyState compact title="Платежей пока нет" text="Запишите первый платёж — и здесь появится график погашения." />
                ) : (
                  <LineChart
                    ariaLabel="Остаток долга по времени"
                    tone="good"
                    points={history.map(h => ({
                      x: fromISO(h.date).getTime(),
                      y: h.balance,
                      label: fromISO(h.date).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }).replace('.', ''),
                    }))}
                  />
                )}
              </Panel>

              {payments.rows.length > 0 && (
                <Panel label="Платежи" right={<PanelLink onClick={() => quick.open('payment')}>+ платёж</PanelLink>}>
                  <ul className="no-bar max-h-[60dvh] overflow-y-auto overscroll-contain">
                    {payments.rows.slice(0, 50).map(p => (
                      <li key={p.id} className="group flex items-center gap-2 border-b border-line/60 py-2.5 last:border-0 sm:gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] text-txt">{names.get(p.debt_id) ?? 'Долг'}</p>
                          <p className="silk mt-1 truncate">
                            {fmtDate(p.paid_at)}
                            {p.comment ? ` · ${p.comment}` : ''}
                            {p.balance_after !== null ? ` · остаток ${money(p.balance_after)}` : ''}
                          </p>
                        </div>
                        <span className="tnum shrink-0 text-[12.5px] font-medium text-txt">{money(p.amount)}</span>
                        <IconButton label="Отменить платёж" size="icon-sm" className="opacity-100 lg:opacity-40 lg:group-hover:opacity-100" onClick={() => void undo(p.id)}>
                          <Undo2 size={14} />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                </Panel>
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
