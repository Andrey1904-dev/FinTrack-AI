-- ============================================================
-- Salary Module Migration for FinTrack-AI / Personal OS
-- Integrates multi-profile salary management (Mine 5/2, Girl's 2/2 my-pay, side jobs)
-- ============================================================

-- ---------- salary_profiles ----------
create table if not exists public.salary_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  schedule_type text not null check (schedule_type in ('5/2', '2/2', 'custom')),
  payment_type text not null default 'hourly' check (payment_type in ('hourly', 'piecework', 'fixed', 'mixed')),
  hours_per_day numeric not null default 8,
  start_date date not null default current_date,
  probation_end_date date,
  active boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- salary_rates ----------
create table if not exists public.salary_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salary_profile_id uuid not null references public.salary_profiles(id) on delete cascade,
  rate numeric not null,
  rate_type text not null default 'hourly' check (rate_type in ('hourly', 'fixed_shift', 'piece')),
  valid_from date not null,
  valid_to date,
  is_probation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- salary_work_days ----------
create table if not exists public.salary_work_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salary_profile_id uuid not null references public.salary_profiles(id) on delete cascade,
  date date not null,
  planned_hours numeric not null default 8,
  actual_hours numeric not null default 8,
  status text not null default 'planned' check (status in ('planned', 'worked', 'skipped', 'day_off', 'sick', 'vacation', 'other')),
  rate numeric not null default 0,
  earned_amount numeric not null default 0,
  cases integer default 0,
  is_holiday boolean default false,
  bonus numeric default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(salary_profile_id, date)
);

-- ---------- salary_payments ----------
create table if not exists public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salary_profile_id uuid not null references public.salary_profiles(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  expected_amount numeric not null default 0,
  actual_amount numeric not null default 0,
  payment_date date not null,
  status text not null default 'expected' check (status in ('expected', 'paid', 'cancelled')),
  operation_id uuid references public.finance_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- salary_goals ----------
create table if not exists public.salary_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salary_profile_id uuid not null references public.salary_profiles(id) on delete cascade,
  month text not null, -- YYYY-MM
  target_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(salary_profile_id, month)
);

-- RLS
alter table public.salary_profiles enable row level security;
alter table public.salary_rates enable row level security;
alter table public.salary_work_days enable row level security;
alter table public.salary_payments enable row level security;
alter table public.salary_goals enable row level security;

create policy "salary_profiles_own" on public.salary_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "salary_rates_own" on public.salary_rates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "salary_work_days_own" on public.salary_work_days for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "salary_payments_own" on public.salary_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "salary_goals_own" on public.salary_goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- touch_updated_at triggers
drop trigger if exists salary_profiles_updated_at on public.salary_profiles;
create trigger salary_profiles_updated_at before update on public.salary_profiles for each row execute function public.set_updated_at();

drop trigger if exists salary_rates_updated_at on public.salary_rates;
create trigger salary_rates_updated_at before update on public.salary_rates for each row execute function public.set_updated_at();

drop trigger if exists salary_work_days_updated_at on public.salary_work_days;
create trigger salary_work_days_updated_at before update on public.salary_work_days for each row execute function public.set_updated_at();

drop trigger if exists salary_payments_updated_at on public.salary_payments;
create trigger salary_payments_updated_at before update on public.salary_payments for each row execute function public.set_updated_at();

drop trigger if exists salary_goals_updated_at on public.salary_goals;
create trigger salary_goals_updated_at before update on public.salary_goals for each row execute function public.set_updated_at();
