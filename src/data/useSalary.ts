import { useEffect, useMemo } from 'react';
import { useAuth } from './auth';
import { useDeleteRow, useRows, useSaveRow } from './hooks';
import {
  calcAutoMonth,
  DEFAULT_AUTO_PROFILE,
  DEFAULT_MANUAL_PROFILE,
  entriesOfMonth,
  manualStats,
  sumMoney,
  type AutoMonthSummary,
} from '@/lib/calc/salary';
import { monthKey, todayISOInZone } from '@/lib/dates';
import type { SalaryProfile } from '@/types/salary';

/** Salary math is pinned to the user's home timezone (Yekaterinburg), not UTC. */
export function salaryToday(): string {
  return todayISOInZone();
}

export function useSalaryProfiles() {
  const { user } = useAuth();
  const profilesQuery = useRows('salary_profiles');
  const saveProfile = useSaveRow('salary_profiles');
  const deleteProfile = useDeleteRow('salary_profiles');

  // First run: create the two default contexts («Заяц» + «Зайчик» for the girl).
  useEffect(() => {
    if (!profilesQuery.isLoading && profilesQuery.rows.length === 0 && user) {
      void (async () => {
        try {
          await saveProfile.mutateAsync(DEFAULT_AUTO_PROFILE as unknown as Partial<SalaryProfile>);
          await saveProfile.mutateAsync(DEFAULT_MANUAL_PROFILE as unknown as Partial<SalaryProfile>);
        } catch (e) {
          console.error('Failed to seed default salary profiles', e);
        }
      })();
    }
  }, [profilesQuery.isLoading, profilesQuery.rows.length, user, saveProfile]);

  const profiles = profilesQuery.rows;
  return {
    profiles,
    autoProfiles: profiles.filter(p => p.active && p.mode === 'automatic'),
    isLoading: profilesQuery.isLoading,
    error: profilesQuery.error,
    saveProfile,
    deleteProfile,
    refetch: profilesQuery.refetch,
  };
}

export function useSalaryEntries() {
  const entriesQuery = useRows('salary_entries');
  const saveEntry = useSaveRow('salary_entries');
  const deleteEntry = useDeleteRow('salary_entries');
  return {
    entries: entriesQuery.rows,
    isLoading: entriesQuery.isLoading,
    error: entriesQuery.error,
    saveEntry,
    deleteEntry,
  };
}

export interface SalarySummary {
  month: string;
  /** «Заяц»: plan and current progress of all automatic profiles. */
  autoPlan: number;
  autoEarned: number;
  /** «Зайчик»: sum of manual entries of the month (all profiles). */
  manualTotal: number;
  manualCount: number;
  /** Plan + facts: what the household is on track to earn this month. */
  totalForecast: number;
  /** Earned so far: automatic progress + manual facts. */
  totalEarned: number;
}

/**
 * One aggregated salary number for the rest of the app
 * (Dashboard, Goals, Debts, Car Calculator, What-if).
 * Salary is the data source; no duplicate finance operations are created.
 */
export function useSalarySummary(month?: string) {
  const today = salaryToday();
  const m = month ?? monthKey(today);
  const { profiles, autoProfiles, isLoading: profilesLoading, error: profilesError } = useSalaryProfiles();
  const { entries, isLoading: entriesLoading, error: entriesError } = useSalaryEntries();

  const autoSummaries = useMemo(() => {
    const map = new Map<string, AutoMonthSummary>();
    for (const p of autoProfiles) map.set(p.id, calcAutoMonth(p, m, today));
    return map;
  }, [autoProfiles, m, today]);

  const summary = useMemo<SalarySummary>(() => {
    const autoPlan = sumMoney([...autoSummaries.values()].map(s => s.planTotal));
    const autoEarned = sumMoney([...autoSummaries.values()].map(s => s.earnedSoFar));
    const monthEntries = entriesOfMonth(entries, m);
    const manual = manualStats(monthEntries);
    return {
      month: m,
      autoPlan,
      autoEarned,
      manualTotal: manual.total,
      manualCount: manual.count,
      totalForecast: sumMoney([autoPlan, manual.total]),
      totalEarned: sumMoney([autoEarned, manual.total]),
    };
  }, [autoSummaries, entries, m]);

  return {
    today,
    month: m,
    profiles,
    autoProfiles,
    autoSummaries,
    entries,
    summary,
    isLoading: profilesLoading || entriesLoading,
    error: profilesError || entriesError,
  };
}
