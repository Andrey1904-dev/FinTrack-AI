import { useState, useMemo } from 'react';
import { Field, Input } from '@/components/ui/form';
import { Panel, Readout } from '@/components/ui/misc';
import { type MonthSalarySummary } from '@/lib/calc/salary';
import { money, round2 } from '@/lib/format';
import type { SalaryProfile, SalaryRate, SalaryWorkDay } from '@/types/salary';

interface Props {
  month?: string;
  profile: SalaryProfile;
  summary: MonthSalarySummary | null;
  workDays?: SalaryWorkDay[];
  rates?: SalaryRate[];
}

export function SalaryForecastTab({ profile, summary }: Props) {
  // What-if simulator state
  const [missedDays, setMissedDays] = useState('0');
  const [dailyHoursOverride, setDailyHoursOverride] = useState(String(profile.hours_per_day || 8));
  const [customHourlyRate, setCustomHourlyRate] = useState(String(profile.settings.hourly_rate || 497));
  const [girlCasesPerShift, setGirlCasesPerShift] = useState('400');

  const isPiecework = profile.payment_type === 'piecework';

  const simulation = useMemo(() => {
    if (!summary) return null;
    const missed = Math.max(0, parseInt(missedDays, 10) || 0);
    const hours = Math.max(0, parseFloat(dailyHoursOverride.replace(',', '.')) || (profile.hours_per_day || 8));
    const rate = Math.max(0, parseFloat(customHourlyRate.replace(',', '.')) || (profile.settings.hourly_rate || 497));
    const cases = Math.max(0, parseInt(girlCasesPerShift, 10) || 0);

    // Remaining future work days
    const remainingDays = Math.max(0, summary.remainingWorkDaysCount - missed);

    let futureSimulated = 0;
    if (isPiecework) {
      const shiftEarn = (profile.settings.base_pay ?? 2415) + cases * (profile.settings.case_price ?? 7) * ((profile.settings.piece_percent ?? 25) / 100);
      futureSimulated = remainingDays * shiftEarn;
    } else {
      futureSimulated = remainingDays * hours * rate;
    }

    const simulatedTotal = round2(summary.totalEarnedSoFar + futureSimulated);
    const baselineTotal = summary.monthTotalForecast;
    const diff = round2(simulatedTotal - baselineTotal);

    // Cost of 1 missed day
    const oneDayCost = isPiecework
      ? ((profile.settings.base_pay ?? 2415) + cases * 1.75)
      : (hours * rate);

    return {
      simulatedTotal,
      baselineTotal,
      diff,
      oneDayCost: round2(oneDayCost),
      remainingDays,
    };
  }, [summary, missedDays, dailyHoursOverride, customHourlyRate, girlCasesPerShift, isPiecework, profile]);

  return (
    <div className="space-y-6">
      {/* ---------------- Actual vs Baseline Forecast ---------------- */}
      <Panel label="Текущий прогноз месяца" screw>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="silk mb-1 text-mute">Заработано сейчас</p>
            <Readout value={summary?.totalEarnedSoFar ?? 0} tone="cyan" size="lg" />
            <p className="silk mt-1 text-mute">{summary?.workedDaysCount ?? 0} смен подтверждено</p>
          </div>

          <div>
            <p className="silk mb-1 text-mute">Ожидается до конца месяца</p>
            <Readout value={summary?.futureForecast ?? 0} tone="amber" size="lg" />
            <p className="silk mt-1 text-mute">{summary?.remainingWorkDaysCount ?? 0} смен по графику</p>
          </div>

          <div>
            <p className="silk mb-1 text-mute">Итоговый прогноз</p>
            <Readout value={summary?.monthTotalForecast ?? 0} tone="txt" size="lg" />
            <p className="silk mt-1 text-mute">факт + план смен</p>
          </div>
        </div>
      </Panel>

      {/* ---------------- What-If Simulator (TZ Section 34) ---------------- */}
      <Panel
        label="Симулятор сценариев (What-if для зарплаты)"
        screw
        right={<span className="silk text-mute">без изменения реальных данных</span>}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Пропустить рабочих дней" hint="Что если пропущу N дней?">
            {id => (
              <Input
                id={id}
                type="number"
                min="0"
                value={missedDays}
                onChange={e => setMissedDays(e.target.value)}
                placeholder="0"
              />
            )}
          </Field>

          {!isPiecework ? (
            <>
              <Field label="Часов в день" hint="Что если работать по N часов?">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    step="0.5"
                    value={dailyHoursOverride}
                    onChange={e => setDailyHoursOverride(e.target.value)}
                    placeholder="8"
                  />
                )}
              </Field>

              <Field label="Часовая ставка, ₽" hint="Что если ставка станет другой?">
                {id => (
                  <Input
                    id={id}
                    type="number"
                    value={customHourlyRate}
                    onChange={e => setCustomHourlyRate(e.target.value)}
                    placeholder="497"
                  />
                )}
              </Field>
            </>
          ) : (
            <Field label="Чехлов за смену" hint="Что если делать больше/меньше?">
              {id => (
                <Input
                  id={id}
                  type="number"
                  value={girlCasesPerShift}
                  onChange={e => setGirlCasesPerShift(e.target.value)}
                  placeholder="400"
                />
              )}
            </Field>
          )}
        </div>

        {simulation && (
          <div className="mt-5 rounded-[2px] border border-line bg-panel/70 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-line pb-3">
              <div>
                <span className="silk text-mute">Спрогнозированный доход по сценарию:</span>
                <div className="mt-1">
                  <Readout value={simulation.simulatedTotal} tone={simulation.diff >= 0 ? 'cyan' : 'red'} size="xl" />
                </div>
              </div>
              <div className="text-right">
                <span className="silk text-mute">Разница с базовым планом:</span>
                <p className={`text-[16px] font-bold ${simulation.diff >= 0 ? 'text-cyan' : 'text-red'}`}>
                  {simulation.diff >= 0 ? `+${money(simulation.diff)}` : money(simulation.diff)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-3">
              <div>
                <span className="text-mute">Стоимость 1 пропущенного дня: </span>
                <span className="font-semibold text-red">−{money(simulation.oneDayCost)}</span>
              </div>
              <div>
                <span className="text-mute">Останется смен по сценарию: </span>
                <span className="font-semibold text-txt">{simulation.remainingDays}</span>
              </div>
              <div>
                <span className="text-mute">Базовый прогноз: </span>
                <span className="font-semibold text-dim">{money(simulation.baselineTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
