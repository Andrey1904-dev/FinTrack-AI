-- ============================================================================
-- 002_v2.sql — дополнения версии 2.0+: account_id у операций, rules/settings
-- у профиля, индекс по категориям и view finance_month_summary.
-- Файл идемпотентный. Выполнять ПОСЛЕ 001_init.sql.
-- Со старой схемой (без этих колонок) приложение тоже работает — просто не
-- синхронизирует счёт и правила, поэтому миграцию можно отложить.
-- ========================================================================== */

alter table finance_operations add column if not exists account_id text;
alter table finance_profiles   add column if not exists rules    jsonb;
alter table finance_profiles   add column if not exists settings jsonb;

create index if not exists idx_finance_operations_user_category
  on finance_operations (user_id, category);

-- ---------- сводка за месяц (читается отчётами и ботом) ----------
-- security_invoker: view соблюдает RLS вызывающего, чужие строки не видны.
drop view if exists finance_month_summary;
create view finance_month_summary
  with (security_invoker = true) as
select
  user_id,
  to_char(date, 'YYYY-MM') as month,
  coalesce(sum(amount) filter (where type = 'income'),  0) as income,
  coalesce(sum(amount) filter (where type = 'expense'), 0) as expense,
  count(*) filter (where type = 'income')                  as income_count,
  count(*) filter (where type = 'expense')                 as expense_count
from finance_operations
group by user_id, to_char(date, 'YYYY-MM');

-- ---------- realtime: сайт видит операции бота без перезагрузки ----------
-- Если публикация supabase_realtime ещё не создана (не на всех проектах есть),
-- просто пропускаем: без realtime всё работает с задержкой до минуты.
do $$
begin
  alter publication supabase_realtime add table finance_operations;
exception
  when duplicate_object then null;   -- уже добавлена
  when undefined_object then null;   -- публикация не существует
end $$;

do $$
begin
  alter publication supabase_realtime add table finance_profiles;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
