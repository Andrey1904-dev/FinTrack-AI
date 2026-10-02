import { useMemo } from 'react';
import { CAR_EXPENSE_CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/constants';
import { useFinanceProfile, useRows } from './hooks';

/** Default categories first, then anything already used (including categories created through the Telegram bot). */
export function useCategoryOptions(type: 'income' | 'expense'): string[] {
  const { rows } = useRows('finance_operations');
  const { financeProfile } = useFinanceProfile();
  return useMemo(() => {
    const base = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const fromProfile = financeProfile?.categories?.[type] ?? [];
    const used = new Map<string, number>();
    for (const o of rows) if (o.type === type) used.set(o.category, (used.get(o.category) ?? 0) + 1);
    const extra = [...used.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
    return [...new Set([...base, ...fromProfile, ...extra])];
  }, [rows, financeProfile, type]);
}

export function carCategoryOptions(): string[] {
  return CAR_EXPENSE_CATEGORIES;
}
