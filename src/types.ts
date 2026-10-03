// Row types of the Supabase tables used by the app.

export interface Base {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/** Ledger row shared with the Telegram bot: income and expenses live here. */
export interface Operation {
  id: string;
  user_id: string;
  client_id: string;
  type: 'income' | 'expense';
  amount: number;
  category: string;
  note: string;
  date: string;
  recurrence: 'none' | 'weekly' | 'monthly' | 'yearly';
  created_at: string;
  updated_at: string;
}

export type Frequency = 'weekly' | 'monthly' | 'yearly';

export interface RecurringPayment extends Base {
  title: string;
  amount: number;
  kind: 'expense' | 'income';
  category: string;
  frequency: Frequency;
  day_of_month: number | null;
  next_date: string;
  active: boolean;
  comment: string;
}

export interface Debt extends Base {
  kind: 'loan' | 'card' | 'other';
  name: string;
  organization: string;
  original_amount: number;
  balance: number;
  interest_rate: number;
  min_payment: number;
  next_payment_date: string | null;
  status: 'active' | 'closed';
  credit_limit: number;
  comment: string;
}

export interface DebtPayment extends Base {
  debt_id: string;
  amount: number;
  principal_amount: number;
  paid_at: string;
  comment: string;
  balance_after: number | null;
  advanced: boolean;
  operation_id: string | null;
}

export interface Car extends Base {
  name: string;
  year: number | null;
  engine: string;
  mileage: number;
  fuel_type: string;
  is_current: boolean;
  comment: string;
}

export interface CarRefuel extends Base {
  car_id: string;
  date: string;
  mileage: number;
  liters: number;
  price_per_liter: number;
  total: number;
  station: string;
  fuel_type: string;
  full_tank: boolean;
  operation_id: string | null;
}

export interface CarExpense extends Base {
  car_id: string;
  date: string;
  mileage: number;
  category: string;
  title: string;
  amount: number;
  comment: string;
  operation_id: string | null;
}

export interface ServiceItem {
  name: string;
  amount: number;
  kind: 'part' | 'labor';
}

export interface CarService extends Base {
  car_id: string;
  date: string;
  mileage: number;
  title: string;
  parts_cost: number;
  labor_cost: number;
  items: ServiceItem[];
  total: number;
  comment: string;
  operation_id: string | null;
}

export interface CarReminder extends Base {
  car_id: string;
  title: string;
  kind: 'mileage' | 'date';
  interval_km: number | null;
  due_mileage: number | null;
  due_date: string | null;
  status: 'active' | 'done';
  last_done_at: string | null;
  comment: string;
}

export type CarScenarioParams = {
  price: number;
  downPayment: number;
  termMonths: number;
  ratePct: number;
  consumption: number;
  monthlyKm: number;
  fuelPrice: number;
  maintenanceMonthly: number;
  insuranceYearly: number;
  taxYearly: number;
  repairReserveMonthly: number;
};

export type WhatIfParams = {
  income: number;
  livingExpenses: number;
  debtTotal: number;
  debtPayment: number;
  debtRate: number;
  extraDebtPayment: number;
  savings: number;
  carPrice: number;
  downPayment: number;
  termMonths: number;
  ratePct: number;
  carRunningMonthly: number;
};

export interface Scenario<P = Record<string, number>> extends Base {
  name: string;
  kind: 'car' | 'whatif';
  params: P;
  comment: string;
}

export interface Goal extends Base {
  title: string;
  category: string;
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  comment: string;
  status: 'active' | 'done';
}

export type TaskCategory = 'today' | 'work' | 'car' | 'finance' | 'learning' | 'personal';

export interface Task extends Base {
  title: string;
  category: TaskCategory;
  due_date: string | null;
  priority: 'low' | 'medium' | 'high';
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  status: 'todo' | 'done';
  note: string;
  completed_at: string | null;
}

export interface LearningTrack extends Base {
  title: string;
  comment: string;
  position: number;
}

export interface LearningTopic extends Base {
  track_id: string;
  title: string;
  done: boolean;
  position: number;
  done_at: string | null;
}

export interface Note extends Base {
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
}

export interface CommandRow extends Base {
  command: string;
  description: string;
  category: string;
}

export interface AppNotification extends Base {
  dedupe_key: string;
  kind: string;
  severity: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  body: string;
  link: string;
  due_date: string | null;
  read: boolean;
}

export interface DashboardConfig {
  order?: string[];
  hidden?: string[];
}

export interface MonthlyBudgetPlan {
  expected_income: number;
  mandatory_expenses: number;
  debt_payment: number;
  savings_target: number;
}

export interface ProfileSettings extends Record<string, unknown> {
  /** User-entered total spendable balance across cash and accounts, not bank-synced. */
  current_balance?: number;
  minimum_safe_balance?: number;
  monthly_budgets?: Record<string, MonthlyBudgetPlan>;
}

export interface Profile {
  user_id: string;
  display_name: string;
  dashboard_config: DashboardConfig;
  settings: ProfileSettings;
  created_at: string;
  updated_at: string;
}

export interface FinanceProfile {
  user_id: string;
  budgets: Record<string, number>;
  categories: { expense?: string[]; income?: string[] };
}

export type TableName =
  | 'finance_operations'
  | 'recurring_payments'
  | 'debts'
  | 'debt_payments'
  | 'cars'
  | 'car_refuels'
  | 'car_expenses'
  | 'car_service'
  | 'car_reminders'
  | 'car_scenarios'
  | 'financial_goals'
  | 'tasks'
  | 'learning_tracks'
  | 'learning_topics'
  | 'notes'
  | 'commands'
  | 'notifications';

export interface TableMap {
  finance_operations: Operation;
  recurring_payments: RecurringPayment;
  debts: Debt;
  debt_payments: DebtPayment;
  cars: Car;
  car_refuels: CarRefuel;
  car_expenses: CarExpense;
  car_service: CarService;
  car_reminders: CarReminder;
  car_scenarios: Scenario;
  financial_goals: Goal;
  tasks: Task;
  learning_tracks: LearningTrack;
  learning_topics: LearningTopic;
  notes: Note;
  commands: CommandRow;
  notifications: AppNotification;
}
