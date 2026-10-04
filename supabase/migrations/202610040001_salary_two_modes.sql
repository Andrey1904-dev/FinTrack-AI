-- ============================================================
-- Salary module simplification: two independent modes.
--   «Заяц»   — automatic 5/2 payroll forecast (settings live on the profile)
--   «Зайчик» — manual per-shift amounts (salary_entries)
--
-- Replaces the old 5-table schema (profiles, rates, work_days,
-- payments, goals) with just salary_profiles + salary_entries.
-- Idempotent: safe to apply twice.
-- ============================================================

-- ---------- salary_profiles: add the mode ----------
alter table public.salary_profiles
  add column if not exists mode text not null default 'manual';

alter table public.salary_profiles
  drop constraint if exists salary_profiles_mode_check;
alter table public.salary_profiles
  add constraint salary_profiles_mode_check check (mode in ('automatic', 'manual'));

-- Existing hourly 5/2 profiles become the automatic «Заяц» profile,
-- everything else is a manual «Зайчик» context.
update public.salary_profiles
   set mode = 'automatic'
 where schedule_type = '5/2' and payment_type = 'hourly' and mode = 'manual';

-- ---------- salary_entries: one manual shift = one row ----------
create table if not exists public.salary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  salary_profile_id uuid not null references public.salary_profiles(id) on delete cascade,
  date date not null,
  amount numeric not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists salary_entries_profile_date_idx
  on public.salary_entries (salary_profile_id, date);

alter table public.salary_entries enable row level security;

grant select, insert, update, delete on public.salary_entries to authenticated;
grant all on public.salary_entries to service_role;

drop policy if exists "salary_entries_own" on public.salary_entries;
create policy "salary_entries_own" on public.salary_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists salary_entries_updated_at on public.salary_entries;
create trigger salary_entries_updated_at
  before update on public.salary_entries
  for each row execute function public.set_updated_at();

-- ---------- preserve manually recorded shifts ----------
-- Worked days of manual profiles carry real earned amounts entered by hand;
-- they become salary_entries. Automatic profiles are recomputed from settings,
-- so their generated work days are not copied (that would double income).
do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'salary_work_days'
  ) then
    insert into public.salary_entries (user_id, salary_profile_id, date, amount, note, created_at, updated_at)
    select w.user_id, w.salary_profile_id, w.date, w.earned_amount, coalesce(w.note, ''), w.created_at, w.updated_at
      from public.salary_work_days w
      join public.salary_profiles p on p.id = w.salary_profile_id
     where p.mode = 'manual'
       and w.status = 'worked'
       and w.earned_amount > 0;
  end if;
end $$;

-- ---------- drop what the new model no longer needs ----------
drop table if exists public.salary_rates;
drop table if exists public.salary_payments;
drop table if exists public.salary_goals;
drop table if exists public.salary_work_days;
