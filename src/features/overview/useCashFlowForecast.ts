import { useMemo } from 'react';
import { useProfile, useRows } from '@/data/hooks';
import { buildCashFlowForecast, type CashFlowResult } from '@/lib/calc';
import { addDaysISO, todayISO } from '@/lib/dates';

/** Loads the inputs for the cash forecast while keeping the starting balance user-supplied. */
export function useCashFlowForecast(horizonDays: number) {
  const today = todayISO();
  const { profile, isLoading: profileLoading, error: profileError, save, refetch: refetchProfile } = useProfile();
  const recurring = useRows('recurring_payments');
  const debts = useRows('debts');
  const goals = useRows('financial_goals');
  const cars = useRows('cars');
  const carHistory = { from: addDaysISO(today, -364), to: today };
  const refuels = useRows('car_refuels', carHistory);
  const carExpenses = useRows('car_expenses', carHistory);
  const carService = useRows('car_service', carHistory);
  const queries = [recurring, debts, goals, cars, refuels, carExpenses, carService];
  const settings = profile?.settings ?? {};
  const configured = typeof settings.current_balance === 'number' && Number.isFinite(settings.current_balance);

  const forecast = useMemo<CashFlowResult>(() => buildCashFlowForecast({
    currentBalance: configured ? settings.current_balance! : 0,
    minimumSafeBalance: settings.minimum_safe_balance ?? null,
    recurring: recurring.rows,
    debts: debts.rows,
    goals: goals.rows,
    cars: cars.rows,
    refuels: refuels.rows,
    carExpenses: carExpenses.rows,
    carService: carService.rows,
    horizonDays,
    today,
  }), [
    configured,
    settings.current_balance,
    settings.minimum_safe_balance,
    recurring.rows,
    debts.rows,
    goals.rows,
    cars.rows,
    refuels.rows,
    carExpenses.rows,
    carService.rows,
    horizonDays,
    today,
  ]);

  return {
    forecast,
    configured,
    profile,
    settings,
    saveProfile: save,
    loading: profileLoading || queries.some(query => query.isLoading),
    error: profileError ?? queries.find(query => query.error)?.error ?? null,
    refetch: () => Promise.all([...queries.map(query => query.refetch()), refetchProfile()]),
  };
}
