import { useMemo } from 'react';
import { MonthBars } from '@/components/charts/charts';
import { Panel, Stat } from '@/components/ui/misc';
import { calcRateDifference, type MonthSalarySummary } from '@/lib/calc/salary';
import { money } from '@/lib/format';
import type { SalaryProfile, SalaryRate, SalaryWorkDay } from '@/types/salary';

interface Props {
  month: string;
  profile: SalaryProfile;
  summary: MonthSalarySummary | null;
  workDays: SalaryWorkDay[];
  rates?: SalaryRate[];
}

export function SalaryStatisticsTab({ month, profile, summary, workDays }: Props) {
  const isHourly = profile.payment_type === 'hourly';

  const rateDiff = useMemo(() => {
    if (!isHourly) return null;
    return calcRateDifference(profile, month, workDays);
  }, [profile, month, workDays, isHourly]);

  // Daily earnings distribution for bar chart
  const dailyData = useMemo(() => {
    if (!summary?.days) return [];
    return summary.days
      .filter(d => d.earned > 0)
      .map(d => ({
        label: d.date.slice(8), // day number
        income: d.earned,
        expense: 0,
      }));
  }, [summary]);

  return (
    <div className="space-y-6">
      {/* ---------------- Rate Comparison (TZ Section 17) ---------------- */}
      {rateDiff && (
        <Panel label="Сравнение ставок · Испытательный срок vs Основная" screw>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Испытательный срок" value={`${rateDiff.probationRate} ₽/час`} sub="первый месяц работы" />
            <Stat label="После испытательного" value={`${rateDiff.standardRate} ₽/час`} tone="good" sub="основная ставка" />
            <Stat label="Разница в час" value={`+${rateDiff.hourlyDiff} ₽/час`} tone="accent" sub={`+${rateDiff.dailyDiff} ₽ за день (8ч)`} />
            <Stat label={`Прибавка за ${month}`} value={`+${money(rateDiff.monthDiff)}`} tone="good" sub={`на ${rateDiff.monthWorkHours} рабочих часов`} />
          </div>
          <p className="silk mt-3 text-mute">
            Расчёт основан на реальном производственном календаре и фактически запланированных часах месяца, без фиксированного шаблона 22 дня.
          </p>
        </Panel>
      )}

      {/* ---------------- Key Performance Indicators ---------------- */}
      <Panel label="Показатели работы за месяц" screw>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Stat label="Средний заработок в день" value={money(summary?.avgDayEarnings ?? 0)} />
          {isHourly && <Stat label="Средняя продолжительность" value={`${summary?.avgDailyHours ?? 0} ч`} sub="за рабочий день" />}
          <Stat label="Максимальный день" value={money(summary?.maxDayEarnings ?? 0)} tone="good" />
          <Stat label="Минимальный день" value={money(summary?.minDayEarnings ?? 0)} />
          <Stat label="Всего отработано" value={`${summary?.workedDaysCount ?? 0} смен`} sub={isHourly ? `${summary?.workedHours ?? 0} часов` : undefined} />
          <Stat label="Осталось отработать" value={`${summary?.remainingWorkDaysCount ?? 0} смен`} sub={isHourly ? `${summary?.plannedRemainingHours ?? 0} часов` : undefined} />
          <Stat label="Прогноз до конца месяца" value={money(summary?.monthTotalForecast ?? 0)} tone="accent" />
          <Stat label="Начислено на текущий момент" value={money(summary?.totalEarnedSoFar ?? 0)} tone="good" />
        </div>
      </Panel>

      {/* ---------------- Daily Earnings Chart ---------------- */}
      <Panel label="Заработок по дням месяца" screw>
        {dailyData.length > 0 ? (
          <div className="pt-2">
            <MonthBars data={dailyData} />
            <p className="silk mt-3 text-mute">Отображаются дни с начислениями (отработанные или запланированные)</p>
          </div>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-mute">
            В этом месяце ещё нет отработанных или запланированных смен.
          </p>
        )}
      </Panel>
    </div>
  );
}
