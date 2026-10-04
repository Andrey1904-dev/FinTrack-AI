import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { Panel, Stat } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { calcDayEarnings, type DayDetail, type MonthSalarySummary } from '@/lib/calc/salary';
import { fmtDateLong, money } from '@/lib/format';
import type { SalaryProfile, SalaryRate, SalaryWorkDay, WorkDayStatus } from '@/types/salary';

interface Props {
  month?: string;
  profile: SalaryProfile;
  summary: MonthSalarySummary | null;
  workDays: SalaryWorkDay[];
  rates: SalaryRate[];
  onSaveWorkDay: (data: Partial<SalaryWorkDay>) => Promise<unknown>;
}

export function SalaryCalendarTab({ profile, summary, workDays, rates, onSaveWorkDay }: Props) {
  const toast = useToast();
  const [selectedDay, setSelectedDay] = useState<DayDetail | null>(null);

  // Edit form state
  const [actualHours, setActualHours] = useState('8');
  const [status, setStatus] = useState<WorkDayStatus>('worked');
  const [cases, setCases] = useState('0');
  const [bonus, setBonus] = useState('0');
  const [isHoliday, setIsHoliday] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const isPiecework = profile.payment_type === 'piecework';

  const openDayModal = (day: DayDetail) => {
    setSelectedDay(day);
    setActualHours(String(day.actualHours || day.plannedHours || (profile.hours_per_day || 8)));
    setStatus(day.status === 'day_off' ? 'worked' : day.status);
    setCases(String(day.cases || 0));
    setBonus(String(day.bonus || 0));
    setIsHoliday(day.isHoliday);
    setNote(day.note || '');
  };

  const preview = useMemo(() => {
    if (!selectedDay) return null;
    const h = Number(actualHours.replace(',', '.')) || 0;
    const c = parseInt(cases, 10) || 0;
    const b = Number(bonus.replace(',', '.')) || 0;

    const calc = calcDayEarnings(profile, {
      date: selectedDay.date,
      actualHours: h,
      plannedHours: selectedDay.plannedHours,
      status,
      cases: c,
      isHoliday,
      bonus: b,
    }, rates);

    return calc;
  }, [selectedDay, actualHours, status, cases, isHoliday, bonus, profile, rates]);

  const handleSave = async () => {
    if (!selectedDay) return;
    setSaving(true);
    try {
      const existing = workDays.find(d => d.salary_profile_id === profile.id && d.date === selectedDay.date);
      const h = Number(actualHours.replace(',', '.')) || 0;
      const c = parseInt(cases, 10) || 0;
      const b = Number(bonus.replace(',', '.')) || 0;

      await onSaveWorkDay({
        id: existing?.id,
        salary_profile_id: profile.id,
        date: selectedDay.date,
        planned_hours: selectedDay.plannedHours || profile.hours_per_day || 8,
        actual_hours: h,
        status,
        rate: preview?.rate ?? selectedDay.rate,
        earned_amount: preview?.earned ?? 0,
        cases: c,
        is_holiday: isHoliday,
        bonus: b,
        note: note.trim(),
      });
      toast.success(`Сохранено: ${selectedDay.date} · ${money(preview?.earned ?? 0)}`);
      setSelectedDay(null);
    } catch (err) {
      console.error(err);
      toast.error('Ошибка при сохранении смены');
    } finally {
      setSaving(false);
    }
  };

  const days = summary?.days || [];

  // Payout dates for this month based on profile settings
  const payoutInfo = (() => {
    if (!summary) return [];
    const advDay = (profile.settings as { advance_day?: number })?.advance_day ?? 25;
    const salDay = (profile.settings as { salary_day?: number })?.salary_day ?? 10;
    const monthStr = summary.month;
    const nextMonth = (() => {
      const [y, m] = monthStr.split('-').map(Number);
      const d = new Date(Date.UTC(y, m, 1));
      d.setUTCMonth(d.getUTCMonth() + 1);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    })();
    return [
      { date: `${monthStr}-${String(advDay).padStart(2, '0')}`, label: 'Аванс', amount: Math.round(summary.monthTotalForecast / 2) },
      { date: `${nextMonth}-${String(salDay).padStart(2, '0')}`, label: 'Зарплата', amount: summary.monthTotalForecast - Math.round(summary.monthTotalForecast / 2) },
    ];
  })();

  return (
    <div className="space-y-6">
      {/* Month metrics strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Отработано" value={`${summary?.workedDaysCount ?? 0} смен`} sub={`${summary?.workedHours ?? 0} ч`} />
        <Stat label="Начислено" value={money(summary?.totalEarnedSoFar ?? 0)} tone="good" />
        <Stat label="Впереди" value={`${summary?.remainingWorkDaysCount ?? 0} смен`} sub={`${summary?.plannedRemainingHours ?? 0} ч`} />
        <Stat label="Итоговый прогноз" value={money(summary?.monthTotalForecast ?? 0)} tone="accent" />
      </div>

      {/* Payout dates */}
      <Panel label="Зарплатный календарь · Выплаты" screw>
        <div className="space-y-2">
          {payoutInfo.map(pi => (
            <div key={pi.date} className="flex items-center justify-between rounded-[2px] border border-line bg-panel/50 px-3 py-2 text-[12.5px]">
              <span className="text-txt">
                {pi.date} — {pi.label} · {pi.label === 'Аванс' ? 'ожидается' : 'ожидается окончательный расчёт'}
              </span>
              <span className="font-semibold text-amber">{money(pi.amount)}</span>
            </div>
          ))}
          <p className="silk text-mute">Даты выплат берутся из настроек профиля (аванс { (profile.settings as { advance_day?: number })?.advance_day ?? 25 }-е, зарплата { (profile.settings as { salary_day?: number })?.salary_day ?? 10 }-е). Измените их в Настройках.</p>
        </div>
      </Panel>

      {/* Calendar Grid */}
      <Panel label={`Календарь смен · ${profile.name} (${profile.schedule_type})`} screw>
        <div className="grid grid-cols-7 gap-1 border-b border-line pb-2 text-center text-[11px] font-semibold text-mute">
          <div>Пн</div>
          <div>Вт</div>
          <div>Ср</div>
          <div>Чт</div>
          <div>Пт</div>
          <div className="text-red">Сб</div>
          <div className="text-red">Вс</div>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {/* Leading empty days for month offset */}
          {(() => {
            if (!days.length) return null;
            const firstDate = new Date(`${days[0].date}T12:00:00Z`);
            const firstDayOfWeek = (firstDate.getUTCDay() + 6) % 7; // Mon = 0, Sun = 6
            return Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[70px] rounded-[2px] border border-transparent p-1 opacity-20 sm:min-h-[85px]" />
            ));
          })()}

          {days.map(d => {
            const dayNum = d.date.slice(8);
            const isWorked = d.status === 'worked' || (d.earned > 0 && !d.isFuture);
            const isPlanned = d.isWorkScheduled && !isWorked && d.status !== 'day_off' && d.status !== 'sick' && d.status !== 'vacation';
            const isOff = !d.isWorkScheduled || d.status === 'day_off' || d.status === 'vacation' || d.status === 'sick';

            const borderClass = 'border-line';
            let bgClass = 'bg-panel/40';

            if (d.status === 'sick') {
              bgClass = 'bg-warn/10 border-warn/40 text-warn';
            } else if (d.status === 'vacation') {
              bgClass = 'bg-cyan/10 border-cyan/40 text-cyan';
            } else if (isWorked) {
              bgClass = 'bg-cyan/15 border-cyan/50';
            } else if (isPlanned) {
              bgClass = 'bg-amber/10 border-amber/40 border-dashed';
            } else if (isOff) {
              bgClass = 'bg-rail/30 opacity-70';
            }

            return (
              <button
                key={d.date}
                type="button"
                onClick={() => openDayModal(d)}
                className={`group relative flex min-h-[70px] flex-col justify-between rounded-[2px] border p-1.5 text-left transition-all hover:scale-[1.02] hover:border-amber hover:shadow-sm sm:min-h-[85px] sm:p-2 ${borderClass} ${bgClass}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-txt">{dayNum}</span>
                  {d.isHoliday && (
                    <span className="rounded-[1px] bg-red/20 px-1 text-[8px] font-semibold text-red">Праздник</span>
                  )}
                  {d.isCustom && (
                    <span className="h-1.5 w-1.5 rounded-full bg-amber" title="Изменено вручную" />
                  )}
                </div>

                <div className="my-auto">
                  {isPiecework ? (
                    d.cases > 0 ? (
                      <div className="text-[10px] text-mute">{d.cases} шт</div>
                    ) : null
                  ) : (
                    d.plannedHours > 0 || d.actualHours > 0 ? (
                      <div className="text-[10px] text-mute">
                        {d.actualHours || d.plannedHours} ч {d.rate ? `· ${d.rate}₽` : ''}
                      </div>
                    ) : null
                  )}

                  {d.status === 'vacation' && <div className="text-[10px] font-medium text-cyan">Отпуск</div>}
                  {d.status === 'sick' && <div className="text-[10px] font-medium text-warn">Больничный</div>}
                  {d.status === 'skipped' && <div className="text-[10px] font-medium text-red">Пропуск</div>}
                </div>

                <div className="mt-1 text-right">
                  {d.earned > 0 ? (
                    <span className={`text-[11px] font-semibold ${isWorked ? 'text-cyan' : 'text-amber'}`}>
                      {money(d.earned)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-mute/50">—</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-line pt-3 text-[11px] text-mute">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[1px] border border-cyan bg-cyan/20" /> Отработано
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[1px] border border-dashed border-amber bg-amber/20" /> План по графику
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[1px] border border-line bg-rail/40" /> Выходной
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-amber" /> Ручная корректировка
          </div>
        </div>
      </Panel>

      {/* Day Edit Modal */}
      {selectedDay && (
        <Modal
          open={!!selectedDay}
          onOpenChange={open => !open && setSelectedDay(null)}
          title={`Редактирование дня: ${fmtDateLong(selectedDay.date)}`}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Статус">
                {id => (
                  <Select id={id} value={status} onChange={e => setStatus(e.target.value as WorkDayStatus)}>
                    <option value="worked">Отработано</option>
                    <option value="planned">Запланировано</option>
                    <option value="day_off">Выходной / Отгул</option>
                    <option value="sick">Больничный</option>
                    <option value="vacation">Отпуск</option>
                    <option value="skipped">Пропуск</option>
                    <option value="other">Другое</option>
                  </Select>
                )}
              </Field>

              {isPiecework ? (
                <Field label="Количество чехлов (сделка)">
                  {id => (
                    <Input
                      id={id}
                      type="number"
                      value={cases}
                      onChange={e => setCases(e.target.value)}
                      placeholder="0"
                    />
                  )}
                </Field>
              ) : (
                <Field label="Отработано часов">
                  {id => (
                    <Input
                      id={id}
                      type="number"
                      step="0.5"
                      value={actualHours}
                      onChange={e => setActualHours(e.target.value)}
                      placeholder="8"
                    />
                  )}
                </Field>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Праздничная смена">
                {id => (
                  <Select id={id} value={isHoliday ? 'yes' : 'no'} onChange={e => setIsHoliday(e.target.value === 'yes')}>
                    <option value="no">Обычный день</option>
                    <option value="yes">Праздничный день</option>
                  </Select>
                )}
              </Field>

              <Field label="Премия / Бонус, ₽">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    value={bonus}
                    onChange={e => setBonus(e.target.value)}
                    placeholder="0"
                  />
                )}
              </Field>
            </div>

            {/* Quick buttons */}
            {!isPiecework && (
              <div>
                <span className="silk mb-1 block">Быстрые часы:</span>
                <div className="flex flex-wrap gap-1">
                  {[0, 4, 6, 8, 10, 12].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setActualHours(String(h))}
                      className="rounded-[2px] border border-line bg-panel px-2.5 py-1 text-[11px] hover:border-amber hover:text-amber"
                    >
                      {h} ч
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div className="rounded-[2px] border border-line bg-panel/60 p-3 text-[12px]">
                <div className="silk mb-1 text-mute">Расчёт за смену</div>
                <div className="flex items-center justify-between">
                  <span>Ставка: {preview.rate} ₽</span>
                  <span className="text-[14px] font-semibold text-amber">{money(preview.earned)}</span>
                </div>
              </div>
            )}

            <Field label="Комментарий">
              {id => <Input id={id} value={note} onChange={e => setNote(e.target.value)} placeholder="Причина изменений" />}
            </Field>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void handleSave()} disabled={saving}>
                Сохранить
              </Button>
              <Button variant="outline" onClick={() => setSelectedDay(null)}>
                Отмена
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
