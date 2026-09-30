-- Core schema used by the browser app and the Telegram integration.
-- Safe to apply on an empty Supabase project; existing installations should
-- review this migration against their current schema before applying.

create table if not exists public.finance_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14,2) not null check (amount >= 0),
  category text not null default 'Другое',
  note text not null default '',
  date date not null default current_date,
  account_id text,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

create index if not exists finance_operations_user_date_idx
  on public.finance_operations(user_id, date desc);
create index if not exists finance_operations_user_category_date_idx
  on public.finance_operations(user_id, category, date desc);

create table if not exists public.finance_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  budgets jsonb not null default '{}'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  recurring jsonb not null default '[]'::jsonb,
  accounts jsonb not null default '[]'::jsonb,
  credits jsonb not null default '[]'::jsonb,
  credit_cards jsonb not null default '[]'::jsonb,
  categories jsonb not null default '{"expense":[],"income":[]}'::jsonb,
  rules jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.finance_operations enable row level security;
alter table public.finance_profiles enable row level security;

drop policy if exists finance_operations_owner_all on public.finance_operations;
create policy finance_operations_owner_all on public.finance_operations
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists finance_profiles_owner_all on public.finance_profiles;
create policy finance_profiles_owner_all on public.finance_profiles
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.finance_operations to authenticated;
grant select, insert, update, delete on public.finance_profiles to authenticated;
grant all on public.finance_operations to service_role;
grant all on public.finance_profiles to service_role;

-- Enable the browser's cross-device refresh where Supabase Realtime is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_operations'
    ) then
      execute 'alter publication supabase_realtime add table public.finance_operations';
    end if;
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'finance_profiles'
    ) then
      execute 'alter publication supabase_realtime add table public.finance_profiles';
    end if;
  end if;
end;
$$;
