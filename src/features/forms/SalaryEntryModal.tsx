import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { salaryToday, useSalaryEntries, useSalaryProfiles } from '@/data/useSalary';
import { zaychikContextLabel } from '@/features/salary/ZaychikTab';
import { fmtDateLong, money } from '@/lib/format';

interface Props {
  onDone: () => void;
  initialAmount?: number;
  initialDate?: string;
}

/** Quick «Зайчик» form: "сегодня заработал 4 000" in a couple of seconds. */
export function SalaryEntryModal({ onDone, initialAmount, initialDate }: Props) {
  const toast = useToast();
  const { profiles } = useSalaryProfiles();
  const { saveEntry } = useSalaryEntries();

  const [date, setDate] = useState(initialDate ?? salaryToday());
  const [amount, setAmount] = useState(initialAmount ? String(initialAmount) : '');
  const [note, setNote] = useState('');
  const [profileId, setProfileId] = useState('');
  const [saving, setSaving] = useState(false);

  const active = profiles.filter(p => p.active);
  const selected = active.find(p => p.id === profileId) ?? active.find(p => p.mode === 'manual') ?? active[0];

  const save = async () => {
    if (!selected) return toast.error('Нет профиля зарплаты');
    const value = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return toast.error('Укажите сумму заработка');
    setSaving(true);
    try {
      await saveEntry.mutateAsync({
        salary_profile_id: selected.id,
        date,
        amount: Math.round(value * 100) / 100,
        note: note.trim(),
      });
      toast.success(`Смена сохранена: ${fmtDateLong(date)} · ${money(value)}`);
      onDone();
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сохранить смену');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {active.length > 1 && (
        <Field label="Чьи смены">
          {id => (
            <Select id={id} value={selected?.id ?? ''} onChange={e => setProfileId(e.target.value)}>
              {active.map(p => (
                <option key={p.id} value={p.id}>
                  {zaychikContextLabel(p)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label="Дата">
        {id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}
      </Field>

      <Field label="Заработал, ₽">
        {id => (
          <Input id={id} inputMode="decimal" placeholder="4 000" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
        )}
      </Field>

      <Field label="Заметка (необязательно)">
        {id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} />}
      </Field>

      <Button variant="primary" block disabled={saving} onClick={() => void save()}>
        Сохранить
      </Button>
    </div>
  );
}
