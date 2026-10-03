import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}

const Ctx = createContext<{ success: (t: string) => void; error: (t: string) => void } | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast['tone']) => {
    const id = ++seq;
    setItems(prev => [...prev.slice(-2), { id, text, tone }]);
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), tone === 'error' ? 6000 : 2800);
  }, []);
  const value = useMemo(() => ({ success: (t: string) => push(t, 'ok'), error: (t: string) => push(t, 'error') }), [push]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* above the phone tab bar, bottom-right on desktop */}
      <div
        className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 lg:items-end"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}
        aria-live="polite"
        role="status"
      >
        <div className="flex w-full max-w-md flex-col items-stretch gap-2 lg:items-end">
          {items.map(t => (
            <div
              key={t.id}
              className={cn(
                'pointer-events-auto flex animate-rise items-start gap-2.5 border bg-panel/95 px-3.5 py-3 text-[12.5px] shadow-dialog backdrop-blur-md',
                t.tone === 'ok' ? 'border-cyan/40' : 'border-red/50',
              )}
            >
              {t.tone === 'ok' ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan" />
              ) : (
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red" />
              )}
              <span className={cn('leading-snug', t.tone === 'ok' ? 'text-txt' : 'text-red')}>{t.text}</span>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
