import type { Base } from '../types';

export type SalaryScheduleType = '5/2' | '2/2' | 'custom';
export type SalaryPaymentType = 'hourly' | 'piecework' | 'fixed' | 'mixed';
export type WorkDayStatus = 'planned' | 'worked' | 'skipped' | 'day_off' | 'sick' | 'vacation' | 'other';

export interface SalaryProfile extends Base {
  name: string;
  schedule_type: SalaryScheduleType;
  payment_type: SalaryPaymentType;
  hours_per_day: number;
  start_date: string;
  probation_end_date: string | null;
  active: boolean;
  settings: SalaryProfileSettings;
}

export interface SalaryProfileSettings {
  // Common
  hourly_rate?: number;
  probation_rate?: number;
  holiday_rate_multiplier?: number; // default 1.0
  overtime_rate_multiplier?: number; // default 1.0

  // 2/2 piecework settings (like girl's my-pay job)
  base_pay?: number; // e.g. 2415
  holiday_pay?: number; // e.g. 4600
  case_price?: number; // e.g. 7
  piece_percent?: number; // e.g. 25 (%)
  schedule_start?: string; // 2/2 anchor date
  monthly_goal?: number; // e.g. 60000

  // Payout calendar
  advance_day?: number; // e.g. 23 or 25
  salary_day?: number; // e.g. 8 or 10
  expected_monthly?: number;

  [key: string]: unknown;
}

export interface SalaryRate extends Base {
  salary_profile_id: string;
  rate: number;
  rate_type: 'hourly' | 'fixed_shift' | 'piece';
  valid_from: string;
  valid_to: string | null;
  is_probation: boolean;
}

export interface SalaryWorkDay extends Base {
  salary_profile_id: string;
  date: string;
  planned_hours: number;
  actual_hours: number;
  status: WorkDayStatus;
  rate: number;
  earned_amount: number;
  cases?: number;
  is_holiday?: boolean;
  bonus?: number;
  note: string;
}

export interface SalaryPayment extends Base {
  salary_profile_id: string;
  period_start: string;
  period_end: string;
  expected_amount: number;
  actual_amount: number;
  payment_date: string;
  status: 'expected' | 'paid' | 'cancelled';
  operation_id?: string | null;
}

export interface SalaryGoal extends Base {
  salary_profile_id: string;
  month: string; // YYYY-MM
  target_amount: number;
}
