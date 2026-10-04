import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';
import { EmptyState, Panel, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { salaryToday } from '@/data/useSalary';
import { calcAutoMonth, DEFAULT_HOURLY_RATE, DEFAULT_PROBATION_RATE, type AutoDay } from '@/lib/calc/salary';
import { fromISO, monthKey, shiftMonthKey } from '@/lib/dates';
import { fmtDateLong, fmtMonth, money, plural } from '@/lib/format';
import type { SalaryProfile } from '@/types/salary';

interface Props {
  profile: SalaryProfile | null;
  onSaveProfile: (p: Partial<SalaryProfile> & { id?: string }) => Promise<unknown>;
}

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** 🐰 Заяц — automatic payroll: pick a month, everything else is computed. */
export function ZayatsTab({ profile, onSaveProfile }: Props) {
  const today = salaryToday();
  const [month, setMonth] = useState(() => monthKey(today));
  const [selectedDay, setSelectedDay] = useState<AutoDay | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const summary = useMemo(
    () => (profile ? calcAutoMonth(profile, month, today) : null),
    [profile, month, today],
  );

  if (!profile || !summary) {
    return <EmptyState title="Нет автоматического профиля" text="Профиль «Заяц» создаётся автоматически при первом входе." />;
  }

  // Calendar layout: Monday-first offset of the 1st day of the month.
  const firstOffset = (fromISO(`${month}-01`).getDay() + 6) % 7;

  return (
    <div className="space-y-4">
      {/* Month switcher */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-[2px] border border-line bg-panel px-1 py-1">
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-mute hover:text-txt"
            onClick={() => setMonth(m => shiftMonthKey(m, -1))}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="tnum min-w-[128px] text-center text-[13px] font-semibold text-txt">{fmtMonth(month)}</span>
          <button
            type="button"
            className="grid h-9 w-9 place-items-center text-mute hover:text-txt"
            onClick={() => setMonth(m => shiftMonthKey(m, 1))}
            aria-label="Следующий месяц"
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings2 size={14} /> Настройки
        </Button>
      </div>

      {/* Month numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Рабочих дней" value={summary.workDaysTotal} sub={`${summary.hoursTotal} ч по графику 5/2`} />
        <Stat label="Отработано дней" value={summary.workDaysPassed} sub={`${summary.hoursPassed} ч`} />
        <Stat label="Осталось дней" value={summary.workDaysLeft} sub={`${summary.hoursLeft} ч`} />
        <Stat label="Ставка" value={`${summary.dominantRate} ₽/ч`} sub={`${money(summary.dominantRate * (profile.hours_per_day || 8))} за смену`} />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Stat size="lg" tone="accent" label="Зарплата за месяц (план)" value={money(summary.planTotal)} />
        <Stat size="lg" tone="good" label="Заработано сейчас" value={money(summary.earnedSoFar)} />
        <Stat size="lg" label="Осталось заработать" value={money(summary.leftToEarn)} />
      </div>

      {/* Forecast: no invented facts — the plan is the forecast */}
      <Panel label="Прогноз" screw>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          <span className="text-[12px] text-mute">
            План месяца: <span className="tnum font-semibold text-txt">{money(summary.planTotal)}</span>
          </span>
          <span className="text-[12px] text-mute">
            Уже заработано: <span className="tnum font-semibold text-cyan">{money(summary.earnedSoFar)}</span>
          </span>
          <span className="text-[12px] text-mute">
            Прогноз: <span className="tnum font-semibold text-amber">{money(summary.planTotal)}</span>
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-mute">
          Расчёт идёт по производственному календарю РФ (график 5/2): праздники и переносы выходных уже учтены.
        </p>
      </Panel>

      {/* Calendar */}
      <Panel label={`Календарь · ${fmtMonth(month)}`} screw>
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map(d => (
            <span key={d} className="silk py-1 text-mute">
              {d}
            </span>
          ))}
          {Array.from({ length: firstOffset }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {summary.days.map(day => {
            const dayNum = Number(day.date.slice(8, 10));
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedDay(day)}
                aria-label={`${fmtDateLong(day.date)}: ${day.isWorkDay ? 'рабочий день' : 'выходной'}`}
                className={`tnum grid h-10 place-items-center rounded-[2px] border text-[12.5px] transition-colors ${
                  day.isWorkDay
                    ? day.isPast
                      ? 'border-amber/50 bg-amber/15 font-semibold text-amber'
                      : 'border-line bg-panel font-medium text-txt hover:border-amber/50'
                    : 'border-transparent text-mute/60 hover:border-line'
                } ${day.isToday ? 'ring-1 ring-cyan' : ''}`}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
        <p className="silk mt-3 text-mute">
          Рабочие дни подсвечены · {summary.workDaysTotal} {plural(summary.workDaysTotal, ['день', 'дня', 'дней'])} · нажмите на день, чтобы увидеть детали
        </p>
      </Panel>

      {/* Day details */}
      {selectedDay && (
        <Modal
          open={!!selectedDay}
          onOpenChange={o => !o && setSelectedDay(null)}
          title={fmtDateLong(selectedDay.date)}
          description={selectedDay.isWorkDay ? 'Рабочий день' : 'Выходной'}
        >
          {selectedDay.isWorkDay ? (
            <div className="space-y-2 text-[13px]">
              <p className="flex justify-between">
                <span className="text-mute">Часы</span>
                <span className="tnum text-txt">{selectedDay.hours} ч</span>
              </p>
              <p className="flex justify-between">
                <span className="text-mute">Ставка</span>
                <span className="tnum text-txt">
                  {selectedDay.rate} ₽/ч{selectedDay.isProbation ? ' · испытательный срок' : ''}
                </span>
              </p>
              <p className="flex justify-between border-t border-line pt-2">
                <span className="text-mute">Заработок за день</span>
                <span className="tnum font-semibold text-amber">{money(selectedDay.amount)}</span>
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-mute">По производственному календарю этот день нерабочий.</p>
          )}
        </Modal>
      )}

      <ZayatsSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        profile={profile}
        onSave={onSaveProfile}
      />
    </div>
  );
}

/** All «Заяц» numbers are settings on the profile — nothing is hardcoded in the UI. */
function ZayatsSettingsModal({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: SalaryProfile;
  onSave: (p: Partial<SalaryProfile> & { id?: string }) => Promise<unknown>;
}) {
  const toast = useToast();
  const [hourlyRate, setHourlyRate] = useState(String(profile.settings.hourly_rate ?? DEFAULT_HOURLY_RATE));
  const [probationRate, setProbationRate] = useState(String(profile.settings.probation_rate ?? DEFAULT_PROBATION_RATE));
  const [hours, setHours] = useState(String(profile.hours_per_day || 8));
  const [startDate, setStartDate] = useState(profile.start_date);
  const [probationEnd, setProbationEnd] = useState(profile.probation_end_date ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const h = Number(hours.replace(',', '.'));
    const rate = Number(hourlyRate.replace(',', '.'));
    const pRate = Number(probationRate.replace(',', '.'));
    if (!Number.isFinite(h) || h <= 0 || h > 24) return toast.error('Часы в смене: от 1 до 24');
    if (!Number.isFinite(rate) || rate <= 0) return toast.error('Укажите корректную ставку, ₽/час');
    if (!Number.isFinite(pRate) || pRate <= 0) return toast.error('Укажите корректную ставку испытательного срока');
    setSaving(true);
    try {
      await onSave({
        id: profile.id,
        hours_per_day: h,
        start_date: startDate,
        probation_end_date: probationEnd || null,
        settings: { ...profile.settings, hourly_rate: rate, probation_rate: pRate },
      });
      toast.success('Настройки «Зайца» сохранены');
      onOpenChange(false);
    } catch (e) {
      console.error(e);
      toast.error('Не удалось сохранить настройки');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Настройки «Зайца»"
      description="График 5/2 · расчёт по производственному календарю РФ"
      footer={
        <div className="flex gap-2">
          <Button variant="primary" className="flex-1" disabled={saving} onClick={() => void save()}>
            Сохранить
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ставка, ₽/час">
            {id => <Input id={id} inputMode="decimal" value={hourlyRate} onChange={e => setHourlyRate(e.target.value)} />}
          </Field>
          <Field label="На испытательном, ₽/час">
            {id => <Input id={id} inputMode="decimal" value={probationRate} onChange={e => setProbationRate(e.target.value)} />}
          </Field>
        </div>
        <Field label="Часов в рабочем дне">
          {id => <Input id={id} inputMode="decimal" value={hours} onChange={e => setHours(e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Начало работы">
            {id => <Input id={id} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />}
          </Field>
          <Field label="Конец испытательного (вкл.)">
            {id => <Input id={id} type="date" value={probationEnd} onChange={e => setProbationEnd(e.target.value)} />}
          </Field>
        </div>
        <p className="text-[11px] leading-relaxed text-mute">
          До конца испытательного срока действует пониженная ставка, после — основная. Испытательный срок — 1 месяц с начала работы.
        </p>
      </div>
    </Modal>
  );
}
