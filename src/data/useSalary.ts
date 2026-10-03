import { useEffect, useMemo } from 'react';
import { useAuth } from './auth';
import { useDeleteRow, useRows, useSaveRow } from './hooks';
import {
  calculateMonthSalary,
  DEFAULT_GIRL_SALARY_PROFILE,
  DEFAULT_MY_SALARY_PROFILE,
  type MonthSalarySummary,
} from '@/lib/calc/salary';
import { todayISO } from '@/lib/dates';
import type { SalaryProfile } from '@/types/salary';

export function useSalaryProfiles() {
  const { user } = useAuth();
  const profilesQuery = useRows('salary_profiles');
  const ratesQuery = useRows('salary_rates');
  const saveProfile = useSaveRow('salary_profiles');
  const deleteProfile = useDeleteRow('salary_profiles');
  const saveRate = useSaveRow('salary_rates');
  const deleteRate = useDeleteRow('salary_rates');

  // Auto-seed default profiles if user has none
  useEffect(() => {
    if (!profilesQuery.isLoading && profilesQuery.rows.length === 0 && user) {
      void (async () => {
        try {
          await saveProfile.mutateAsync(DEFAULT_MY_SALARY_PROFILE as unknown as Partial<SalaryProfile>);
          await saveProfile.mutateAsync(DEFAULT_GIRL_SALARY_PROFILE as unknown as Partial<SalaryProfile>);
        } catch (e) {
          console.error('Failed to auto-seed default salary profiles', e);
        }
      })();
    }
  }, [profilesQuery.isLoading, profilesQuery.rows.length, user]);

  return {
    profiles: profilesQuery.rows,
    rates: ratesQuery.rows,
    isLoading: profilesQuery.isLoading || ratesQuery.isLoading,
    error: profilesQuery.error || ratesQuery.error,
    saveProfile,
    deleteProfile,
    saveRate,
    deleteRate,
    refetch: async () => {
      await Promise.all([profilesQuery.refetch(), ratesQuery.refetch()]);
    },
  };
}

export function useSalaryData(month: string, selectedProfileId?: string) {
  const { profiles, rates, isLoading: profilesLoading, saveProfile, deleteProfile } = useSalaryProfiles();
  const workDaysQuery = useRows('salary_work_days');
  const paymentsQuery = useRows('salary_payments');
  const goalsQuery = useRows('salary_goals');

  const saveWorkDay = useSaveRow('salary_work_days');
  const deleteWorkDay = useDeleteRow('salary_work_days');
  const savePayment = useSaveRow('salary_payments');
  const deletePayment = useDeleteRow('salary_payments');
  const saveGoal = useSaveRow('salary_goals');
  const deleteGoal = useDeleteRow('salary_goals');

  const today = todayISO();

  // Summaries per profile
  const profileSummaries = useMemo(() => {
    const map = new Map<string, MonthSalarySummary>();
    for (const p of profiles) {
      if (!p.active) continue;
      const summary = calculateMonthSalary(p, month, workDaysQuery.rows, rates, today);
      map.set(p.id, summary);
    }
    return map;
  }, [profiles, month, workDaysQuery.rows, rates, today]);

  // Overall family aggregate
  const familySummary = useMemo(() => {
    let earnedSoFar = 0;
    let forecast = 0;
    let expectedPayments = 0;
    let paidPayments = 0;

    let myEarned = 0;
    let myForecast = 0;
    let girlEarned = 0;
    let girlForecast = 0;

    for (const p of profiles) {
      if (!p.active) continue;
      const s = profileSummaries.get(p.id);
      if (!s) continue;
      earnedSoFar += s.totalEarnedSoFar;
      forecast += s.monthTotalForecast;

      const isMe = p.name.toLowerCase().includes('моя') || p.schedule_type === '5/2';
      const isGirl = p.name.toLowerCase().includes('девушк') || p.schedule_type === '2/2';

      if (isMe) {
        myEarned += s.totalEarnedSoFar;
        myForecast += s.monthTotalForecast;
      } else if (isGirl) {
        girlEarned += s.totalEarnedSoFar;
        girlForecast += s.monthTotalForecast;
      }
    }

    const monthPayments = paymentsQuery.rows.filter(pm => pm.payment_date.startsWith(month));
    for (const pm of monthPayments) {
      if (pm.status === 'paid') paidPayments += pm.actual_amount;
      else if (pm.status === 'expected') expectedPayments += pm.expected_amount;
    }

    return {
      earnedSoFar,
      forecast,
      expectedPayments,
      paidPayments,
      remainingExpected: Math.max(0, forecast - paidPayments),
      myEarned,
      myForecast,
      girlEarned,
      girlForecast,
    };
  }, [profiles, profileSummaries, paymentsQuery.rows, month]);

  const activeProfile = profiles.find(p => p.id === selectedProfileId) || profiles[0] || null;
  const activeSummary = activeProfile ? profileSummaries.get(activeProfile.id) : null;

  return {
    profiles,
    rates,
    workDays: workDaysQuery.rows,
    payments: paymentsQuery.rows,
    goals: goalsQuery.rows,
    profileSummaries,
    familySummary,
    activeProfile,
    activeSummary,
    isLoading: profilesLoading || workDaysQuery.isLoading || paymentsQuery.isLoading,
    saveProfile,
    deleteProfile,
    saveWorkDay,
    deleteWorkDay,
    savePayment,
    deletePayment,
    saveGoal,
    deleteGoal,
  };
}
