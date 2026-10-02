import { supabase } from '@/lib/supabase';
import type { TableName } from '@/types';

export const EXPORT_TABLES: TableName[] = [
  'finance_operations', 'recurring_payments', 'debts', 'debt_payments', 'cars', 'car_refuels', 'car_expenses', 'car_service',
  'car_reminders', 'car_scenarios', 'financial_goals', 'tasks', 'learning_tracks', 'learning_topics', 'notes', 'commands',
];
/** Row-owning tables wiped by the "delete everything" action, children first. */
export const WIPE_ORDER: TableName[] = [
  'notifications', 'car_scenarios', 'notes', 'commands', 'tasks', 'financial_goals', 'learning_tracks', 'cars', 'debts',
  'recurring_payments', 'finance_operations',
];

export async function fetchTable(table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function exportEverything(): Promise<Record<string, unknown>> {
  const tables: Record<string, unknown> = {};
  for (const t of EXPORT_TABLES) tables[t] = await fetchTable(t);
  const [profile, finance] = await Promise.all([
    supabase.from('profiles').select('*').maybeSingle(),
    supabase.from('finance_profiles').select('budgets,categories,settings').maybeSingle(),
  ]);
  return {
    app: 'Personal OS', version: 3, exportedAt: new Date().toISOString(),
    profile: profile.data ?? null, financeProfile: finance.data ?? null, tables,
  };
}

export async function wipeAllData(): Promise<void> {
  for (const t of WIPE_ORDER) {
    const { error } = await supabase.from(t).delete().not('id', 'is', null);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
}
