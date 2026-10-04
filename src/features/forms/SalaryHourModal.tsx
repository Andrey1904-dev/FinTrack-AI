import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSalaryProfiles, useSalaryData } from '@/data/useSalary';
import { calcDayEarnings, getRateForDate } from '@/lib/calc/salary';
import { fmtDateLong, money } from '@/lib/format';
import { todayISO } from '@/lib/dates';
import type { WorkDayStatus } from '@/types/salary';

interface Props {
  onDone: () => void;
  initialHours?: number;
  initialDate?: string;
}

export function SalaryHourModal({ onDone, initialHours = 8, initialDate = todayISO() }: Props) {
  const toast = useToast();
  const [date, setDate] = useState(initialDate);
  const [hours, setHours] = useState(String(initialHours));
  const [status, setStatus] = useState<WorkDayStatus>('worked');
  const [note, setNote] = useState('');

  const currentMonth = date.slice(0, 7);
  const { profiles, rates } = useSalaryProfiles();
  const myProfile = useMemo(() => {
    return profiles.find(p => p.schedule_type === '5/2' || p.name.toLowerCase().includes('моя')) || profiles[0];
  }, [profiles]);

  const [profileId, setProfileId] = useState<string>(myProfile?.id || '');
  const activeProfile = profiles.find(p => p.id === (profileId || myProfile?.id)) || myProfile;

  const { saveWorkDay } = useSalaryData(currentMonth, activeProfile?.id);

  const preview = useMemo(() => {
    if (!activeProfile) return null;
    const h = Number(hours.replace(',', '.')) || 0;
    const { rate } = getRateForDate(date, activeProfile, rates);
    const calc = calcDayEarnings(activeProfile, {
      date,
      actualHours: h,
      plannedHours: activeProfile.hours_per_day || 8,
      status,
      rate,
    }, rates);

    return {
      rate: calc.rate,
      isProbation: calc.isProbation,
      earned: calc.earned,
      hours: h,
    };
  }, [activeProfile, date, hours, status, rates]);

  const handleQuickAdd = (h: number) => {
    setHours(String(h));
  };

  const handleSave = async () => {
    if (!activeProfile) return;
    const h = Number(hours.replace(',', '.')) || 0;
    if (h < 0 || h > 24) {
      toast.error('Укажите корректное количество часов (0-24)');
      return;
    }

    try {
      await saveWorkDay.mutateAsync({
        salary_profile_id: activeProfile.id,
        date,
        planned_hours: activeProfile.hours_per_day || 8,
        actual_hours: h,
        status,
        rate: preview?.rate ?? 0,
        earned_amount: preview?.earned ?? 0,
        note: note.trim(),
      });
      toast.success(`Часы сохранены: ${fmtDateLong(date)} · ${money(preview?.earned ?? 0)}`);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error('Не удалось сохранить часы');
    }
  };

  return (
    <div className="space-y-4">
      {profiles.length > 1 && (
        <Field label="Профиль зарплаты">
          {id => (
            <Select id={id} value={activeProfile?.id ?? ''} onChange={e => setProfileId(e.target.value)}>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.schedule_type})
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}

      <Field label="Дата">
        {id => <Input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}
      </Field>

      <div>
        <label className="silk mb-1.5 block">Быстрый ввод часов</label>
        <div className="flex flex-wrap gap-1.5">
          {[0, 1, 2, 4, 6, 8, 10, 12].map(h => (
            <button
              key={h}
              type="button"
              onClick={() => handleQuickAdd(h)}
              className={`rounded-[2px] border px-2.5 py-1 text-[12px] transition-colors ${
                Number(hours) === h
                  ? 'border-amber bg-amber/15 text-amber'
                  : 'border-line bg-panel text-dim hover:border-engrave hover:text-txt'
              }`}
            >
              {h === 0 ? '0 ч' : `+${h} ч`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Отработано часов">
          {id => (
            <Input
              id={id}
              type="number"
              step="0.5"
              min="0"
              max="24"
              value={hours}
              onChange={e => setHours(e.target.value)}
              placeholder="8"
            />
          )}
        </Field>

        <Field label="Статус">
          {id => (
            <Select id={id} value={status} onChange={e => setStatus(e.target.value as WorkDayStatus)}>
              <option value="worked">Отработано</option>
              <option value="planned">Запланировано</option>
              <option value="day_off">Отгул / Выходной</option>
              <option value="sick">Больничный</option>
              <option value="vacation">Отпуск</option>
              <option value="skipped">Пропущено</option>
              <option value="other">Другое</option>
            </Select>
          )}
        </Field>
      </div>

      {preview && (
        <div className="rounded-[2px] border border-line bg-panel/70 p-3 text-[12px]">
          <div className="silk mb-2 text-mute">Предпросмотр расчёта</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-mute">Ставка: </span>
              <span className="font-semibold text-txt">
                {preview.rate} ₽/ч {preview.isProbation ? '(испытательный)' : ''}
              </span>
            </div>
            <div>
              <span className="text-mute">Начислено: </span>
              <span className="font-semibold text-amber">{money(preview.earned)}</span>
            </div>
          </div>
        </div>
      )}

      <Field label="Комментарий">
        {id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="Например: переработка 2 ч" />}
      </Field>

      <div className="mt-4 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={() => void handleSave()} disabled={saveWorkDay.isPending}>
          Подтвердить
        </Button>
        <Button variant="outline" onClick={onDone}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
