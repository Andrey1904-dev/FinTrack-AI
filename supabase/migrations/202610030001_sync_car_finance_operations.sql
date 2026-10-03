-- Keep the shared finance ledger in sync when a linked vehicle record changes.
-- The trigger runs in the same PostgreSQL transaction as the car-log write, so
-- a failed ledger update aborts the entire mutation rather than leaving a split row.

create or replace function public.sync_car_finance_operation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(14,2);
  v_category text;
  v_note text;
begin
  if new.operation_id is null then
    return new;
  end if;

  if tg_table_name = 'car_refuels' then
    v_amount := new.total;
    v_category := 'Топливо';
    v_note := case when length(trim(new.station)) > 0 then 'Заправка · ' || trim(new.station) else 'Заправка' end;
  elsif tg_table_name = 'car_service' then
    v_amount := new.total;
    v_category := 'Автомобиль';
    v_note := 'Обслуживание: ' || trim(new.title);
  elsif tg_table_name = 'car_expenses' then
    v_amount := new.amount;
    v_category := 'Автомобиль';
    v_note := trim(new.category) || case when length(trim(new.title)) > 0 then ': ' || trim(new.title) else '' end;
  else
    raise exception 'Unsupported car log table: %', tg_table_name using errcode = '22023';
  end if;

  update public.finance_operations
     set type = 'expense', amount = v_amount, category = v_category, note = v_note, date = new.date
   where id = new.operation_id and user_id = new.user_id;

  if not found then
    -- RLS hides operations owned by another account. Reject a broken or
    -- cross-user link rather than silently storing it on a vehicle row.
    raise exception 'Linked finance operation is missing or not owned by this user' using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_car_finance_operation() from public, anon;
grant execute on function public.sync_car_finance_operation() to authenticated, service_role;

drop trigger if exists car_refuels_sync_finance_operation on public.car_refuels;
create trigger car_refuels_sync_finance_operation
after insert or update on public.car_refuels
for each row execute function public.sync_car_finance_operation();

drop trigger if exists car_expenses_sync_finance_operation on public.car_expenses;
create trigger car_expenses_sync_finance_operation
after insert or update on public.car_expenses
for each row execute function public.sync_car_finance_operation();

drop trigger if exists car_service_sync_finance_operation on public.car_service;
create trigger car_service_sync_finance_operation
after insert or update on public.car_service
for each row execute function public.sync_car_finance_operation();
