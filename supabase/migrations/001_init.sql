-- ============================================================================
-- 001_init.sql — базовая схема FinTrack AI
-- Файл идемпотентный: можно выполнять повторно, ничего не сломается.
-- Выполнять в Supabase → SQL Editor ДО 002_v2.sql.
-- ========================================================================== */

-- ---------- операции ----------
-- Одна строка = одна операция. Запись точечная: upsert по (user_id, client_id),
-- поэтому история никогда не перезаписывается целиком (это была главная
-- ошибка версии 1.0).
create table if not exists finance_operations (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  client_id  text        not null,                 -- id операции на клиенте (в т.ч. «tg-…» от бота)
  type       text        not null check (type in ('income', 'expense')),
  amount     numeric     not null check (amount >= 0),
  category   text        not null default 'Другое',
  note       text        not null default '',
  date       date        not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists idx_finance_operations_user_date
  on finance_operations (user_id, date desc);

-- ---------- профиль: всё, кроме операций, в одной строке JSONB ----------
create table if not exists finance_profiles (
  user_id     uuid        primary key references auth.users (id) on delete cascade,
  budgets     jsonb       not null default '{}'::jsonb,   -- месячные лимиты {категория: сумма}
  goals       jsonb       not null default '[]'::jsonb,
  recurring   jsonb       not null default '[]'::jsonb,
  accounts    jsonb       not null default '[]'::jsonb,
  credits     jsonb       not null default '[]'::jsonb,
  credit_cards jsonb      not null default '[]'::jsonb,
  categories  jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- updated_at трогаем автоматически
create or replace function ft_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ft_profiles_touch on finance_profiles;
create trigger ft_profiles_touch
  before update on finance_profiles
  for each row execute function ft_touch_updated_at();

-- ---------- привязка Telegram ----------
create table if not exists telegram_link_codes (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  code       text        not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_tg_link_codes_code on telegram_link_codes (code);

create table if not exists telegram_accounts (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  telegram_chat_id text not null,
  username        text,
  created_at      timestamptz not null default now()
);
create unique index if not exists idx_tg_accounts_chat on telegram_accounts (telegram_chat_id);

-- ---------- RLS: пользователь видит и меняет только своё ----------
-- Бот и cron-функции работают через service_role, который RLS не подчиняется.
alter table finance_operations  enable row level security;
alter table finance_profiles    enable row level security;
alter table telegram_link_codes enable row level security;
alter table telegram_accounts   enable row level security;

drop policy if exists ops_select_own on finance_operations;
create policy ops_select_own on finance_operations
  for select using (auth.uid() = user_id);
drop policy if exists ops_insert_own on finance_operations;
create policy ops_insert_own on finance_operations
  for insert with check (auth.uid() = user_id);
drop policy if exists ops_update_own on finance_operations;
create policy ops_update_own on finance_operations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists ops_delete_own on finance_operations;
create policy ops_delete_own on finance_operations
  for delete using (auth.uid() = user_id);

drop policy if exists profiles_all_own on finance_profiles;
create policy profiles_all_own on finance_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists codes_all_own on telegram_link_codes;
create policy codes_all_own on telegram_link_codes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists tg_select_own on telegram_accounts;
create policy tg_select_own on telegram_accounts
  for select using (auth.uid() = user_id);
drop policy if exists tg_delete_own on telegram_accounts;
create policy tg_delete_own on telegram_accounts
  for delete using (auth.uid() = user_id);
-- вставлять и менять строки в telegram_accounts может только бот (service_role)
