-- Personal OS schema.
--
-- ADDITIVE migration: nothing existing is dropped, renamed or rewritten.
--   * finance_operations stays the single ledger for income and expenses
--     (the Telegram bot reads/writes it). It only gets two new columns.
--   * debts, recurring_payments and financial_goals are the new source of truth
--     for the web app. Existing finance_profiles.credits / credit_cards /
--     recurring / goals are IMPORTED once (a raw copy is kept in
--     legacy_profile_backup) and are then kept up to date by triggers, so the
--     Telegram bot (/credits, /upcoming, /goals, reminders) keeps working
--     without any change to the Edge Functions.
--   * finance_profiles.budgets is still used for budget limits.
--
-- Safe to run on a clean project (after the two earlier migrations) and on a
-- project that already contains data from the previous FinTrack app.

------------------------------------------------------------------------------
-- 0. Helpers
------------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 1. finance_operations: additive columns only
------------------------------------------------------------------------------
alter table public.finance_operations
  add column if not exists updated_at timestamptz not null default now();
alter table public.finance_operations
  add column if not exists recurrence text not null default 'none';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'finance_operations_recurrence_check') then
    alter table public.finance_operations
      add constraint finance_operations_recurrence_check
      check (recurrence in ('none', 'weekly', 'monthly', 'yearly'));
  end if;
end;
$$;

-- lets the browser insert ledger rows without sending user_id (RLS still enforces ownership)
alter table public.finance_operations alter column user_id set default auth.uid();

drop trigger if exists finance_operations_set_updated_at on public.finance_operations;
create trigger finance_operations_set_updated_at
  before update on public.finance_operations
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------------
-- 2. New tables
------------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null default '',
  dashboard_config jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  category text not null default 'Другое',
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'yearly')),
  day_of_month smallint check (day_of_month between 1 and 31),
  next_date date not null,
  active boolean not null default true,
  comment text not null default '',
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'loan' check (kind in ('loan', 'card', 'other')),
  name text not null check (length(trim(name)) > 0),
  organization text not null default '',
  original_amount numeric(14,2) not null default 0 check (original_amount >= 0),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  interest_rate numeric(6,2) not null default 0 check (interest_rate >= 0),
  min_payment numeric(14,2) not null default 0 check (min_payment >= 0),
  next_payment_date date,
  status text not null default 'active' check (status in ('active', 'closed')),
  credit_limit numeric(14,2) not null default 0 check (credit_limit >= 0),
  comment text not null default '',
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0),
  paid_at date not null default current_date,
  comment text not null default '',
  balance_after numeric(14,2),
  advanced boolean not null default false,
  operation_id uuid references public.finance_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  year integer check (year between 1900 and 2100),
  engine text not null default '',
  mileage integer not null default 0 check (mileage >= 0),
  fuel_type text not null default 'АИ-95',
  is_current boolean not null default false,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists cars_one_current_idx on public.cars(user_id) where is_current;

create table if not exists public.car_refuels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  date date not null default current_date,
  mileage integer not null default 0 check (mileage >= 0),
  liters numeric(8,2) not null check (liters > 0),
  price_per_liter numeric(8,2) not null default 0 check (price_per_liter >= 0),
  total numeric(14,2) not null check (total >= 0),
  station text not null default '',
  fuel_type text not null default '',
  full_tank boolean not null default true,
  operation_id uuid references public.finance_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.car_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  date date not null default current_date,
  mileage integer not null default 0 check (mileage >= 0),
  category text not null default 'Другое',
  title text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  comment text not null default '',
  operation_id uuid references public.finance_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.car_service (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  date date not null default current_date,
  mileage integer not null default 0 check (mileage >= 0),
  title text not null check (length(trim(title)) > 0),
  parts_cost numeric(14,2) not null default 0 check (parts_cost >= 0),
  labor_cost numeric(14,2) not null default 0 check (labor_cost >= 0),
  items jsonb not null default '[]'::jsonb,
  total numeric(14,2) not null default 0 check (total >= 0),
  comment text not null default '',
  operation_id uuid references public.finance_operations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.car_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  car_id uuid not null references public.cars(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'mileage' check (kind in ('mileage', 'date')),
  interval_km integer check (interval_km > 0),
  due_mileage integer check (due_mileage >= 0),
  due_date date,
  status text not null default 'active' check (status in ('active', 'done')),
  last_done_at date,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.car_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  kind text not null default 'car' check (kind in ('car', 'whatif')),
  params jsonb not null default '{}'::jsonb,
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  category text not null default 'Финансы',
  target_amount numeric(14,2) not null default 0 check (target_amount >= 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  deadline date,
  comment text not null default '',
  status text not null default 'active' check (status in ('active', 'done')),
  legacy_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_id)
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  category text not null default 'today' check (category in ('today', 'work', 'car', 'finance', 'learning', 'personal')),
  due_date date,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  status text not null default 'todo' check (status in ('todo', 'done')),
  note text not null default '',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  comment text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  track_id uuid not null references public.learning_tracks(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  done boolean not null default false,
  position integer not null default 0,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  tags text[] not null default '{}',
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  command text not null check (length(trim(command)) > 0),
  description text not null default '',
  category text not null default 'Linux',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dedupe_key text not null,
  kind text not null default 'info',
  severity text not null default 'info' check (severity in ('info', 'warning', 'danger', 'success')),
  title text not null,
  body text not null default '',
  link text not null default '',
  due_date date,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

-- Raw copy of the pre-Personal-OS profile JSON (service-role only).
create table if not exists public.legacy_profile_backup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.legacy_profile_backup enable row level security;
revoke all on public.legacy_profile_backup from anon, authenticated;
grant all on public.legacy_profile_backup to service_role;

------------------------------------------------------------------------------
-- 3. Indexes, updated_at triggers, Row Level Security
------------------------------------------------------------------------------
create index if not exists recurring_payments_user_idx on public.recurring_payments(user_id, next_date);
create index if not exists debts_user_idx on public.debts(user_id, status);
create index if not exists debt_payments_debt_idx on public.debt_payments(debt_id, paid_at);
create index if not exists cars_user_idx on public.cars(user_id);
create index if not exists car_refuels_car_idx on public.car_refuels(car_id, date desc);
create index if not exists car_expenses_car_idx on public.car_expenses(car_id, date desc);
create index if not exists car_service_car_idx on public.car_service(car_id, date desc);
create index if not exists car_reminders_car_idx on public.car_reminders(car_id);
create index if not exists car_scenarios_user_idx on public.car_scenarios(user_id);
create index if not exists financial_goals_user_idx on public.financial_goals(user_id);
create index if not exists tasks_user_idx on public.tasks(user_id, status, due_date);
create index if not exists learning_tracks_user_idx on public.learning_tracks(user_id);
create index if not exists learning_topics_track_idx on public.learning_topics(track_id, position);
create index if not exists notes_user_idx on public.notes(user_id, pinned, updated_at desc);
create index if not exists commands_user_idx on public.commands(user_id, category);
create index if not exists notifications_user_idx on public.notifications(user_id, read, created_at desc);

do $$
declare
  t text;
  -- child table -> (parent table, fk column): a user may only attach rows to their own parent
  parents jsonb := '{
    "car_refuels":["cars","car_id"], "car_expenses":["cars","car_id"],
    "car_service":["cars","car_id"], "car_reminders":["cars","car_id"],
    "debt_payments":["debts","debt_id"], "learning_topics":["learning_tracks","track_id"]
  }';
  parent_check text;
begin
  foreach t in array array[
    'profiles','recurring_payments','debts','debt_payments','cars','car_refuels','car_expenses',
    'car_service','car_reminders','car_scenarios','financial_goals','tasks','learning_tracks',
    'learning_topics','notes','commands','notifications'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
                   t || '_set_updated_at', t);

    parent_check := '';
    if parents ? t then
      parent_check := format(' and exists (select 1 from public.%I p where p.id = %I and p.user_id = (select auth.uid()))',
                             parents->t->>0, parents->t->>1);
    end if;

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
                   t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid())%s)',
                   t || '_insert_own', t, parent_check);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid())%s)',
                   t || '_update_own', t, parent_check);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
                   t || '_delete_own', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

------------------------------------------------------------------------------
-- 4. Atomic helpers used by the web app (SECURITY INVOKER: RLS applies)
------------------------------------------------------------------------------
create or replace function public.record_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_date date default current_date,
  p_comment text default '',
  p_principal numeric default null,
  p_create_expense boolean default true,
  p_advance boolean default false
) returns public.debt_payments
language plpgsql security invoker set search_path = '' as $$
declare
  v_debt public.debts%rowtype;
  v_principal numeric(14,2);
  v_balance numeric(14,2);
  v_op uuid;
  v_payment public.debt_payments%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Сумма платежа должна быть больше нуля';
  end if;
  select * into v_debt from public.debts where id = p_debt_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Долг не найден';
  end if;
  v_principal := least(coalesce(p_principal, p_amount), p_amount, v_debt.balance);
  v_balance := greatest(0, v_debt.balance - v_principal);

  if p_create_expense then
    insert into public.finance_operations(user_id, client_id, type, amount, category, note, date)
    values (auth.uid(), 'os-' || gen_random_uuid()::text, 'expense', p_amount, 'Кредиты',
            left('Платёж: ' || v_debt.name || case when coalesce(p_comment, '') <> '' then ' — ' || p_comment else '' end, 300),
            coalesce(p_date, current_date))
    returning id into v_op;
  end if;

  insert into public.debt_payments(user_id, debt_id, amount, principal_amount, paid_at, comment, balance_after, advanced, operation_id)
  values (auth.uid(), p_debt_id, p_amount, v_principal, coalesce(p_date, current_date), coalesce(p_comment, ''),
          v_balance, p_advance and v_debt.next_payment_date is not null, v_op)
  returning * into v_payment;

  update public.debts set
    balance = v_balance,
    status = case when v_balance <= 0 then 'closed' else status end,
    next_payment_date = case when p_advance and next_payment_date is not null
                             then (next_payment_date + interval '1 month')::date else next_payment_date end
  where id = p_debt_id;

  return v_payment;
end;
$$;

create or replace function public.delete_debt_payment(p_payment_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_payment public.debt_payments%rowtype;
begin
  select * into v_payment from public.debt_payments where id = p_payment_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Платёж не найден';
  end if;
  update public.debts set
    balance = balance + v_payment.principal_amount,
    status = 'active',
    next_payment_date = case when v_payment.advanced and next_payment_date is not null
                             then (next_payment_date - interval '1 month')::date else next_payment_date end
  where id = v_payment.debt_id and user_id = auth.uid();
  delete from public.debt_payments where id = p_payment_id;
  if v_payment.operation_id is not null then
    delete from public.finance_operations where id = v_payment.operation_id and user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.set_current_car(p_car_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.cars set is_current = false where user_id = auth.uid() and is_current and id <> p_car_id;
  update public.cars set is_current = true where user_id = auth.uid() and id = p_car_id;
end;
$$;

revoke all on function public.record_debt_payment(uuid, numeric, date, text, numeric, boolean, boolean) from public, anon;
revoke all on function public.delete_debt_payment(uuid) from public, anon;
revoke all on function public.set_current_car(uuid) from public, anon;
grant execute on function public.record_debt_payment(uuid, numeric, date, text, numeric, boolean, boolean) to authenticated, service_role;
grant execute on function public.delete_debt_payment(uuid) to authenticated, service_role;
grant execute on function public.set_current_car(uuid) to authenticated, service_role;

------------------------------------------------------------------------------
-- 5. Keep the Telegram bot in sync: project debts / recurring / goals into the
--    legacy finance_profiles JSON columns the Edge Functions read.
------------------------------------------------------------------------------
create or replace function public.sync_legacy_profile(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_credits jsonb;
  v_cards jsonb;
  v_recurring jsonb;
  v_goals jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id::text,
      'bank', coalesce(nullif(d.organization, ''), d.name),
      'purpose', case when nullif(d.organization, '') is not null then d.name else '' end,
      'principal', d.original_amount,
      'rate', d.interest_rate,
      'monthlyPayment', d.min_payment,
      'paymentDate', d.next_payment_date,
      'paid', false,
      'schedule', jsonb_build_array(jsonb_build_object(
        'n', 1, 'date', d.next_payment_date, 'amount', d.min_payment, 'interest', 0,
        'principal', d.balance, 'rest', 0, 'paid', false, 'paidAt', null, 'operationId', null))
    ) order by d.created_at), '[]'::jsonb)
    into v_credits
    from public.debts d
   where d.user_id = p_user_id and d.status = 'active' and d.kind <> 'card' and d.balance > 0;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id::text,
      'bank', coalesce(nullif(d.organization, ''), d.name),
      'name', d.name,
      'limit', d.credit_limit,
      'used', d.balance,
      'rate', d.interest_rate,
      'minPaymentPercent', case when d.balance > 0 then round(d.min_payment / d.balance * 100, 2) else 0 end,
      'paymentDate', d.next_payment_date,
      'statementDate', d.next_payment_date,
      'status', 'active'
    ) order by d.created_at), '[]'::jsonb)
    into v_cards
    from public.debts d
   where d.user_id = p_user_id and d.status = 'active' and d.kind = 'card';

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id::text, 'name', r.title, 'amount', r.amount, 'period', r.frequency,
      'next', r.next_date, 'category', r.category, 'type', r.kind
    ) order by r.next_date), '[]'::jsonb)
    into v_recurring
    from public.recurring_payments r
   where r.user_id = p_user_id and r.active;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id::text, 'name', g.title, 'target', g.target_amount, 'saved', g.current_amount,
      'date', g.deadline
    ) order by g.created_at), '[]'::jsonb)
    into v_goals
    from public.financial_goals g
   where g.user_id = p_user_id;

  insert into public.finance_profiles(user_id, credits, credit_cards, recurring, goals, updated_at)
  values (p_user_id, v_credits, v_cards, v_recurring, v_goals, now())
  on conflict (user_id) do update set
    credits = excluded.credits,
    credit_cards = excluded.credit_cards,
    recurring = excluded.recurring,
    goals = excluded.goals,
    updated_at = now();
end;
$$;
revoke all on function public.sync_legacy_profile(uuid) from public, anon, authenticated;
grant execute on function public.sync_legacy_profile(uuid) to service_role;

create or replace function public.trg_sync_legacy_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_legacy_profile(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;
revoke all on function public.trg_sync_legacy_profile() from public, anon, authenticated;

------------------------------------------------------------------------------
-- 6. One-time, idempotent import of data created by the previous app
------------------------------------------------------------------------------
create or replace function public._os_num(v jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or jsonb_typeof(v) not in ('number', 'string') then return 0; end if;
  return coalesce((v #>> '{}')::numeric, 0);
exception when others then
  return 0;
end;
$$;

create or replace function public._os_date(v text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if v is null or length(v) < 10 then return null; end if;
  return left(v, 10)::date;
exception when others then
  return null;
end;
$$;

-- Only profiles that have never been backed up are imported. After the first
-- run the projection (section 5) rewrites those JSON columns, so importing
-- them again would create duplicates.
drop table if exists pg_temp._os_import_users;
create temporary table _os_import_users as
select fp.user_id
  from public.finance_profiles fp
  join auth.users u on u.id = fp.user_id
 where not exists (select 1 from public.legacy_profile_backup b where b.user_id = fp.user_id);

insert into public.legacy_profile_backup(user_id, data)
select fp.user_id, to_jsonb(fp) - 'user_id'
  from public.finance_profiles fp
 where fp.user_id in (select user_id from _os_import_users)
on conflict (user_id) do nothing;

-- Loans
insert into public.debts(user_id, kind, name, organization, original_amount, balance, interest_rate,
                         min_payment, next_payment_date, status, legacy_id)
select fp.user_id, 'loan',
       left(coalesce(nullif(c->>'purpose', ''), nullif(c->>'bank', ''), 'Кредит'), 120),
       left(coalesce(c->>'bank', ''), 120),
       greatest(0, public._os_num(c->'principal')),
       greatest(0, coalesce(nx.remaining, 0)),
       greatest(0, public._os_num(c->'rate')),
       greatest(0, coalesce(nx.amount, public._os_num(c->'monthlyPayment'))),
       coalesce(nx.date, public._os_date(c->>'paymentDate')),
       case when nx.remaining is null then 'closed' else 'active' end,
       coalesce(nullif(c->>'id', ''), md5(c::text))
  from public.finance_profiles fp
  join _os_import_users iu on iu.user_id = fp.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(fp.credits) = 'array' then fp.credits else '[]'::jsonb end) c
  left join lateral (
    select public._os_num(s->'rest') + public._os_num(s->'principal') as remaining,
           public._os_num(s->'amount') as amount,
           public._os_date(s->>'date') as date
      from jsonb_array_elements(case when jsonb_typeof(c->'schedule') = 'array' then c->'schedule' else '[]'::jsonb end)
           with ordinality t(s, i)
     where coalesce(s->>'paid', 'false') <> 'true'
     order by i limit 1
  ) nx on true
on conflict (user_id, legacy_id) do nothing;

-- Repayment history of imported loans (paid schedule rows)
insert into public.debt_payments(user_id, debt_id, amount, principal_amount, paid_at, comment, balance_after)
select d.user_id, d.id,
       public._os_num(s->'amount'),
       public._os_num(s->'principal'),
       coalesce(public._os_date(s->>'paidAt'), public._os_date(s->>'date'), current_date),
       'Импорт из прежней версии',
       public._os_num(s->'rest')
  from public.finance_profiles fp
  join _os_import_users iu on iu.user_id = fp.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(fp.credits) = 'array' then fp.credits else '[]'::jsonb end) c
  join public.debts d on d.user_id = fp.user_id and d.legacy_id = coalesce(nullif(c->>'id', ''), md5(c::text))
  cross join lateral jsonb_array_elements(case when jsonb_typeof(c->'schedule') = 'array' then c->'schedule' else '[]'::jsonb end) s
 where coalesce(s->>'paid', 'false') = 'true'
   and public._os_num(s->'amount') > 0
   and not exists (select 1 from public.debt_payments p where p.debt_id = d.id);

-- Credit cards
insert into public.debts(user_id, kind, name, organization, original_amount, balance, interest_rate,
                         min_payment, next_payment_date, status, credit_limit, legacy_id)
select fp.user_id, 'card',
       left(coalesce(nullif(c->>'name', ''), 'Кредитная карта'), 120),
       left(coalesce(c->>'bank', ''), 120),
       greatest(0, public._os_num(c->'used')),
       greatest(0, public._os_num(c->'used')),
       greatest(0, public._os_num(c->'rate')),
       greatest(0, round(public._os_num(c->'used') * public._os_num(c->'minPaymentPercent') / 100, 2)),
       public._os_date(c->>'paymentDate'),
       'active',
       greatest(0, public._os_num(c->'limit')),
       'card:' || coalesce(nullif(c->>'id', ''), md5(c::text))
  from public.finance_profiles fp
  join _os_import_users iu on iu.user_id = fp.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(fp.credit_cards) = 'array' then fp.credit_cards else '[]'::jsonb end) c
on conflict (user_id, legacy_id) do nothing;

-- Recurring payments
insert into public.recurring_payments(user_id, title, amount, kind, category, frequency, day_of_month, next_date, legacy_id)
select fp.user_id,
       left(coalesce(nullif(r->>'name', ''), 'Платёж'), 120),
       greatest(0, public._os_num(r->'amount')),
       case when r->>'type' = 'income' then 'income' else 'expense' end,
       left(coalesce(nullif(r->>'category', ''), 'Другое'), 80),
       case when r->>'period' in ('weekly', 'yearly') then r->>'period' else 'monthly' end,
       extract(day from coalesce(public._os_date(r->>'next'), current_date))::smallint,
       coalesce(public._os_date(r->>'next'), current_date),
       coalesce(nullif(r->>'id', ''), md5(r::text))
  from public.finance_profiles fp
  join _os_import_users iu on iu.user_id = fp.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(fp.recurring) = 'array' then fp.recurring else '[]'::jsonb end) r
on conflict (user_id, legacy_id) do nothing;

-- Goals
insert into public.financial_goals(user_id, title, category, target_amount, current_amount, deadline, status, legacy_id)
select fp.user_id,
       left(coalesce(nullif(g->>'name', ''), 'Цель'), 120),
       'Финансы',
       greatest(0, public._os_num(g->'target')),
       greatest(0, public._os_num(g->'saved')),
       public._os_date(g->>'date'),
       case when public._os_num(g->'target') > 0 and public._os_num(g->'saved') >= public._os_num(g->'target') then 'done' else 'active' end,
       coalesce(nullif(g->>'id', ''), md5(g::text))
  from public.finance_profiles fp
  join _os_import_users iu on iu.user_id = fp.user_id
  cross join lateral jsonb_array_elements(case when jsonb_typeof(fp.goals) = 'array' then fp.goals else '[]'::jsonb end) g
on conflict (user_id, legacy_id) do nothing;

drop function public._os_num(jsonb);
drop function public._os_date(text);

-- Triggers go in only AFTER the import so it cannot rewrite profiles half-way.
drop trigger if exists debts_sync_legacy on public.debts;
create trigger debts_sync_legacy after insert or update or delete on public.debts
  for each row execute function public.trg_sync_legacy_profile();
drop trigger if exists recurring_payments_sync_legacy on public.recurring_payments;
create trigger recurring_payments_sync_legacy after insert or update or delete on public.recurring_payments
  for each row execute function public.trg_sync_legacy_profile();
drop trigger if exists financial_goals_sync_legacy on public.financial_goals;
create trigger financial_goals_sync_legacy after insert or update or delete on public.financial_goals
  for each row execute function public.trg_sync_legacy_profile();

-- Refresh the bot's view for every user that has imported data.
do $$
declare v_user uuid;
begin
  for v_user in
    select user_id from _os_import_users
  loop
    perform public.sync_legacy_profile(v_user);
  end loop;
end;
$$;

drop table if exists pg_temp._os_import_users;

-- Browser cross-device refresh for the new tables where Realtime is available.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['debts', 'recurring_payments', 'financial_goals', 'tasks', 'notifications'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;
