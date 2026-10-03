import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/form';
import { PageHeader, PageSkeleton, Tabs } from '@/components/ui/misc';
import { useToast } from '@/components/ui/toast';
import { useSalaryData } from '@/data/useSalary';
import { useSaveRow } from '@/data/hooks';
import { codeFor } from '@/features/layout/nav';
import { useQuick } from '@/features/forms/QuickProvider';
import { shiftMonthKey, todayISO } from '@/lib/dates';
import { fmtMonth, money } from '@/lib/format';
import type { SalaryPayment } from '@/types/salary';

import { SalaryOverviewTab } from './SalaryOverviewTab';
import { SalaryCalendarTab } from './SalaryCalendarTab';
import { SalaryStatisticsTab } from './SalaryStatisticsTab';
import { SalaryForecastTab } from './SalaryForecastTab';
import { SalarySettingsTab } from './SalarySettingsTab';

export default function SalaryPage() {
  const toast = useToast();
  const quick = useQuick();
  const today = todayISO();
  const [currentMonth, setCurrentMonth] = useState(() => today.slice(0, 7));
  const [tab, setTab] = useState<'overview' | 'calendar' | 'stats' | 'forecast' | 'settings'>('overview');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');

  const {
    profiles,
    rates,
    workDays,
    payments,
    profileSummaries,
    familySummary,
    isLoading,
    saveWorkDay,
    savePayment,
    saveProfile,
    deleteProfile,
  } = useSalaryData(currentMonth, selectedProfileId);

  const saveOperation = useSaveRow('finance_operations');

  // Confirmation dialog for salary payout -> creates finance operation without duplication
  const [payoutToConfirm, setPayoutToConfirm] = useState<SalaryPayment | null>(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutCategory, setPayoutCategory] = useState('Зарплата');
  const [confirming, setConfirming] = useState(false);

  const handleOpenPayout = (pm: SalaryPayment) => {
    setPayoutToConfirm(pm);
    setPayoutAmount(String(pm.expected_amount || 0));
  };

  const handleConfirmPayout = async () => {
    if (!payoutToConfirm) return;
    setConfirming(true);
    try {
      const amt = parseFloat(payoutAmount) || payoutToConfirm.expected_amount;
      const profile = profiles.find(p => p.id === payoutToConfirm.salary_profile_id);
      const note = `Зарплата (${profile?.name ?? ''})`;

      // 1. Create finance operation in ledger
      const op = await saveOperation.mutateAsync({
        type: 'income',
        amount: amt,
        category: payoutCategory,
        note,
        date: payoutToConfirm.payment_date,
        recurrence: 'none',
      });

      // 2. Mark salary payment as paid and link to operation
      await savePayment.mutateAsync({
        id: payoutToConfirm.id,
        salary_profile_id: payoutToConfirm.salary_profile_id,
        period_start: payoutToConfirm.period_start,
        period_end: payoutToConfirm.period_end,
        expected_amount: payoutToConfirm.expected_amount,
        actual_amount: amt,
        payment_date: payoutToConfirm.payment_date,
        status: 'paid',
        operation_id: op.id,
      });

      toast.success(`Зарплата ${money(amt)} подтверждена и внесена в Финансы!`);
      setPayoutToConfirm(null);
    } catch (err) {
      console.error(err);
      toast.error('Не удалось подтвердить получение выплаты');
    } finally {
      setConfirming(false);
    }
  };

  if (isLoading && profiles.length === 0) return <PageSkeleton />;

  const tabs = [
    { value: 'overview', label: 'Обзор' },
    { value: 'calendar', label: 'Календарь' },
    { value: 'stats', label: 'Статистика' },
    { value: 'forecast', label: 'Прогноз' },
    { value: 'settings', label: 'Настройки' },
  ];

  const currentProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Зарплата"
        code={codeFor('/salary')}
        subtitle="Моя зарплата (5/2, 442/497 ₽/ч), зарплата девушки (2/2) и общий прогноз доходов семьи"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Month Switcher */}
            <div className="flex items-center gap-1 rounded-[2px] border border-line bg-panel px-2 py-1">
              <button
                type="button"
                className="p-1 text-mute hover:text-txt"
                onClick={() => setCurrentMonth(prev => shiftMonthKey(prev, -1))}
                aria-label="Предыдущий месяц"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="tnum px-1 text-[12.5px] font-medium text-txt">{fmtMonth(currentMonth)}</span>
              <button
                type="button"
                className="p-1 text-mute hover:text-txt"
                onClick={() => setCurrentMonth(prev => shiftMonthKey(prev, 1))}
                aria-label="Следующий месяц"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <Button variant="primary" onClick={() => quick.open('salary_hours')}>
              <Clock size={15} /> Внести часы
            </Button>
          </div>
        }
      />

      {/* Profile switcher strip when not in overview */}
      {tab !== 'overview' && tab !== 'settings' && profiles.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <span className="silk mr-1 text-mute">Источник дохода:</span>
          {profiles.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProfileId(p.id)}
              className={`rounded-[2px] border px-3 py-1 text-[12px] transition-colors ${
                currentProfile?.id === p.id
                  ? 'border-amber bg-amber/15 text-amber'
                  : 'border-line bg-panel text-dim hover:border-engrave hover:text-txt'
              }`}
            >
              {p.name} ({p.schedule_type})
            </button>
          ))}
        </div>
      )}

      <Tabs tabs={tabs} value={tab} onChange={k => setTab(k as typeof tab)} />

      {tab === 'overview' && (
        <SalaryOverviewTab
          month={currentMonth}
          profiles={profiles}
          profileSummaries={profileSummaries}
          familySummary={familySummary}
          payments={payments}
          onSelectProfile={id => {
            setSelectedProfileId(id);
            setTab('calendar');
          }}
          onOpenSettings={() => setTab('settings')}
          onConfirmPayout={handleOpenPayout}
        />
      )}

      {tab === 'calendar' && currentProfile && (
        <SalaryCalendarTab
          month={currentMonth}
          profile={currentProfile}
          summary={profileSummaries.get(currentProfile.id) || null}
          workDays={workDays}
          rates={rates}
          onSaveWorkDay={data => saveWorkDay.mutateAsync(data)}
        />
      )}

      {tab === 'stats' && currentProfile && (
        <SalaryStatisticsTab
          month={currentMonth}
          profile={currentProfile}
          summary={profileSummaries.get(currentProfile.id) || null}
          workDays={workDays}
          rates={rates}
        />
      )}

      {tab === 'forecast' && currentProfile && (
        <SalaryForecastTab
          month={currentMonth}
          profile={currentProfile}
          summary={profileSummaries.get(currentProfile.id) || null}
          workDays={workDays}
          rates={rates}
        />
      )}

      {tab === 'settings' && (
        <SalarySettingsTab
          profiles={profiles}
          onSaveProfile={p => saveProfile.mutateAsync(p)}
          onDeleteProfile={id => deleteProfile.mutateAsync(id)}
        />
      )}

      {/* Payout confirmation modal */}
      {payoutToConfirm && (
        <Modal
          open={!!payoutToConfirm}
          onOpenChange={open => !open && setPayoutToConfirm(null)}
          title="Подтверждение выплаты зарплаты"
          description="Фактически полученная сумма будет автоматически добавлена в модуль Финансы как доход"
        >
          <div className="space-y-4">
            <Field label="Фактическая сумма, ₽">
              {id => (
                <Input
                  id={id}
                  type="number"
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  placeholder="0"
                />
              )}
            </Field>

            <Field label="Категория дохода">
              {id => (
                <Select id={id} value={payoutCategory} onChange={e => setPayoutCategory(e.target.value)}>
                  <option value="Зарплата">Зарплата</option>
                  <option value="Премия">Премия</option>
                  <option value="Подработка">Подработка</option>
                  <option value="Другое">Другое</option>
                </Select>
              )}
            </Field>

            <p className="silk text-mute">
              Дата начисления: {payoutToConfirm.payment_date} · Профиль:{' '}
              {profiles.find(p => p.id === payoutToConfirm.salary_profile_id)?.name ?? 'Зарплата'}
            </p>

            <div className="mt-4 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void handleConfirmPayout()} disabled={confirming}>
                Подтвердить получение
              </Button>
              <Button variant="outline" onClick={() => setPayoutToConfirm(null)}>
                Отмена
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
