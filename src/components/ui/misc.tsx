import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Button } from './button';

/* ============================== PANEL ============================== */

/** Instrument panel. `label` prints a silk-screened caption with a hairline rule. */
export function Panel({
  label,
  right,
  children,
  className,
  screw,
  delay = 0,
  flat,
}: {
  label?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  screw?: boolean;
  delay?: number;
  flat?: boolean;
}) {
  return (
    <section
      className={cn('rise', flat ? 'panel-flat' : 'panel', screw && 'panel-screw pt-3', className)}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {label !== undefined && (
        <header className="flex items-center gap-3 px-4 pb-2 pt-3">
          <span className="silk whitespace-nowrap">{label}</span>
          <span className="h-px flex-1 bg-engrave/70" />
          {right}
        </header>
      )}
      <div className={cn(label !== undefined ? 'px-4 pb-4' : undefined)}>{children}</div>
    </section>
  );
}

/* =========================== PAGE HEADER =========================== */

/**
 * Page title block. The `h1` always contains exactly the page name (routes and
 * screen readers depend on it); the section code and hint are printed around it
 * in the design's silk-screen typography.
 */
export function PageHeader({
  title,
  subtitle,
  code,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  /** section number, e.g. "02" — printed in the display face */
  code?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('rise mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="flex min-w-0 items-end gap-3">
        {code && <span className="disp hidden text-[34px] leading-none text-engrave sm:block">{code}</span>}
        <div className="min-w-0">
          {code && <p className="silk mb-2 sm:hidden">{code}</p>}
          <h1 className="text-[26px] font-semibold leading-[1.05] tracking-[-0.02em] text-txt sm:text-[32px] lg:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-[54ch] text-[12.5px] leading-relaxed text-dim">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Section caption with a hairline rule — used between blocks inside a page. */
export function Section({ label, right, children, className }: { label: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center gap-3">
        <span className="silk whitespace-nowrap">{label}</span>
        <span className="h-px flex-1 bg-engrave/60" />
        {right}
      </div>
      {children}
    </section>
  );
}

/* ============================== STATES ============================= */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full rounded-[2px]', className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export const LoadingState = PageSkeleton;

export function EmptyState({
  icon,
  title,
  text,
  action,
  onAction,
  compact,
}: {
  icon?: ReactNode;
  title: string;
  text?: string;
  action?: ReactNode;
  onAction?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center border border-dashed border-engrave/70 px-5 text-center', compact ? 'py-6' : 'py-10')}>
      {icon && <div className="mb-3 grid h-9 w-9 place-items-center rounded-[2px] border border-line text-mute">{icon}</div>}
      <p className="text-[13px] text-dim">{title}</p>
      {text && <p className="mt-1.5 max-w-[42ch] whitespace-pre-line text-[11.5px] leading-relaxed text-mute">{text}</p>}
      {action ? (
        onAction ? (
          typeof action === 'string' ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={onAction}>
              {action}
            </Button>
          ) : (
            <div className="mt-4">{action}</div>
          )
        ) : (
          <p className="mt-4 text-[11.5px] text-mute">{action}</p>
        )
      ) : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <div className={cn('panel flex flex-col items-center px-5 py-8 text-center', className)} role="alert">
      <p className="text-[13px] font-medium text-txt">Не удалось загрузить данные</p>
      <p className="mt-1.5 max-w-[42ch] text-[11.5px] leading-relaxed text-mute">{message ?? 'Проверьте соединение и попробуйте ещё раз.'}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}

/* ============================== READOUTS ========================== */

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'dim';
type ReadoutTone = 'txt' | 'amber' | 'cyan' | 'red' | 'dim';

const READOUT_COLOR: Record<ReadoutTone, string> = {
  txt: 'text-txt',
  amber: 'text-amber',
  cyan: 'text-cyan',
  red: 'text-red',
  dim: 'text-dim',
};

/** Big instrument readout: number + ₽, tabular by construction. */
export function Readout({
  value,
  tone = 'txt',
  size = 'lg',
  sign,
  className,
}: {
  value: number;
  tone?: ReadoutTone;
  size?: 'xl' | 'lg' | 'md';
  sign?: '+' | '−';
  className?: string;
}) {
  const cls =
    size === 'xl'
      ? 'text-[26px] sm:text-[32px] lg:text-[34px]'
      : size === 'lg'
        ? 'text-[21px] sm:text-[24px]'
        : 'text-[16px]';
  return (
    <div className={cn('disp flex items-baseline gap-1', READOUT_COLOR[tone], className)}>
      {sign && <span className="text-[0.6em] opacity-70">{sign}</span>}
      <span className={cn('money-clamp', cls)}>{formatNumber(value)}</span>
      <span className="text-[0.42em] opacity-55">₽</span>
    </div>
  );
}

function formatNumber(v: number): string {
  const n = Number.isFinite(v) ? v : 0;
  const abs = Math.abs(n);
  const body = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: abs < 1000 && abs % 1 !== 0 ? 2 : 0 }).format(abs);
  return `${n < 0 ? '−' : ''}${body}`;
}

/** Stat tile: silk caption + readout + note. */
export function Stat({
  label,
  value,
  sub,
  tone,
  className,
  size = 'md',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'good' | 'bad' | 'warn' | 'accent';
  className?: string;
  size?: 'md' | 'lg';
}) {
  const color = tone ? { good: 'text-cyan', bad: 'text-red', warn: 'text-warn', accent: 'text-amber' }[tone] : 'text-txt';
  return (
    <div className={cn('panel min-w-0 px-4 py-3.5', className)}>
      <p className="silk truncate">{label}</p>
      <p className={cn('tnum mt-2 money-clamp font-medium', size === 'lg' ? 'text-[19px] leading-tight sm:text-[22px]' : 'text-[16px] leading-tight sm:text-[18px]', color)}>
        {value}
      </p>
      {sub && <p className="mt-1.5 text-[11px] leading-snug text-mute">{sub}</p>}
    </div>
  );
}

/** Horizontal share bar (proportional fill). */
export function Share({ value, max = 100, tone = '#F0A828', h = 6, className }: { value: number; max?: number; tone?: string; h?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return (
    <div className={cn('w-full overflow-hidden rounded-[1px] bg-engrave/40', className)} style={{ height: h }} aria-hidden>
      <div
        className="h-full rounded-[1px] transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tone}AA, ${tone})`, boxShadow: `0 0 8px ${tone}33` }}
      />
    </div>
  );
}

const PROGRESS_TONE = { accent: 'bg-amber shadow-glow', good: 'bg-cyan', warn: 'bg-warn', bad: 'bg-red' } as const;

export function Progress({
  value,
  tone = 'accent',
  className,
  label,
  h = 6,
}: {
  value: number;
  tone?: 'accent' | 'good' | 'warn' | 'bad';
  className?: string;
  label?: string;
  h?: number;
}) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn('w-full overflow-hidden rounded-[1px] border border-line bg-ink', className)}
      style={{ height: h }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cn('h-full transition-[width] duration-500 ease-out', PROGRESS_TONE[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

/** LED block meter — the design's signature gauge. */
export function Meter({
  value,
  blocks = 18,
  tone = 'amber',
  size = 'md',
  className,
}: {
  value: number;
  blocks?: number;
  tone?: 'amber' | 'cyan' | 'red';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const safe = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
  const lit = Math.round((safe / 100) * blocks);
  const color = tone === 'amber' ? '#F0A828' : tone === 'cyan' ? '#31D3C4' : '#E2564D';
  return (
    <div className={cn('flex items-center gap-[3px]', className)} role="meter" aria-valuenow={Math.round(safe)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: blocks }).map((_, i) => {
        const on = i < lit;
        return (
          <span
            key={i}
            className={cn('block flex-1 rounded-[1px] transition-colors duration-300', size === 'sm' ? 'h-2' : 'h-3')}
            style={{
              background: on ? color : '#222A2E',
              boxShadow: on ? `0 0 6px ${color}66` : 'inset 0 1px 0 rgb(255 255 255 / .05)',
              transitionDelay: `${i * 22}ms`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ================================ TAGS ============================ */

const BADGE_TONE = {
  neutral: 'border-line text-dim',
  accent: 'border-amber/40 bg-amber/[0.08] text-amber',
  good: 'border-cyan/40 bg-cyan/[0.08] text-cyan',
  warn: 'border-amber-lt/40 bg-amber-lt/[0.08] text-amber-lt',
  bad: 'border-red/40 bg-red/[0.08] text-red',
} as const;

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
}: {
  tone?: keyof typeof BADGE_TONE;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span className={cn('silk-b inline-flex shrink-0 items-center gap-1 rounded-[2px] border px-1.5 py-[3px] text-[8.5px]', BADGE_TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

/* ================================ TABS ============================ */

/** Tab strip. Scrolls horizontally inside its own container on phones. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
  className,
  ariaLabel = 'Разделы',
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: string }>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn('no-bar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" aria-label={ariaLabel} className="inline-flex min-w-full gap-0 border-b border-line sm:min-w-0">
        {tabs.map(t => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cn(
              '-mb-px min-h-[44px] whitespace-nowrap border-b-2 px-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors lg:min-h-[38px]',
              value === t.value ? 'border-amber text-amber' : 'border-transparent text-mute hover:text-txt',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================================ ROWS ============================ */

export function Row({ children, className, onClick, as = 'div' }: { children: ReactNode; className?: string; onClick?: () => void; as?: 'div' | 'li' }) {
  const classes = cn('flex w-full items-center gap-3 px-4 py-3 text-left', onClick && 'transition-colors hover:bg-white/[0.03]', className);
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {children}
      </button>
    );
  }
  if (as === 'li') return <li className={classes}>{children}</li>;
  return <div className={classes}>{children}</div>;
}

/** Right-aligned "Open →" style link used in panel headers. */
export function PanelLink({ children, onClick, to }: { children: ReactNode; onClick?: () => void; to?: string }) {
  const cls = 'silk-b shrink-0 text-amber transition-colors hover:text-amber-lt';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* ============================= DATA TABLE ========================== */

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** cell renderer */
  value: (row: T) => ReactNode;
  /** render as a row header (first column) */
  rowHeader?: boolean;
  strong?: boolean;
}

/**
 * Tables never break the layout: the grid keeps a readable minimum width and
 * scrolls horizontally inside its own container (the design's "local scroll"
 * rule for phones), with a sticky silk-screened header row.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  minWidth = 520,
  label,
  isRowStrong,
  className,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T, index: number) => string;
  minWidth?: number;
  label: string;
  isRowStrong?: (row: T) => boolean;
  className?: string;
}) {
  return (
    <div className={cn('no-bar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <table className="w-full border-collapse text-[12.5px]" style={{ minWidth }} aria-label={label}>
        <thead>
          <tr className="border-b border-line">
            {columns.map(c => (
              <th key={c.key} scope="col" className="silk px-4 py-2.5 text-left font-normal">
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className={cn('border-b border-line/60 last:border-0', isRowStrong?.(row) && 'bg-rail/30')}>
              {columns.map(c =>
                c.rowHeader ? (
                  <th key={c.key} scope="row" className={cn('px-4 py-2.5 text-left font-normal', isRowStrong?.(row) ? 'text-txt' : 'text-dim')}>
                    {c.value(row)}
                  </th>
                ) : (
                  <td key={c.key} className={cn('tnum px-4 py-2.5', c.strong || isRowStrong?.(row) ? 'font-semibold text-txt' : 'text-dim')}>
                    {c.value(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
