import { CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, Readout, Stat } from '@/components/ui/misc';
import { useQuick } from '@/features/forms/QuickProvider';
import { money } from '@/lib/format';
import type { MonthSalarySummary } from '@/lib/calc/salary';
import type { SalaryPayment, SalaryProfile } from '@/types/salary';

interface Props {
  month: string;
  profiles: SalaryProfile[];
  profileSummaries: Map<string, MonthSalarySummary>;
  familySummary: {
    earnedSoFar: number;
    forecast: number;
    expectedPayments: number;
    paidPayments: number;
    remainingExpected: number;
    myEarned: number;
    myForecast: number;
    girlEarned: number;
    girlForecast: number;
  };
  payments: SalaryPayment[];
  onSelectProfile: (id: string) => void;
  onOpenSettings?: () => void;
  onConfirmPayout: (payment: SalaryPayment) => void;
}

export function SalaryOverviewTab({
  month,
  profiles,
  profileSummaries,
  familySummary,
  payments,
  onSelectProfile,
  onConfirmPayout,
}: Props) {
  const quick = useQuick();
  const monthPayments = payments.filter(p => p.payment_date.startsWith(month));

  return (
    <div className="space-y-6">
      {/* -------------------- Main Aggregate Cards -------------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Panel label="Заработано сейчас" screw>
          <div className="flex items-baseline justify-between gap-2">
            <Readout value={familySummary.earnedSoFar} tone="cyan" size="xl" />
          </div>
          <p className="silk mt-2 text-mute">фактически начислено за отработанные дни</p>
        </Panel>

        <Panel label="Прогноз на месяц" screw>
          <div className="flex items-baseline justify-between gap-2">
            <Readout value={familySummary.forecast} tone="amber" size="xl" />
          </div>
          <p className="silk mt-2 text-mute">факт + оставшиеся смены по графику</p>
        </Panel>

        <Panel label="Выплачено / Ожидается" screw className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <Readout value={familySummary.paidPayments} tone="txt" size="xl" />
          </div>
          <p className="silk mt-2 text-mute">
            осталось выплатить: <span className="font-semibold text-amber">{money(familySummary.remainingExpected)}</span>
          </p>
        </Panel>
      </div>

      {/* ---------------- Individual Profiles Breakdown ---------------- */}
      <div className="grid gap-4 md:grid-cols-2">
        {profiles.map(p => {
          const s = profileSummaries.get(p.id);
          const isHourly = p.payment_type === 'hourly';
          return (
            <Panel
              key={p.id}
              label={p.name}
              screw
              right={
                <Button variant="ghost" size="sm" onClick={() => onSelectProfile(p.id)}>
                  Подробнее →
                </Button>
              }
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-line pb-2.5">
                  <span className="text-[12px] text-mute">График и тип:</span>
                  <span className="text-[12.5px] font-medium text-txt">
                    {p.schedule_type} · {isHourly ? 'Почасовая' : 'Сдельная'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Заработано" value={money(s?.totalEarnedSoFar ?? 0)} tone="good" />
                  <Stat label="Прогноз" value={money(s?.monthTotalForecast ?? 0)} tone="accent" />
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-line/60 pt-2 text-[11.5px]">
                  <div>
                    <span className="text-mute">Отработано: </span>
                    <span className="text-dim">
                      {s?.workedDaysCount ?? 0} {isHourly ? `смен (${s?.workedHours ?? 0} ч)` : 'смен'}
                    </span>
                  </div>
                  <div>
                    <span className="text-mute">Осталось: </span>
                    <span className="text-dim">
                      {s?.remainingWorkDaysCount ?? 0} {isHourly ? `смен (${s?.plannedRemainingHours ?? 0} ч)` : 'смен'}
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-[11.5px]"
                    onClick={() => quick.open('salary_hours')}
                  >
                    <Clock size={13} /> Быстрый ввод часов
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[11.5px]"
                    onClick={() => onSelectProfile(p.id)}
                  >
                    Календарь
                  </Button>
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {/* ---------------- Upcoming Payouts / Confirmation ---------------- */}
      <Panel
        label="Выплаты зарплаты (Expected / Paid)"
        screw
        right={
          <span className="silk text-mute">Интеграция с финансами без дублей</span>
        }
      >
        {monthPayments.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-[12.5px] text-mute">
              Нет запланированных или проведённых выплат в этом месяце.
            </p>
            <p className="silk mt-1 text-mute">
              Выплаты автоматически прогнозируются на дни зарплаты (аванс 23-25, получка 8-10).
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line/70">
            {monthPayments.map(pm => {
              const profile = profiles.find(p => p.id === pm.salary_profile_id);
              const isPaid = pm.status === 'paid';
              return (
                <div key={pm.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-txt">
                        {profile?.name ?? 'Зарплата'}
                      </span>
                      <span
                        className={`rounded-[2px] px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                          isPaid ? 'bg-cyan/15 text-cyan' : 'bg-amber/15 text-amber'
                        }`}
                      >
                        {isPaid ? 'Получено' : 'Ожидается'}
                      </span>
                    </div>
                    <p className="silk mt-1 text-mute">
                      Дата: {pm.payment_date} · Период: {pm.period_start} – {pm.period_end}
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-[14px] font-semibold text-txt">
                        {money(isPaid ? pm.actual_amount : pm.expected_amount)}
                      </div>
                      {pm.operation_id && (
                        <p className="silk text-cyan">проведено в Финансы</p>
                      )}
                    </div>

                    {!isPaid && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onConfirmPayout(pm)}
                      >
                        <CheckCircle2 size={14} /> Подтвердить получение
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
