import type { Base } from '../types';

/**
 * Salary works in two independent modes:
 *   «Заяц»   (`automatic`) — payroll is computed from the settings below and
 *                            the Russian 5/2 production calendar;
 *   «Зайчик» (`manual`)    — the user simply records how much a shift earned
 *                            (one row in `salary_entries` per shift).
 */
export type SalaryMode = 'automatic' | 'manual';

export interface SalaryProfileSettings {
  /** ₽/hour after probation (automatic mode). */
  hourly_rate?: number;
  /** ₽/hour during probation (automatic mode). */
  probation_rate?: number;
  /** Day of month the advance is paid (projection for Cash Flow). */
  advance_day?: number;
  /** Day of the next month the remaining salary is paid. */
  salary_day?: number;
  [key: string]: unknown;
}

export interface SalaryProfile extends Base {
  name: string;
  mode: SalaryMode;
  /** Work schedule; automatic mode supports the 5/2 production calendar. */
  schedule_type: '5/2' | '2/2' | 'custom';
  hours_per_day: number;
  start_date: string;
  /** Last day of probation (inclusive); null — no probation. */
  probation_end_date: string | null;
  active: boolean;
  settings: SalaryProfileSettings;
}

/** One manually recorded shift: date + how much it earned. */
export interface SalaryEntry extends Base {
  salary_profile_id: string;
  date: string;
  amount: number;
  note: string;
}
