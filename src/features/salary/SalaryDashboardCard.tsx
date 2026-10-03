import { Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelLink } from '@/components/ui/misc';
import { useSalaryData } from '@/data/useSalary';
import { useQuick } from '@/features/forms/QuickProvider';
import { daysBetween, todayISO } from '@/lib/dates';
import { money } from '@/lib/format';

export function SalaryDashboardCard() {
  const quick = useQuick();
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const { profiles, profileSummaries, familySummary } = useSalaryData(currentMonth);

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
          <div>
            <span className="silk block text-mute">Прогноз дохода семьи на месяц:</span>
            <span className="tnum text-[18px] font-semibold text-txt">{money(familySummary.forecast)}</span>
          </div>

          <Button variant="outline" size="sm" onClick={() => quick.open('salary_hours')}>
            <Clock size={13} /> Быстрый ввод часов
          </Button>
        </div>
      </div>
    </Panel>
  );
}
