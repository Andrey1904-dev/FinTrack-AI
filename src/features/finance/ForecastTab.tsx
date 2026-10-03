import { useMemo, useState } from 'react';
import { LineChart } from '@/components/charts/charts';
import { EmptyState, ErrorState, Panel, Skeleton } from '@/components/ui/misc';
import { useOverview } from '@/features/overview/useOverview';
import { buildForecast, monthlyAverage, simulatePayoff } from '@/lib/calc';
import { addMonthsISO } from '@/lib/dates';
import { fmtDate, fmtMonth, money, plural } from '@/lib/format';
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
  const points = Array.from({ length: horizon + 1 }, (_, i) => ({
    x: i,
    label: i === 0 ? 'сейчас' : fmtMonth(addMonthsISO(o.today, i).slice(0, 7)).slice(0, 3) + ' ' + addMonthsISO(o.today, i).slice(2, 4),
    y: i < sim.series.length ? sim.series[i] : sim.months !== null ? 0 : sim.series[sim.series.length - 1],
  }));

  return (
    <div className="space-y-4">
      <p className="max-w-[70ch] text-[12px] leading-relaxed text-mute">
        Прогноз строится по вашим долгам и средним доходам и расходам за последние месяцы. Это расчёт, а не обещание: реальные цифры будут отличаться.
      </p>

      <Panel label="Дополнительный платёж по долгам в месяц" screw right={<span className="tnum text-[14px] text-amber">{money(extra)}</span>}>
        <input
          id="fx-extra"
          type="range"
          min={0}
          max={200000}
          step={5000}
          value={extra}
          onChange={e => setExtra(Number(e.target.value))}
          aria-label="Дополнительный платёж по долгам в месяц"
        />
        <div className="flex justify-between">
          <span className="silk">0</span>
          <span className="silk">200 000 ₽</span>
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[{ months: 0, debt: sim.series[0], cash: 0 }, ...rows].map(r => (
          <Panel key={r.months} flat className="min-w-0 px-4 py-3.5">
            <p className="silk truncate">{r.months === 0 ? 'Сейчас' : `Через ${r.months} ${plural(r.months, ['месяц', 'месяца', 'месяцев'])}`}</p>
            <p className="mt-2.5 text-[10.5px] text-mute">Долг</p>
            <p className={cn('tnum text-[15px] font-medium', r.debt === 0 ? 'text-cyan' : 'text-txt')}>{money(r.debt)}</p>
            {r.months > 0 && (
              <>
                <p className="mt-2.5 text-[10.5px] text-mute">Остаток денег</p>
                <p className={cn('tnum text-[13px]', r.cash < 0 ? 'text-red' : 'text-dim')}>{money(r.cash)}</p>
              </>
            )}
          </Panel>
        ))}
      </div>

      <Panel
        label="Остаток долга"
        right={
          <span className="silk-b text-mute">
            {sim.months !== null ? `закрытие: ${fmtDate(sim.closeDate)}` : active.length ? 'не закрывается' : ''}
          </span>
        }
      >
        {active.length ? (
          <LineChart points={points} ariaLabel="Прогноз остатка долга" />
        ) : (
          <EmptyState compact title="Долгов нет — прогнозировать нечего" text="Добавьте долг в разделе «Долги», и график покажет путь к нулю." />
        )}
      </Panel>

      <Panel flat className="px-4 py-3.5">
        <p className="text-[11.5px] leading-relaxed text-mute">
          В среднем за месяц: доходы <span className="tnum text-cyan">{money(avg.income)}</span>, расходы{' '}
          <span className="tnum text-red">{money(avg.expense)}</span> (по {avg.months || 0}{' '}
          {plural(avg.months, ['месяцу', 'месяцам', 'месяцам'])} с данными).
        </p>
      </Panel>
    </div>
  );
}
