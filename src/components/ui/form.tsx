import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-[2px] border border-line bg-ink/60 px-3 text-[14px] text-txt placeholder:text-mute/70 transition-colors hover:border-engrave/70 focus:border-amber/70 focus:outline-none disabled:opacity-50';

/* 44px tall on touch devices, denser on desktop pointers */
const height = 'h-11 lg:h-9';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(control, height, className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...p }, ref) => <textarea ref={ref} className={cn(control, 'min-h-[96px] py-2.5', className)} {...p} />,
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...p }, ref) => (
    <select
      ref={ref}
      className={cn(control, height, 'cursor-pointer appearance-none bg-[length:14px] bg-[right_10px_center] bg-no-repeat pr-8', className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237A8784' stroke-width='1.6'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      {...p}
    >
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

/** Text field that accepts "1 200,50" and gives back the raw string; parse with num(). */
export const MoneyInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  ({ className, ...p }, ref) => (
    <Input ref={ref} inputMode="decimal" autoComplete="off" placeholder="0" className={cn('tnum', height, className)} {...p} />
  ),
);
MoneyInput.displayName = 'MoneyInput';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const described = error ? errId : hint ? hintId : undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="silk block">
        {label}
      </label>
      {/* the id is handed to the control so label → input association always works */}
      <div aria-describedby={described}>{children(id)}</div>
      {error ? (
        <p id={errId} className="text-[11.5px] leading-snug text-red">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[11.5px] leading-snug text-mute">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Segmented switch (instrument toggle). Scrolls horizontally when it must. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-bar flex overflow-x-auto rounded-[2px] border border-line bg-ink p-0.5', className)}
    >
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-10 flex-1 whitespace-nowrap rounded-[2px] px-3 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors lg:h-8',
            value === o.value ? 'bg-amber/15 text-amber' : 'text-mute hover:text-txt',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={value === o}
          className={cn(
            'min-h-[36px] rounded-[2px] border px-3 text-[11px] transition-colors lg:min-h-[30px]',
            value === o
              ? 'border-amber/50 bg-amber/[0.1] text-amber'
              : 'border-line text-mute hover:border-engrave hover:text-txt',
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Checkbox + label row with a full 44px touch target. */
export function CheckRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cn('flex min-h-[44px] cursor-pointer items-center gap-3 text-[13px] text-dim lg:min-h-[36px]', disabled && 'opacity-50')}>
      <input
        type="checkbox"
        className="h-[18px] w-[18px] shrink-0 rounded-[2px] accent-amber"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/** On/off switch (LED toggle), 44px tall hit area. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="grid h-11 w-11 shrink-0 place-items-center disabled:opacity-50 lg:h-9 lg:w-9"
    >
      <span
        className={cn(
          'block h-[20px] w-[36px] rounded-full border transition-colors',
          checked ? 'border-amber/60 bg-amber/25' : 'border-line bg-ink',
        )}
      >
        <span
          className={cn(
            'mt-[2px] block h-[14px] w-[14px] rounded-full transition-transform',
            checked ? 'translate-x-[19px] bg-amber' : 'translate-x-[2px] bg-engrave',
          )}
        />
      </span>
    </button>
  );
}
