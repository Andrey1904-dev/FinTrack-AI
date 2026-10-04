import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Modal } from '@/components/ui/dialog';
import { DebtPaymentForm } from './DebtPaymentForm';
import { NoteForm } from './NoteForm';
import { OperationForm } from './OperationForm';
import { RefuelForm } from './RefuelForm';
import { SalaryEntryModal } from './SalaryEntryModal';
import { ServiceForm } from './ServiceForm';
import { TaskForm } from './TaskForm';

export type QuickKind = 'expense' | 'income' | 'payment' | 'salary_entry' | 'refuel' | 'service' | 'task' | 'note';

export const QUICK_ACTIONS: Array<{ kind: QuickKind; label: string }> = [
  { kind: 'salary_entry', label: 'Добавить заработок за смену' },
  { kind: 'expense', label: 'Добавить расход' },
  { kind: 'income', label: 'Добавить доход' },
  { kind: 'payment', label: 'Записать платёж' },
  { kind: 'refuel', label: 'Заправка' },
  { kind: 'service', label: 'Обслуживание авто' },
  { kind: 'task', label: 'Добавить задачу' },
  { kind: 'note', label: 'Добавить заметку' },
];

const TITLES: Record<QuickKind, string> = {
  salary_entry: 'Заработок за смену',
  expense: 'Новый расход', income: 'Новый доход', payment: 'Платёж по долгу', refuel: 'Заправка',
  service: 'Обслуживание автомобиля', task: 'Новая задача', note: 'Новая заметка',
};

interface Ctx {
  open: (kind: QuickKind, payload?: { debtId?: string; amount?: number; date?: string }) => void;
}
const QuickCtx = createContext<Ctx | null>(null);

export function QuickProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ kind: QuickKind; debtId?: string; amount?: number; date?: string; n: number } | null>(null);
  const open = useCallback((kind: QuickKind, payload?: { debtId?: string; amount?: number; date?: string }) => {
    setState({ kind, debtId: payload?.debtId, amount: payload?.amount, date: payload?.date, n: Date.now() });
  }, []);
  const close = useCallback(() => setState(null), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <QuickCtx.Provider value={value}>
      {children}
      <Modal open={!!state} onOpenChange={o => !o && close()} title={state ? TITLES[state.kind] : ''}>
        {state?.kind === 'salary_entry' && <SalaryEntryModal key={state.n} initialAmount={state.amount} initialDate={state.date} onDone={close} />}
        {state?.kind === 'expense' && <OperationForm key={state.n} type="expense" onDone={close} />}
        {state?.kind === 'income' && <OperationForm key={state.n} type="income" onDone={close} />}
        {state?.kind === 'payment' && <DebtPaymentForm key={state.n} debtId={state.debtId} onDone={close} />}
        {state?.kind === 'refuel' && <RefuelForm key={state.n} onDone={close} />}
        {state?.kind === 'service' && <ServiceForm key={state.n} onDone={close} />}
        {state?.kind === 'task' && <TaskForm key={state.n} onDone={close} />}
        {state?.kind === 'note' && <NoteForm key={state.n} onDone={close} />}
      </Modal>
    </QuickCtx.Provider>
  );
}

export function useQuick(): Ctx {
  const c = useContext(QuickCtx);
  if (!c) throw new Error('useQuick must be used inside QuickProvider');
  return c;
}
