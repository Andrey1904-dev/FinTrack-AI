import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/* ============================== TOOLTIP ============================== */

/**
 * Silk-screened hint for icon-only controls.
 * CSS-only (no portal, no dependency), opens on hover *and* keyboard focus,
 * never becomes the accessible name — the control keeps its own aria-label.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  className?: string;
}) {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-[2px] border border-engrave bg-ink px-2 py-1 text-[10.5px] text-dim opacity-0 shadow-raised transition-opacity duration-150',
          'group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ============================= DROPDOWN ============================== */

export interface DropdownItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** render a hairline above (starts a new group) */
  separated?: boolean;
}

/**
 * Instrument-panel pull-down menu: same border/hairline language as Panel,
 * keyboard navigable (↑ ↓ Home End Enter Escape) with click-outside dismissal.
 */
export function Dropdown({
  label,
  trigger,
  items,
  align = 'end',
  className,
}: {
  label: string;
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const enabled = items.filter(i => !i.disabled);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // focus the first enabled item once the menu mounts (no state writes in the effect)
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => menu.current?.querySelector<HTMLElement>('[data-active="true"]')?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const move = (dir: 1 | -1) => {
    if (!enabled.length) return;
    const idx = enabled.findIndex(i => i.key === items[active]?.key);
    const next = enabled[(idx + dir + enabled.length) % enabled.length];
    setActive(items.findIndex(i => i.key === next.key));
  };

  const pick = (item: DropdownItem) => {
    if (item.disabled) return;
    setOpen(false);
    item.onSelect();
  };

  return (
    <div ref={wrap} className={cn('relative', className)}>
      <div
        onClick={() => {
          setActive(items.findIndex(i => !i.disabled));
          setOpen(o => !o);
        }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActive(items.findIndex(i => !i.disabled));
            setOpen(true);
          }
        }}
      >
        <span aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={label} className="contents">
          {trigger}
        </span>
      </div>

      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label={label}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              move(1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              move(-1);
            } else if (e.key === 'Tab') {
              setOpen(false);
            }
          }}
          className={cn(
            'rise absolute z-50 mt-2 min-w-[220px] border border-engrave bg-panel py-1 shadow-dialog',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map(item => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              data-active={active === items.indexOf(item)}
              disabled={item.disabled}
              tabIndex={active === items.indexOf(item) ? 0 : -1}
              onClick={() => pick(item)}
              onMouseEnter={() => setActive(items.indexOf(item))}
              className={cn(
                'flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[12.5px] transition-colors',
                'data-[active=true]:bg-amber/[0.08] data-[active=true]:text-amber',
                item.disabled ? 'cursor-not-allowed text-mute/60' : 'text-dim hover:text-txt',
                item.separated && 'mt-1 border-t border-line pt-2.5',
              )}
            >
              {item.icon && <span className="shrink-0 text-mute">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
