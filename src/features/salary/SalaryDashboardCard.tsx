import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelLink } from '@/components/ui/misc';
import { useSalaryData } from '@/data/useSalary';
import { useQuick } from '@/features/forms/QuickProvider';
import { daysBetween, monthKey, shiftMonthKey, todayISO } from '@/lib/dates';
import { money, plural } from '@/lib/format';

function nextPayoutDate(profile: { settings: Record<string, unknown> }, today: string): string | null {
  const advDay = Number((profile.settings as { advance_day?: number })?.advance_day ?? 25);
  const salDay = Number((profile.settings as { salary_day?: number })?.salary_day ?? 10);
  if (!Number.isFinite(advDay) || !Number.isFinite(salDay)) return null;

  const curMonth = monthKey(today);
  const nextMonth = shiftMonthKey(curMonth, 1);

  // Build candidate dates: advance in current month, salary in next month, plus also salary in current month (if day >= today)
  const candidates: string[] = [];

  // Advance current month
  const advThisMonth = `${curMonth}-${String(advDay).padStart(2, '0')}`;
  candidates.push(advThisMonth);

  // Salary current month (for profiles where salary_day is in same month, e.g. 8th for previous period but we show as upcoming)
  const salThisMonth = `${curMonth}-${String(salDay).padStart(2, '0')}`;
  candidates.push(salThisMonth);

  // Salary next month
  const salNextMonth = `${nextMonth}-${String(salDay).padStart(2, '0')}`;
  candidates.push(salNextMonth);

  // Advance next month
  const advNextMonth = `${nextMonth}-${String(advDay).padStart(2, '0')}`;
  candidates.push(advNextMonth);

  // Filter >= today and sort
  const future = candidates.filter(d => d >= today).sort();
  return future[0] || null;
}

export function SalaryDashboardCard() {
  const quick = useQuick();
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const { profiles, profileSummaries, familySummary, payments } = useSalaryData(currentMonth);

  const myProfile = profiles.find(p => p.name.toLowerCase().includes('моя') || p.schedule_type === '5/2');
  const girlProfile = profiles.find(p => p.name.toLowerCase().includes('девушк') || p.schedule_type === '2/2');

  const mySummary = myProfile ? profileSummaries.get(myProfile.id) : null;
  const girlSummary = girlProfile ? profileSummaries.get(girlProfile.id) : null;

  // Days until probation end
  let probationDaysLeft: number | null = null;
  if (myProfile?.probation_end_date) {
    const diff = daysBetween(today, myProfile.probation_end_date);
    if (diff > 0) probationDaysLeft = diff;
  }

  // Days until next salary payout (family)
  let nextPayout: { date: string; days: number; profileName: string } | null = null;
  for (const p of profiles) {
    if (!p.active) continue;
    const d = nextPayoutDate(p, today);
    if (!d) continue;
    const diff = daysBetween(today, d);
    if (diff < 0) continue;
    if (!nextPayout || diff < nextPayout.days) {
      nextPayout = { date: d, days: diff, profileName: p.name };
    }
  }

  // Also consider explicit expected payments that are sooner
  const expectedPayments = payments.filter(pm => pm.status === 'expected' && pm.payment_date >= today).sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  if (expectedPayments.length > 0) {
    const soonest = expectedPayments[0];
    const diff = daysBetween(today, soonest.payment_date);
    if (!nextPayout || diff < nextPayout.days) {
      const prof = profiles.find(pr => pr.id === soonest.salary_profile_id);
      nextPayout = { date: soonest.payment_date, days: diff, profileName: prof?.name ?? 'Зарплата' };
    }
  }

  return (
    <Panel label="💰 Зарплата и доходы" screw right={<PanelLink to="/salary">Все зарплаты →</PanelLink>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Mine */}
          <div className="rounded-[2px] border border-line bg-panel/60 p-3">
            <div className="flex items-center justify-between border-b border-line/60 pb-1.5">
              <span className="text-[12.5px] font-semibold text-txt">{myProfile?.name ?? 'Моя'}</span>
              <span className="silk text-mute">5/2 · 442/497 ₽</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <span className="silk block text-mute">Заработано:</span>
                <span className="tnum text-[15px] font-bold text-cyan">{money(mySummary?.totalEarnedSoFar ?? 0)}</span>
              </div>
              <div>
                <span className="silk block text-mute">Прогноз:</span>
                <span className="tnum text-[15px] font-bold text-amber">{money(mySummary?.monthTotalForecast ?? 0)}</span>
              </div>
            </div>
            {probationDaysLeft !== null && (
              <p className="silk mt-2 text-cyan">
                До ставки 497 ₽: <span className="font-semibold">{probationDaysLeft} дн.</span>
              </p>
            )}
          </div>

          {/* Girl's */}
          <div className="rounded-[2px] border border-line bg-panel/60 p-3">
            <div className="flex items-center justify-between border-b border-line/60 pb-1.5">
              <span className="text-[12.5px] font-semibold text-txt">{girlProfile?.name ?? 'Девушка'}</span>
              <span className="silk text-mute">2/2 · сдельная</span>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div>
                <span className="silk block text-mute">Заработано:</span>
                <span className="tnum text-[15px] font-bold text-cyan">{money(girlSummary?.totalEarnedSoFar ?? 0)}</span>
              </div>
              <div>
                <span className="silk block text-mute">Прогноз:</span>
                <span className="tnum text-[15px] font-bold text-amber">{money(girlSummary?.monthTotalForecast ?? 0)}</span>
              </div>
            </div>
            <p className="silk mt-2 text-mute">
              Смен закрыто: {girlSummary?.workedDaysCount ?? 0}
            </p>
          </div>
        </div>

        {/* Total Family Forecast row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="space-y-1">
            <span className="silk block text-mute">Прогноз дохода семьи на месяц:</span>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="tnum text-[18px] font-semibold text-txt">{money(familySummary.forecast)}</span>
              <span className="tnum text-[12px] text-mute">
                {money(familySummary.earnedSoFar)} / {money(familySummary.forecast)} · факт/план
              </span>
            </div>
            {nextPayout && (
              <p className="text-[11.5px] text-amber">
                💸 До зарплаты: {nextPayout.days === 0 ? 'сегодня' : `${nextPayout.days} ${plural(nextPayout.days, ['день', 'дня', 'дней'])}`} ({nextPayout.date} · {nextPayout.profileName})
              </p>
            )}
            {familySummary.forecast > 0 && familySummary.earnedSoFar < familySummary.forecast && (
              <p className="text-[11px] text-mute">
                Отклонение: {money(familySummary.forecast - familySummary.earnedSoFar)} осталось заработать
              </p>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => quick.open('salary_hours')}>
            <Clock size={13} /> Быстрый ввод часов
          </Button>
        </div>
      </div>
    </Panel>
  );
}
