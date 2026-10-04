import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, PanelLink } from '@/components/ui/misc';
import { useSalarySummary } from '@/data/useSalary';
import { useQuick } from '@/features/forms/QuickProvider';
import { money, plural } from '@/lib/format';

/** Small dashboard block: «Заяц» plan/fact + «Зайчик» total. Nothing more. */
export function SalaryDashboardCard() {
  const quick = useQuick();
  const { summary } = useSalarySummary();

  return (
    <Panel label="💰 Зарплата" screw right={<PanelLink to="/salary">Открыть →</PanelLink>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[2px] border border-line bg-panel/60 p-3">
          <p className="text-[12.5px] font-semibold text-txt">🐰 Заяц</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="tnum text-[16px] font-bold text-amber">{money(summary.autoPlan)}</span>
            <span className="silk text-mute">план месяца</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="tnum text-[13px] font-semibold text-cyan">{money(summary.autoEarned)}</span>
            <span className="silk text-mute">заработано</span>
          </div>
        </div>

        <div className="rounded-[2px] border border-line bg-panel/60 p-3">
          <p className="text-[12.5px] font-semibold text-txt">🐰 Зайчик</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="tnum text-[16px] font-bold text-cyan">{money(summary.manualTotal)}</span>
            <span className="silk text-mute">
              {summary.manualCount > 0
                ? `${summary.manualCount} ${plural(summary.manualCount, ['смена', 'смены', 'смен'])}`
                : 'смен пока нет'}
            </span>
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => quick.open('salary_entry')}>
            <Plus size={13} /> Добавить смену
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
        <span className="silk text-mute">Всего за месяц (план + смены):</span>
        <span className="tnum text-[16px] font-semibold text-txt">{money(summary.totalForecast)}</span>
      </div>
    </Panel>
  );
}
