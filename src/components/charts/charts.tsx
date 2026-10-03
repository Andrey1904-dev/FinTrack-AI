import { useEffect, useId, useRef, useState } from 'react';
import { Share } from '@/components/ui/misc';
import { compactMoney, money } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Charts are drawn in real CSS pixels (measured with a ResizeObserver) instead
 * of being scaled by `viewBox`. That keeps axis labels at a readable size on a
 * 320px iPhone and on a 1728px MacBook alike, and never lets a chart overflow.
 */
function useMeasuredWidth(fallback: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setWidth(el.getBoundingClientRect().width || el.clientWidth || 0);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? el.getBoundingClientRect().width;
      if (next) setWidth(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, Math.max(240, Math.round(width) || fallback)] as const;
}

export function ChartContainer({
  children,
  fallback = 640,
  className,
  ariaLabel,
}: {
  children: (width: number) => React.ReactNode;
  fallback?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const [ref, width] = useMeasuredWidth(fallback);
  return (
    <div ref={ref} className={cn('w-full min-w-0', className)} role={ariaLabel ? 'img' : undefined} aria-label={ariaLabel}>
      {children(width)}
    </div>
  );
}

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
export function LineChart({
  points,
  className,
  ariaLabel,
  tone = 'accent',
  height,
}: {
  points: LinePoint[];
  className?: string;
  ariaLabel: string;
  tone?: 'accent' | 'good';
  height?: number;
}) {
  const gid = useId();
  const stroke = tone === 'good' ? '#31D3C4' : '#F0A828';

  return (
    <div className={cn('w-full min-w-0', className)}>
      <ChartContainer fallback={640} ariaLabel={ariaLabel}>
        {w => {
          if (points.length < 1) return null;
          const compact = w < 480;
          const h = height ?? (compact ? 180 : 230);
          const pad = { l: compact ? 38 : 50, r: 10, t: 12, b: 24 };
          const maxY = niceMax(Math.max(...points.map(p => p.y), 1));
          const minX = points[0].x;
          const maxX = points[points.length - 1].x;
          const spanX = maxX - minX || 1;
          const px = (x: number) => pad.l + ((x - minX) / spanX) * (w - pad.l - pad.r);
          const py = (y: number) => pad.t + (1 - y / maxY) * (h - pad.t - pad.b);
          const path = points.map((p, i) => `${i ? 'L' : 'M'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
          const area = `${path} L${px(maxX).toFixed(1)},${py(0)} L${px(minX).toFixed(1)},${py(0)} Z`;
          const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => t * maxY);
          const labelIdx = new Set([0, points.length - 1, Math.floor((points.length - 1) / 2)]);
          const showDots = points.length <= 14;

          return (
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="block" aria-hidden="true" focusable="false">
              <defs>
                <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={stroke} stopOpacity="0.26" />
                  <stop offset="1" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>

              {ticks.map(t => (
                <g key={t}>
                  <line x1={pad.l} x2={w - pad.r} y1={py(t)} y2={py(t)} stroke="#242C31" strokeWidth="1" />
                  <text x={pad.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize={compact ? 9 : 10} fill="#7A8784" className="tnum">
                    {compactMoney(t)}
                  </text>
                </g>
              ))}

              {points.length > 1 && <path d={area} fill={`url(#${gid})`} />}
              {points.length > 1 && (
                <path d={path} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              )}

              {points.map((p, i) => (
                <g key={i}>
                  {(showDots || i === 0 || i === points.length - 1) && (
                    <circle cx={px(p.x)} cy={py(p.y)} r={showDots ? 2.6 : 3} fill="#0E1113" stroke={stroke} strokeWidth="1.6" />
                  )}
                  {labelIdx.has(i) && (
                    <text
                      x={px(p.x)}
                      y={h - 7}
                      textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
                      fontSize={compact ? 9 : 10}
                      fill="#7A8784"
                    >
                      {p.label}
                    </text>
                  )}
                  <title>{`${p.label}: ${money(p.y)}`}</title>
                </g>
              ))}
            </svg>
          );
        }}
      </ChartContainer>
    </div>
  );
}

export interface BarDatum {
  label: string;
  income: number;
  expense: number;
}

/** Income (cyan) vs expenses (red) per month. The latest month is lit up. */
export function MonthBars({ data, className }: { data: BarDatum[]; className?: string }) {
  return (
    <div className={cn('w-full min-w-0', className)}>
      <ChartContainer fallback={640} ariaLabel="Доходы и расходы по месяцам">
        {w => {
          const compact = w < 480;
          const h = compact ? 170 : 220;
          const pad = { l: compact ? 38 : 50, r: 8, t: 12, b: 26 };
          const maxY = niceMax(Math.max(...data.flatMap(d => [d.income, d.expense]), 1));
          const slot = (w - pad.l - pad.r) / Math.max(1, data.length);
          const bw = Math.max(4, Math.min(compact ? 10 : 16, slot / 3));
          const py = (y: number) => pad.t + (1 - y / maxY) * (h - pad.t - pad.b);
          const ticks = [0, 0.5, 1].map(t => t * maxY);

          return (
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="block" aria-hidden="true" focusable="false">
              {ticks.map(t => (
                <g key={t}>
                  <line x1={pad.l} x2={w - pad.r} y1={py(t)} y2={py(t)} stroke="#242C31" strokeWidth="1" />
                  <text x={pad.l - 6} y={py(t) + 3.5} textAnchor="end" fontSize={compact ? 9 : 10} fill="#7A8784" className="tnum">
                    {compactMoney(t)}
                  </text>
                </g>
              ))}
              {data.map((d, i) => {
                const cx = pad.l + slot * i + slot / 2;
                const last = i === data.length - 1;
                return (
                  <g key={d.label + i}>
                    <rect
                      x={cx - bw - 1}
                      y={py(d.income)}
                      width={bw}
                      height={Math.max(0, py(0) - py(d.income))}
                      rx="1"
                      fill={last ? '#31D3C4' : '#263136'}
                      style={last ? { filter: 'drop-shadow(0 0 6px rgba(49,211,196,.35))' } : undefined}
                    >
                      <title>{`Доходы: ${money(d.income)}`}</title>
                    </rect>
                    <rect
                      x={cx + 1}
                      y={py(d.expense)}
                      width={bw}
                      height={Math.max(0, py(0) - py(d.expense))}
                      rx="1"
                      fill={last ? '#E2564D' : '#38464B'}
                      style={last ? { filter: 'drop-shadow(0 0 6px rgba(226,86,77,.3))' } : undefined}
                    >
                      <title>{`Расходы: ${money(d.expense)}`}</title>
                    </rect>
                    <text x={cx} y={h - 8} textAnchor="middle" fontSize={compact ? 9 : 10} fill={last ? '#F0A828' : '#7A8784'}>
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          );
        }}
      </ChartContainer>
      <div className="mt-2 flex gap-4 text-[11px] text-mute">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-[1px] bg-cyan" />Доходы
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-[1px] bg-red" />Расходы
        </span>
      </div>
    </div>
  );
}

/** Ranked category breakdown with proportional share bars. */
export function CategoryBars({
  items,
  limit = 7,
  className,
  tone = 'accent',
}: {
  items: Array<{ category: string; value: number }>;
  limit?: number;
  className?: string;
  tone?: 'accent' | 'good';
}) {
  const shown = items.slice(0, limit);
  const rest = items.slice(limit).reduce((s, i) => s + i.value, 0);
  const rows = rest > 0 ? [...shown, { category: 'Прочее', value: rest }] : shown;
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const max = rows[0]?.value || 1;
  const toneHex = tone === 'good' ? '#31D3C4' : '#F0A828';

  return (
    <ul className={cn('space-y-3', className)}>
      {rows.map((r, i) => (
        <li key={r.category}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12px] text-dim">{r.category}</span>
            <span className="tnum shrink-0 text-[12px] text-txt">
              {money(r.value)}
              <span className="ml-1.5 text-[10px] text-mute">{Math.round((r.value / total) * 100)}%</span>
            </span>
          </div>
          <Share value={r.value} max={max} tone={i === 0 ? toneHex : '#4C5D62'} h={i === 0 ? 7 : 5} />
        </li>
      ))}
    </ul>
  );
}
