import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from './auth';
import type { DashboardConfig, FinanceProfile, Profile, TableMap, TableName } from '@/types';

const PAGE = 1000;
const ORDER: Partial<Record<TableName, { column: string; ascending: boolean }>> = {
  finance_operations: { column: 'date', ascending: false },
  car_refuels: { column: 'date', ascending: false },
  car_expenses: { column: 'date', ascending: false },
  car_service: { column: 'date', ascending: false },
  debt_payments: { column: 'paid_at', ascending: false },
  learning_topics: { column: 'position', ascending: true },
  learning_tracks: { column: 'position', ascending: true },
  salary_entries: { column: 'date', ascending: false },
};
const DATE_COLUMN: Partial<Record<TableName, string>> = {
  finance_operations: 'date',
  recurring_payments: 'next_date',
  debt_payments: 'paid_at',
  car_refuels: 'date',
  car_expenses: 'date',
  car_service: 'date',
  car_reminders: 'due_date',
  financial_goals: 'deadline',
  tasks: 'due_date',
  notifications: 'due_date',
  salary_entries: 'date',
};

export interface RowWindow {
  /** Inclusive lower date bound. Supported only for tables with a date column. */
  from?: string;
  /** Inclusive upper date bound. Supported only for tables with a date column. */
  to?: string;
  /** Maximum number of newest/ordered rows to fetch. */
  limit?: number;
}

export const rowsKey = (table: TableName, userId: string | undefined) => ['rows', table, userId] as const;

async function fetchAll<K extends TableName>(table: K, window?: RowWindow): Promise<TableMap[K][]> {
  const order = ORDER[table] ?? { column: 'created_at', ascending: false };
  const dateColumn = DATE_COLUMN[table];
  if ((window?.from || window?.to) && !dateColumn) throw new Error(`Date filtering is not supported for ${table}`);
  const limit = window?.limit && window.limit > 0 ? Math.floor(window.limit) : undefined;
  const out: TableMap[K][] = [];
  for (let from = 0; from < 50_000 && (!limit || out.length < limit); from += PAGE) {
    const last = limit ? Math.min(from + PAGE - 1, limit - 1) : from + PAGE - 1;
    let request = supabase.from(table).select('*');
    if (dateColumn && window?.from) request = request.gte(dateColumn, window.from);
    if (dateColumn && window?.to) request = request.lte(dateColumn, window.to);
    const { data, error } = await request
      .order(order.column, { ascending: order.ascending })
      .order('created_at', { ascending: false })
      .range(from, last);
    if (error) throw error;
    out.push(...((data ?? []) as TableMap[K][]));
    if (!data || data.length < Math.min(PAGE, last - from + 1)) break;
  }
  return out;
}

/** All matching rows belong to the signed-in user (RLS enforces ownership server-side). */
export function useRows<K extends TableName>(table: K, window?: RowWindow) {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: [...rowsKey(table, user?.id), window ?? null],
    queryFn: () => fetchAll(table, window),
    enabled: !!user,
    staleTime: 30_000,
  });
  return { ...query, rows: (query.data ?? []) as TableMap[K][] };
}

type Writable<K extends TableName> = Partial<Omit<TableMap[K], 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { id?: string };

export function useSaveRow<K extends TableName>(table: K) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (row: Writable<K>) => {
      if (!user) throw new Error('not authenticated');
      const { id, ...values } = row as Record<string, unknown> & { id?: string };
      if (id) {
        const { data, error } = await supabase.from(table).update(values).eq('id', id).select().single();
        if (error) throw error;
        return data as TableMap[K];
      }
      const { data, error } = await supabase
        .from(table)
        .insert({ ...values, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      return data as TableMap[K];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rows', table] }),
  });
}

export function useDeleteRow(table: TableName) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rows', table] }),
  });
}

/** Invalidate several tables at once (after multi-table operations). */
export function useInvalidate() {
  const qc = useQueryClient();
  return (...tables: TableName[]) => Promise.all(tables.map(t => qc.invalidateQueries({ queryKey: ['rows', t] })));
}

/* ------------------------------ profiles ------------------------------ */

export function useProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
      if (error) throw error;
      return (data as Profile | null) ?? null;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<Pick<Profile, 'display_name' | 'dashboard_config' | 'settings'>>) => {
      if (!user) throw new Error('not authenticated');
      const { error } = await supabase.from('profiles').upsert({ user_id: user.id, ...patch }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
  return { profile: query.data ?? null, isLoading: query.isLoading, error: query.error, save, refetch: query.refetch };
}

const DASH_KEY = 'pos.dashboard';
export function readLocalDashboard(): DashboardConfig {
  try {
    return JSON.parse(localStorage.getItem(DASH_KEY) ?? '{}') as DashboardConfig;
  } catch {
    return {};
  }
}
export function writeLocalDashboard(c: DashboardConfig) {
  try {
    localStorage.setItem(DASH_KEY, JSON.stringify(c));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

/** Budgets are shared with the Telegram bot: finance_profiles.budgets (category -> monthly limit). */
export function useFinanceProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['finance_profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('finance_profiles').select('user_id,budgets,categories').maybeSingle();
      if (error) throw error;
      return (data as FinanceProfile | null) ?? null;
    },
  });
  const saveBudgets = useMutation({
    mutationFn: async (budgets: Record<string, number>) => {
      if (!user) throw new Error('not authenticated');
      const { error } = await supabase.from('finance_profiles').upsert({ user_id: user.id, budgets }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['finance_profile'] }),
  });
  return { financeProfile: query.data ?? null, isLoading: query.isLoading, saveBudgets };
}

/** Refresh the ledger when the Telegram bot (or another device) changes it. */
export function useRealtimeSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`os-sync-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_operations', filter: `user_id=eq.${user.id}` }, () =>
        qc.invalidateQueries({ queryKey: ['rows', 'finance_operations'] }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${user.id}` }, () =>
        qc.invalidateQueries({ queryKey: ['rows', 'debts'] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);
}
