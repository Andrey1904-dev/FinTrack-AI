import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts/charts';
import { Card, CardHeader, ErrorState, Skeleton } from '@/components/ui/misc';
import { useOverview } from '@/features/overview/useOverview';
import { buildForecast, monthlyAverage, simulatePayoff } from '@/lib/calc';
import { addMonthsISO } from '@/lib/dates';
import { fmtMonth, fmtDate, money, plural } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ForecastTab() {
  const o = useOverview();
  const [extra, setExtra] = useState(0);
  const active = useMemo(() => o.debts.filter(d => d.status === 'active'), [o.debts]);
  const avg = useMemo(() => monthlyAverage(o.ops, 3, o.today), [o.ops, o.today]);
  const sim = useMemo(() => simulatePayoff(active, extra, o.today, 240), [active, extra, o.today]);
  const rows = useMemo(() => buildForecast(sim.series, sim.months !== null, avg.income - avg.expense, extra), [sim, avg, extra]);

  if (o.error && !o.ops.length) return <ErrorState onRetry={() => void o.refetch()} />;
  if (o.loading && !o.ops.length && !o.debts.length) return <Skeleton className="h-96" />;

  const horizon = Math.min(24, Math.max(sim.series.length - 1, 6));
  const points = Array.from({ length: horizon + 1 }, (_, i) => ({ x: i, label: i === 0 ? 'сейчас' : fmtMonth(addMonthsISO(o.today, i).slice(0, 7)).slice(0, 3) + ' ' + addMonthsISO(o.today, i).slice(2, 4), y: i < sim.series.length ? sim.series[i] : sim.months !== null ? 0 : sim.series[sim.series.length - 1] }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Прогноз строится по вашим долгам и средним доходам и расходам за последние месяцы. Это расчёт, а не обещание: реальные цифры будут отличаться.</p>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="fx-extra" className="text-sm font-medium">Дополнительный платёж по долгам в месяц</label><span className="tabular text-lg font-semibold">{money(extra)}</span></div>
        <input id="fx-extra" type="range" min={0} max={200000} step={5000} value={extra} onChange={e => setExtra(Number(e.target.value))} className="mt-3 w-full" />
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ months: 0, debt: sim.series[0], cash: 0 }, ...rows].map(r => (
          <Card key={r.months} className="p-4">
            <p className="text-xs text-muted">{r.months === 0 ? 'Сейчас' : `Через ${r.months} ${plural(r.months, ['месяц', 'месяца', 'месяцев'])}`}</p>
            <p className="mt-2 text-xs text-muted">Долг</p>
            <p className={cn('tabular text-lg font-semibold', r.debt === 0 && 'text-good')}>{money(r.debt)}</p>
            {r.months > 0 && <><p className="mt-2 text-xs text-muted">Остаток денег при текущих тратах</p><p className={cn('tabular text-sm font-medium', r.cash < 0 && 'text-bad')}>{money(r.cash)}</p></>}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader title="Остаток долга" action={<span className="text-xs text-muted">{sim.months !== null ? `закрытие: ${fmtDate(sim.closeDate)}` : active.length ? 'при текущих платежах не закрывается' : ''}</span>} />
        <div className="p-4">{active.length ? <LineChart points={points} ariaLabel="Прогноз остатка долга" /> : <p className="py-10 text-center text-sm text-muted">Долгов нет — прогнозировать нечего.</p>}</div>
      </Card>
      <p className="text-xs text-muted">В среднем за месяц: доходы {money(avg.income)}, расходы {money(avg.expense)} (по {avg.months || 0} {plural(avg.months, ['месяцу', 'месяцам', 'месяцам'])} с данными).</p>
    </div>
  );
}
