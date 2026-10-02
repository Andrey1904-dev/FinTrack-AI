import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, ErrorState, Skeleton } from '@/components/ui/misc';
import { useOverview } from '@/features/overview/useOverview';
import { buildEvents, type CalendarEvent } from '@/lib/calc';
import { daysInMonth, monthEnd, monthKey, monthStart, shiftMonthKey, todayISO } from '@/lib/dates';
import { fmtMonth, money } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DOT: Record<CalendarEvent['kind'], string> = { income: 'bg-good', recurring: 'bg-warn', debt: 'bg-bad', car: 'bg-accent', goal: 'bg-muted' };

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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonthKey(month, -1))}>‹</Button>
          <span className="min-w-36 text-center text-sm font-medium">{fmtMonth(month)}</span>
          <Button variant="ghost" size="icon" aria-label="Следующий месяц" onClick={() => setMonth(shiftMonthKey(month, 1))}>›</Button>
        </div>
        <p className="text-xs text-muted sm:text-sm"><span className="text-good">{money(incoming, { sign: true })}</span> · <span>{money(-outgoing)}</span></p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Card className="hidden overflow-hidden sm:block">
          <div className="grid grid-cols-7 border-b border-line text-center text-xs text-muted">{WEEKDAYS.map(d => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {cells.map((iso, i) => {
              const list = iso ? byDay.get(iso) ?? [] : [];
              return (
                <div key={i} className={cn('min-h-[84px] border-b border-r border-line p-1.5 [&:nth-child(7n)]:border-r-0', !iso && 'bg-bg/40', iso === today && 'bg-accent/[0.07]')}>
                  {iso && <span className={cn('text-xs', iso === today ? 'font-semibold text-accent' : 'text-muted')}>{Number(iso.slice(8))}</span>}
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map(e => <div key={e.id} className="flex items-center gap-1 truncate text-[11px] leading-tight" title={e.title}><i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', DOT[e.kind])} /><span className="truncate">{e.title}</span></div>)}
                    {list.length > 2 && <div className="text-[11px] text-muted">+{list.length - 2}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="sm:col-span-1">
          <h3 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{fmtMonth(month).split(' ')[0]}</h3>
          {events.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted">В этом месяце событий нет. Добавьте повторяющиеся платежи или долги — они появятся здесь.</p> : (
            <ul className="divide-y divide-line">
              {events.map(e => (
                <li key={e.id}>
                  <Link to={e.link} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-raised/60">
                    <span className="tabular w-6 shrink-0 text-sm text-muted">{e.date.slice(8)}</span>
                    <i className={cn('h-2 w-2 shrink-0 rounded-full', DOT[e.kind])} />
                    <span className={cn('min-w-0 flex-1 truncate text-sm', e.overdue && 'text-bad')}>{e.title}</span>
                    {e.amount !== null && <span className={cn('tabular shrink-0 text-sm font-medium', e.amount > 0 && 'text-good')}>{money(e.amount, { sign: true })}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-3 text-[11px] text-muted">
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-good" />доход</span><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-warn" />платёж</span>
            <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-bad" />долг</span><span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />авто</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
