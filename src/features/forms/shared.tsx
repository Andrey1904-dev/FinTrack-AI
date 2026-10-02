import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { friendlyError } from '@/lib/errors';
import { useCurrentCar } from '@/features/cars/useCars';

/** Wraps submit logic: busy flag, friendly error that keeps the form open (nothing the user typed is lost). */
export function useSubmit(failure: string, success: string, onDone: () => void) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setSaving(true);
    setError('');
    try {
      await fn();
      toast.success(success);
      onDone();
    } catch (e) {
      setError(friendlyError(e, failure));
    } finally {
      setSaving(false);
    }
  };
  return { saving, error, run, setError };
}

export function FormShell({ onSubmit, saving, error, submitText = 'Сохранить', children, extra }: { onSubmit: () => void; saving: boolean; error: string; submitText?: string; children: ReactNode; extra?: ReactNode }) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) onSubmit();
  };
  return (
    <form onSubmit={handle} className="space-y-4" noValidate>
      {children}
      {error && <p role="alert" className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <div className="flex items-center justify-between gap-2 pt-1">
        <div>{extra}</div>
        <Button type="submit" variant="primary" size="lg" disabled={saving} className="min-w-32">{saving ? 'Сохранение…' : submitText}</Button>
      </div>
    </form>
  );
}

export function useDefaultCarId(): string {
  const { current } = useCurrentCar();
  return current?.id ?? '';
}
