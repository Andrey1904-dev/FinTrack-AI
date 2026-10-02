import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export function Modal({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 flex animate-overlay-in items-end justify-center bg-black/65 backdrop-blur-[2px] sm:items-center sm:p-4">
          <D.Content
            aria-describedby={description ? undefined : undefined}
            className={cn('safe-bottom flex max-h-[92dvh] w-full animate-sheet-in flex-col rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}
          >
            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-4">
              <div>
                <D.Title className="text-base font-semibold">{title}</D.Title>
                {description && <D.Description className="mt-0.5 text-sm text-muted">{description}</D.Description>}
              </div>
              <D.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Закрыть" className="-mr-2 -mt-1"><X size={18} /></Button>
              </D.Close>
            </div>
            <div className="overflow-y-auto px-5 pb-5 pt-2">{children}</div>
          </D.Content>
        </D.Overlay>
      </D.Portal>
    </D.Root>
  );
}

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
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current = resolve;
    setOpts(o);
  }), []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };
  const value = useMemo(() => confirm, [confirm]);
  return (
    <ConfirmCtx.Provider value={value}>
      {children}
      <Modal open={!!opts} onOpenChange={o => !o && close(false)} title={opts?.title ?? ''} description={opts?.text}>
        <div className="mt-2 flex justify-end gap-2">
          <Button onClick={() => close(false)}>Отмена</Button>
          <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>{opts?.confirmText ?? 'Подтвердить'}</Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm must be used inside ConfirmProvider');
  return c;
}
