import { Field, MoneyInput } from '@/components/ui/form';

/** Numeric input kept as a string so the user can type "12," or clear the field without it snapping back to 0. */
export function NumField({ label, value, onChange, hint, suffix, className }: { label: string; value: string; onChange: (v: string) => void; hint?: string; suffix?: string; className?: string }) {
  return (
    <Field label={suffix ? `${label}, ${suffix}` : label} hint={hint} className={className}>
      {id => <MoneyInput id={id} value={value} onChange={e => onChange(e.target.value)} placeholder="0" />}
    </Field>
  );
}

export const asText = (n: number | undefined): string => (n ? String(n) : '');
