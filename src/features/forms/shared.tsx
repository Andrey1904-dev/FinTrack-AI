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

/**
 * Form layout shared by every dialog form.
 *
 * On a phone the action row sticks to the bottom of the sheet so "Сохранить"
 * stays reachable even when the on-screen keyboard pushes the content up.
 */
export function FormShell({
  onSubmit,
  saving,
  error,
  submitText = 'Сохранить',
  children,
  extra,
}: {
  onSubmit: () => void;
  saving: boolean;
  error: string;
  submitText?: string;
  children: ReactNode;
  extra?: ReactNode;
}) {
  const handle = (e: FormEvent) => {
    e.preventDefault();
    if (!saving) onSubmit();
  };
  return (
    <form onSubmit={handle} className="space-y-4" noValidate>
      {children}
      {error && (
        <p role="alert" className="border border-red/40 bg-red/[0.08] px-3 py-2 text-[12px] leading-snug text-red">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 -mx-5 -mb-4 mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-[#151a1c] px-5 py-3">
        <div className="min-w-0">{extra}</div>
        <Button type="submit" variant="primary" size="lg" disabled={saving} className="w-full min-w-32 sm:w-auto sm:min-w-36">
          {saving ? 'Сохранение…' : submitText}
        </Button>
      </div>
    </form>
  );
}

export function useDefaultCarId(): string {
  const { current } = useCurrentCar();
  return current?.id ?? '';
}
