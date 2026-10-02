import { CheckCircle2, AlertCircle } from 'lucide-react';
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
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={cn('pointer-events-auto flex max-w-md animate-fade-in items-start gap-2 rounded-xl border bg-raised px-4 py-3 text-sm shadow-xl', t.tone === 'ok' ? 'border-good/30' : 'border-bad/40')}>
            {t.tone === 'ok' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" /> : <AlertCircle size={18} className="mt-0.5 shrink-0 text-bad" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used inside ToastProvider');
  return c;
}
