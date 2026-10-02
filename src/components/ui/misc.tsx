import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('card', className)}>{children}</div>;
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 pt-4', className)}>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="Загрузка">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

export function EmptyState({ icon, title, text, action, onAction }: { icon?: ReactNode; title: string; text?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-raised text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="mt-1 max-w-sm whitespace-pre-line text-sm text-muted">{text}</p>}
      {action && onAction && <Button variant="primary" className="mt-4" onClick={onAction}>{action}</Button>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center px-6 py-8 text-center">
      <p className="font-medium">Не удалось загрузить данные</p>
      <p className="mt-1 text-sm text-muted">{message ?? 'Проверьте соединение и попробуйте ещё раз.'}</p>
      {onRetry && <Button className="mt-4" onClick={onRetry}>Повторить</Button>}
    </div>
  );
}

export function Progress({ value, tone = 'accent', className, label }: { value: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; className?: string; label?: string }) {
  const v = Math.min(100, Math.max(0, value));
  const color = { accent: 'bg-accent', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-raised', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'accent'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-raised text-muted',
    good: 'bg-good/15 text-good',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    accent: 'bg-accent/15 text-accent',
  };
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone], className)}>{children}</span>;
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn('tabular mt-1 text-xl font-semibold tracking-tight sm:text-2xl', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: Array<{ value: T; label: string }> }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
      <div className="inline-flex min-w-full gap-1 border-b border-line sm:min-w-0">
        {tabs.map(t => (
          <button key={t.value} type="button" role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
            className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors', value === t.value ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Row({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('flex w-full items-center gap-3 px-4 py-3 text-left', onClick && 'transition-colors hover:bg-raised/60', className)}>
      {children}
    </Tag>
  );
}
