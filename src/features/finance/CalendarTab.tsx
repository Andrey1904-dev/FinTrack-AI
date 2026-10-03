import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/ui/button';
import { ErrorState, Panel, Skeleton, Stat } from '@/components/ui/misc';
import { useOverview } from '@/features/overview/useOverview';
import { buildEvents, type CalendarEvent } from '@/lib/calc';
import { daysInMonth, monthEnd, monthKey, monthStart, shiftMonthKey, todayISO } from '@/lib/dates';
import { fmtMonth, money } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOT: Record<CalendarEvent['kind'], string> = {
  income: 'bg-cyan',
  recurring: 'bg-warn',
  debt: 'bg-red',
  car: 'bg-amber',
  goal: 'bg-mute',
};

export function CalendarTab() {
  const o = useOverview();
  const today = todayISO();
  const [month, setMonth] = useState(monthKey(today));
  const events = useMemo(() => buildEvents(o.sources, monthStart(month), monthEnd(month), today), [o.sources, month, today]);

  if (o.error && !o.recurring.length) return <ErrorState onRetry={() => void o.refetch()} />;
  if (o.loading && !events.length) return <Skeleton className="h-96" />;

  const [y, m] = month.split('-').map(Number);
  const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + daysInMonth(y, m - 1)) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= daysInMonth(y, m - 1) ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const incoming = events.reduce((s, e) => s + (e.amount && e.amount > 0 ? e.amount : 0), 0);
  const outgoing = events.reduce((s, e) => s + (e.amount && e.amount < 0 ? -e.amount : 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton label="Предыдущий месяц" onClick={() => setMonth(shiftMonthKey(month, -1))}>
            <ChevronLeft size={17} />
          </IconButton>
          <span className="min-w-[128px] text-center text-[12.5px] font-medium text-txt">{fmtMonth(month)}</span>
          <IconButton label="Следующий месяц" onClick={() => setMonth(shiftMonthKey(month, 1))}>
            <ChevronRight size={17} />
          </IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Поступления" value={money(incoming, { sign: true })} tone="good" />
        <Stat label="Списания" value={money(-outgoing)} tone="bad" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Desktop / tablet: month grid. On a phone the list below takes over. */}
        <Panel flat className="hidden min-w-0 overflow-hidden sm:block">
          <div className="grid grid-cols-7 border-b border-line">
            {WEEKDAYS.map(d => (
              <div key={d} className="silk py-2 text-center">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((iso, i) => {
              const list = iso ? (byDay.get(iso) ?? []) : [];
              return (
                <div
                  key={i}
                  className={cn(
                    'min-h-[84px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0',
                    !iso && 'bg-ink/50',
                    iso === today && 'bg-amber/[0.07]',
                  )}
                >
                  {iso && (
                    <span className={cn('tnum text-[11px]', iso === today ? 'font-semibold text-amber' : 'text-mute')}>{Number(iso.slice(8))}</span>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map(e => (
                      <div key={e.id} className="flex items-center gap-1 text-[10.5px] leading-tight" title={e.title}>
                        <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[e.kind])} />
                        <span className="truncate text-dim">{e.title}</span>
                      </div>
                    ))}
                    {list.length > 2 && <div className="silk text-[8px]">+{list.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel label={fmtMonth(month).split(' ')[0]} className="min-w-0">
          {events.length === 0 ? (
            <p className="py-10 text-center text-[12px] leading-relaxed text-mute">
              В этом месяце событий нет. Добавьте повторяющиеся платежи или долги — они появятся здесь.
            </p>
          ) : (
            <ul className="no-bar max-h-[62dvh] overflow-y-auto overscroll-contain">
              {events.map(e => (
                <li key={e.id}>
                  <Link
                    to={e.link}
                    className="flex min-h-[46px] items-center gap-3 border-b border-line/60 py-2 transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <span className="tnum w-6 shrink-0 text-[12px] text-mute">{e.date.slice(8)}</span>
                    <i className={cn('h-2 w-2 shrink-0 rounded-full', DOT[e.kind])} />
                    <span className={cn('min-w-0 flex-1 truncate text-[12.5px]', e.overdue ? 'text-red' : 'text-txt')}>{e.title}</span>
                    {e.amount !== null && (
                      <span className={cn('tnum shrink-0 text-[12.5px] font-medium', e.amount > 0 ? 'text-cyan' : 'text-txt')}>
                        {money(e.amount, { sign: true })}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
            {(
              [
                ['bg-cyan', 'доход'],
                ['bg-warn', 'платёж'],
                ['bg-red', 'долг'],
                ['bg-amber', 'авто'],
              ] as const
            ).map(([cls, label]) => (
              <span key={label} className="silk flex items-center gap-1.5">
                <i className={cn('inline-block h-1.5 w-1.5 rounded-full', cls)} />
                {label}
              </span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
