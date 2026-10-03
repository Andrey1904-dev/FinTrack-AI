import * as D from '@radix-ui/react-dialog';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button, IconButton } from './button';

/**
 * One dialog component for the whole app.
 *
 * Desktop: centred instrument panel with a thin border.
 * iPhone: full-width bottom sheet that respects the home indicator, scrolls
 * inside the viewport (100dvh) and never hides the primary actions.
 */
function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide,
  side = 'auto',
  labelledBy,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  side?: 'auto' | 'right';
  labelledBy?: string;
}) {
  const toRight = side === 'right';
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay
          className={cn(
            'fixed inset-0 z-50 flex animate-fadein bg-ink/85 backdrop-blur-[2px]',
            toRight ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-4',
          )}
        >
          <D.Content
            aria-labelledby={labelledBy}
            className={cn(
              'relative flex max-h-[92dvh] w-full flex-col border-engrave bg-panel shadow-dialog outline-none',
              'animate-sheet-up sm:animate-fadein',
              'border-t',
              toRight
                ? 'h-[100dvh] max-h-none w-[86vw] max-w-[360px] border-l sm:rounded-l-[3px]'
                : 'border-t-[3px] border-t-amber/50 sm:my-auto sm:max-h-[86dvh] sm:rounded-[3px] sm:border',
              !toRight && (wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'),
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            {/* grab handle — phone affordance for the bottom sheet */}
            {!toRight && (
              <div className="flex shrink-0 justify-center pt-2 sm:hidden" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-engrave" />
              </div>
            )}

            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-3.5">
              <div className="min-w-0">
                <D.Title className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-txt">{title}</D.Title>
                {description ? (
                  <D.Description className="mt-1 text-[11.5px] leading-relaxed text-mute">{description}</D.Description>
                ) : (
                  <D.Description className="sr-only">{title}</D.Description>
                )}
              </div>
              <D.Close asChild>
                <IconButton label="Закрыть" className="-mr-1 -mt-1" size="icon-sm" />
              </D.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>

            {footer && <div className="shrink-0 border-t border-line px-5 py-3">{footer}</div>}
          </D.Content>
        </D.Overlay>
      </D.Portal>
    </D.Root>
  );
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={title} description={description} wide={wide} footer={footer}>
      {children}
    </DialogShell>
  );
}

/** Side sheet — used for the full section list on phones. */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  side = 'bottom',
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  children: ReactNode;
  side?: 'bottom' | 'right';
}) {
  return (
    <DialogShell open={open} onOpenChange={onOpenChange} title={title} side={side === 'right' ? 'right' : 'auto'}>
      {children}
    </DialogShell>
  );
}

export const Dialog = Modal;

/* ============================== CONFIRM ============================ */

interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  danger?: boolean;
}

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>(resolve => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  }, []);
  const value = useMemo(() => confirm, [confirm]);
  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      <Modal
        open={!!opts}
        onOpenChange={o => !o && close(false)}
        title={opts?.title ?? ''}
        description={opts?.text}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button className="sm:min-w-28" onClick={() => close(false)}>
              Отмена
            </Button>
            <Button variant={opts?.danger ? 'danger-solid' : 'primary'} className="sm:min-w-28" onClick={() => close(true)}>
              {opts?.confirmText ?? 'Подтвердить'}
            </Button>
          </div>
        }
      >
        <p className="text-[12px] leading-relaxed text-mute">Проверьте детали выше: некоторые действия нельзя отменить.</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm must be used inside ConfirmProvider');
  return c;
}
