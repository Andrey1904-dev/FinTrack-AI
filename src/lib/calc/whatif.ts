import { round2 } from '../format';
import type { WhatIfParams } from '@/types';
import { simulatePayoff } from './debt';
import { annuityPayment } from './loan';

export const defaultWhatIf: WhatIfParams = {
  income: 0,
  livingExpenses: 0,
  debtTotal: 0,
  debtPayment: 0,
  debtRate: 0,
  extraDebtPayment: 0,
  savings: 0,
  carPrice: 0,
  downPayment: 0,
  termMonths: 60,
  ratePct: 0,
  carRunningMonthly: 0,
  missedWorkDays: 0,
  workHoursPerDay: 0,
  hourlyRateOverride: 0,
  girlIncomeDelta: 0,
};

export interface WhatIfResult {
  carLoan: number;
  carLoanPayment: number;
  monthlyObligations: number;
  freeBefore: number;
  freeAfter: number;
  /** share of income going to debt and loan payments, 0..1 */
  obligationShare: number;
  savingsAfterDown: number;
  debtMonths: number | null;
  debtInterest: number;
  debtAfter12: number;
  effectiveIncome: number;
  salaryAdjustment: number;
}

export function calcWhatIf(p: WhatIfParams): WhatIfResult {
  let salaryAdjustment = 0;
  // If user simulated missed days (at e.g. 8h * 497 = 3976 per day)
  if (p.missedWorkDays && p.missedWorkDays > 0) {
    const rate = p.hourlyRateOverride && p.hourlyRateOverride > 0 ? p.hourlyRateOverride : 497;
    const hours = p.workHoursPerDay && p.workHoursPerDay > 0 ? p.workHoursPerDay : 8;
    salaryAdjustment -= p.missedWorkDays * hours * rate;
  }
  // If user changed work hours per day for a standard month (assume 21 work days)
  if (p.workHoursPerDay && p.workHoursPerDay > 0 && p.workHoursPerDay !== 8) {
    const rate = p.hourlyRateOverride && p.hourlyRateOverride > 0 ? p.hourlyRateOverride : 497;
    salaryAdjustment += 21 * (p.workHoursPerDay - 8) * rate;
  }
  // If rate changed (e.g. from 497 to 550)
  if (p.hourlyRateOverride && p.hourlyRateOverride > 0 && p.hourlyRateOverride !== 497) {
    const hours = p.workHoursPerDay && p.workHoursPerDay > 0 ? p.workHoursPerDay : 8;
    salaryAdjustment += 21 * hours * (p.hourlyRateOverride - 497);
  }
  // Girl income delta (e.g. girl earned -10 000)
  if (p.girlIncomeDelta) {
    salaryAdjustment += p.girlIncomeDelta;
  }

  const effectiveIncome = Math.max(0, round2(p.income + salaryAdjustment));
  const carLoan = Math.max(0, p.carPrice - p.downPayment);
  const carLoanPayment = carLoan > 0 && p.termMonths > 0 ? annuityPayment(carLoan, p.ratePct, p.termMonths) : 0;
  const debtSim = simulatePayoff(
    p.debtTotal > 0 ? [{ balance: p.debtTotal, interest_rate: p.debtRate, min_payment: p.debtPayment }] : [],
    p.extraDebtPayment,
  );
  const debtOutlay = p.debtTotal > 0 ? p.debtPayment + p.extraDebtPayment : 0;
  const freeBefore = round2(effectiveIncome - p.livingExpenses - debtOutlay);
  const monthlyObligations = round2(debtOutlay + carLoanPayment);
  const freeAfter = round2(effectiveIncome - p.livingExpenses - monthlyObligations - (p.carPrice > 0 ? p.carRunningMonthly : 0));
  return {
    carLoan: round2(carLoan),
    carLoanPayment,
    monthlyObligations,
    freeBefore,
    freeAfter,
    obligationShare: effectiveIncome > 0 ? monthlyObligations / effectiveIncome : 0,
    savingsAfterDown: round2(p.savings - (p.carPrice > 0 ? p.downPayment : 0)),
    debtMonths: debtSim.months,
    debtInterest: debtSim.totalInterest,
    debtAfter12: debtSim.series[Math.min(12, debtSim.series.length - 1)] ?? 0,
    effectiveIncome,
    salaryAdjustment: round2(salaryAdjustment),
  };
}
