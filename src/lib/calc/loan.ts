import { round2 } from '../format';

/** Monthly annuity payment. Rate is annual percent. */
export function annuityPayment(principal: number, annualRatePct: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - Math.pow(1 + r, -months)));
}

export interface LoanSummary {
  principal: number;
  payment: number;
  totalPaid: number;
  overpayment: number;
}

export function loanSummary(principal: number, annualRatePct: number, months: number): LoanSummary {
  const payment = annuityPayment(principal, annualRatePct, months);
  const totalPaid = round2(payment * months);
  return { principal, payment, totalPaid, overpayment: round2(Math.max(0, totalPaid - principal)) };
}
