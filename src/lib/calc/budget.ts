import { monthKey } from '../dates';
import { round2 } from '../format';
import type { DebtPayment, MonthlyBudgetPlan, Operation } from '@/types';

export interface MonthlyBudgetActuals {
  income: number;
  mandatoryExpenses: number;
  debtPayments: number;
  savings: number;
}

/** Summarizes one calendar month without double-counting debt payments linked to ledger operations. */
export function calcMonthlyBudgetActuals(operations: Operation[], payments: DebtPayment[], month: string): MonthlyBudgetActuals {
  const monthlyPayments = payments.filter(payment => monthKey(payment.paid_at) === month);
  const linkedDebtOperations = new Set(monthlyPayments.map(payment => payment.operation_id).filter((id): id is string => !!id));
  const totals: MonthlyBudgetActuals = { income: 0, mandatoryExpenses: 0, debtPayments: 0, savings: 0 };

  for (const operation of operations) {
    if (monthKey(operation.date) !== month) continue;
    const amount = Number.isFinite(operation.amount) ? Math.max(0, operation.amount) : 0;
    if (operation.type === 'income') totals.income += amount;
    else if (linkedDebtOperations.has(operation.id)) continue;
    else if (operation.category === 'Кредиты') totals.debtPayments += amount;
    else if (operation.category === 'Накопления') totals.savings += amount;
    else totals.mandatoryExpenses += amount;
  }

  totals.debtPayments += monthlyPayments.reduce((sum, payment) => sum + (Number.isFinite(payment.amount) ? Math.max(0, payment.amount) : 0), 0);
  return {
    income: round2(totals.income),
    mandatoryExpenses: round2(totals.mandatoryExpenses),
    debtPayments: round2(totals.debtPayments),
    savings: round2(totals.savings),
  };
}

export interface MonthlyBudgetLine {
  key: keyof MonthlyBudgetPlan;
  label: string;
  planned: number;
  actual: number;
  remaining: number;
  completion: number | null;
  kind: 'income' | 'expense' | 'saving';
}

const safe = (value: number | undefined): number => (Number.isFinite(value) ? Math.max(0, value ?? 0) : 0);
const actualValue = (value: number): number => (Number.isFinite(value) ? value : 0);

/** Plan-versus-actual calculation. Callers supply month-scoped ledger totals. */
export function calcMonthlyBudget(plan: MonthlyBudgetPlan, actuals: MonthlyBudgetActuals): MonthlyBudgetLine[] {
  const input: Array<{ key: keyof MonthlyBudgetPlan; label: string; planned: number; actual: number; kind: MonthlyBudgetLine['kind'] }> = [
    { key: 'expected_income', label: 'Доход', planned: safe(plan.expected_income), actual: safe(actuals.income), kind: 'income' },
    { key: 'mandatory_expenses', label: 'Расходы без долгов и накоплений', planned: safe(plan.mandatory_expenses), actual: safe(actuals.mandatoryExpenses), kind: 'expense' },
    { key: 'debt_payment', label: 'Платежи по долгам', planned: safe(plan.debt_payment), actual: safe(actuals.debtPayments), kind: 'expense' },
    { key: 'savings_target', label: 'Накопления', planned: safe(plan.savings_target), actual: actualValue(actuals.savings), kind: 'saving' },
  ];

  return input.map(row => ({
    ...row,
    remaining: round2(row.planned - row.actual),
    completion: row.planned > 0 ? round2((row.actual / row.planned) * 100) : null,
  }));
}
