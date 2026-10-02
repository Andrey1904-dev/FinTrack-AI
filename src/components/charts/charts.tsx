import { useId } from 'react';
import { compactMoney, money } from '@/lib/format';
import { cn } from '@/lib/utils';

const W = 600;
const H = 220;
const PAD = { l: 44, r: 12, t: 12, b: 26 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export interface LinePoint {
  x: number;
  label: string;
  y: number;
}

/** Area/line chart. `x` is any monotonically increasing number (index or timestamp). */
export function LineChart({ points, className, ariaLabel, tone = 'accent' }: { points: LinePoint[]; className?: string; ariaLabel: string; tone?: 'accent' | 'good' }) {
  const gid = useId();
  if (points.length < 1) return null;
  const maxY = niceMax(Math.max(...points.map(p => p.y), 1));
  const minX = points[0].x;
  const maxX = points[points.length - 1].x;
  const spanX = maxX - minX || 1;
  const px = (x: number) => PAD.l + ((x - minX) / spanX) * (W - PAD.l - PAD.r);
  const py = (y: number) => PAD.t + (1 - y / maxY) * (H - PAD.t - PAD.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
  const single = points.length === 1;
  const area = `${path} L${px(maxX)},${py(0)} L${px(minX)},${py(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxY);
  const color = tone === 'good' ? 'hsl(var(--good))' : 'hsl(var(--accent))';
  const labelIdx = new Set([0, points.length - 1, Math.floor((points.length - 1) / 2)]);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className={cn('h-auto w-full', className)}>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t)} y2={py(t)} stroke="hsl(var(--line))" strokeWidth="1" />
          <text x={PAD.l - 6} y={py(t) + 4} textAnchor="end" fontSize="11" fill="hsl(var(--muted))">{compactMoney(t)}</text>
        </g>
      ))}
      {!single && <path d={area} fill={`url(#${gid})`} />}
      {!single && <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <g key={i}>
          {(points.length <= 14 || i === points.length - 1 || i === 0) && <circle cx={px(p.x)} cy={py(p.y)} r={3.2} fill={color} />}
          {labelIdx.has(i) && (
            <text x={px(p.x)} y={H - 7} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize="11" fill="hsl(var(--muted))">{p.label}</text>
          )}
          <title>{`${p.label}: ${money(p.y)}`}</title>
        </g>
      ))}
    </svg>
  );
}

export interface BarDatum {
  label: string;
  income: number;
  expense: number;
}

/** Income vs expenses per month. */
export function MonthBars({ data, className }: { data: BarDatum[]; className?: string }) {
  const maxY = niceMax(Math.max(...data.flatMap(d => [d.income, d.expense]), 1));
  const slot = (W - PAD.l - PAD.r) / Math.max(1, data.length);
  const bw = Math.min(26, slot / 3);
  const py = (y: number) => PAD.t + (1 - y / maxY) * (H - PAD.t - PAD.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Доходы и расходы по месяцам" className={cn('h-auto w-full', className)}>
      {[0, 0.5, 1].map(t => (
        <g key={t}>
          <line x1={PAD.l} x2={W - PAD.r} y1={py(t * maxY)} y2={py(t * maxY)} stroke="hsl(var(--line))" />
          <text x={PAD.l - 6} y={py(t * maxY) + 4} textAnchor="end" fontSize="11" fill="hsl(var(--muted))">{compactMoney(t * maxY)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const cx = PAD.l + slot * i + slot / 2;
        return (
          <g key={d.label + i}>
            <rect x={cx - bw - 1} y={py(d.income)} width={bw} height={Math.max(0, py(0) - py(d.income))} rx="3" fill="hsl(var(--good))" opacity="0.85"><title>{`Доходы: ${money(d.income)}`}</title></rect>
            <rect x={cx + 1} y={py(d.expense)} width={bw} height={Math.max(0, py(0) - py(d.expense))} rx="3" fill="hsl(var(--bad))" opacity="0.85"><title>{`Расходы: ${money(d.expense)}`}</title></rect>
            <text x={cx} y={H - 7} textAnchor="middle" fontSize="11" fill="hsl(var(--muted))">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function CategoryBars({ items, limit = 7, className }: { items: Array<{ category: string; value: number }>; limit?: number; className?: string }) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit).reduce((s, i) => s + i.value, 0);
  const rows = rest > 0 ? [...shown, { category: 'Прочее', value: rest }] : shown;
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const max = rows[0]?.value || 1;
  return (
    <ul className={cn('space-y-2.5', className)}>
      {rows.map(r => (
        <li key={r.category}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{r.category}</span>
            <span className="tabular shrink-0 text-muted"><span className="text-fg">{money(r.value)}</span> · {Math.round((r.value / total) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent/80 transition-[width] duration-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
