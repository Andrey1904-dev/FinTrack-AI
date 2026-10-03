// Runs the SQL migrations against an in-process PostgreSQL (PGlite) and checks:
//   * legacy data import + Telegram-compatible projection
//   * Row Level Security isolation between two users
//   * atomic debt payment helpers
//   * the Telegram RPCs still work with the new schema
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../../supabase/migrations/', import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const sql = f => readFileSync(new URL(f, dir), 'utf8');

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid());
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth, public to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to service_role;
`);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id) values ('${A}'), ('${B}')`);

// 1. Schema as it exists in production before Personal OS
for (const f of files.filter(f => f < '202610020001')) await db.exec(sql(f));

// 2. Data created by the previous app
const credits = [{
  id: 'cr_1', bank: 'Сбер', purpose: 'Авто', principal: 300000, rate: 12, termMonths: 3, monthlyPayment: 105000,
  schedule: [
    { n: 1, date: '2026-08-10', amount: 105000, interest: 3000, principal: 102000, rest: 198000, paid: true, paidAt: '2026-08-10T09:00:00Z' },
    { n: 2, date: '2026-09-10', amount: 105000, interest: 2000, principal: 103000, rest: 95000, paid: false },
    { n: 3, date: '2026-10-10', amount: 96000, interest: 1000, principal: 95000, rest: 0, paid: false }
  ]
}];
const cards = [{ id: 'cd_1', bank: 'Т-Банк', name: 'Platinum', limit: 100000, used: 20000, rate: 29.9, minPaymentPercent: 5, paymentDate: '2026-10-20' }];
const recurring = [{ id: 'r_1', name: 'МТС', amount: 700, period: 'monthly', next: '2026-10-05', category: 'Связь', type: 'expense' }];
const goals = [{ id: 'g_1', name: 'Резерв', target: 300000, saved: 50000, date: '2027-01-01' }];
await db.query(
  `insert into public.finance_profiles(user_id, budgets, credits, credit_cards, recurring, goals) values ($1,$2,$3,$4,$5,$6)`,
  [A, { Продукты: 30000 }, JSON.stringify(credits), JSON.stringify(cards), JSON.stringify(recurring), JSON.stringify(goals)]
);
await db.query(`insert into public.finance_operations(user_id, client_id, type, amount, category) values ($1,'tg-old','expense',100,'Кофе')`, [A]);

// 3. Apply Personal OS migration (twice: it must be idempotent)
await db.exec(sql('202610020001_personal_os.sql'));
await db.exec(sql('202610020001_personal_os.sql'));
for (const f of files.filter(f => f > '202610020001')) await db.exec(sql(f));
// Additive trigger migrations must also be safe to reapply.
for (const f of files.filter(f => f > '202610020001')) await db.exec(sql(f));

const q = async (text, params) => (await db.query(text, params)).rows;
const asUser = async (uid, fn) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

// --- import ---
const debts = await q(`select * from public.debts where user_id = $1 order by kind`, [A]);
assert.equal(debts.length, 2, 'loan + card imported exactly once');
const loan = debts.find(d => d.kind === 'loan');
assert.equal(Number(loan.balance), 198000);
assert.equal(Number(loan.original_amount), 300000);
assert.equal(loan.organization, 'Сбер');
assert.equal(String(loan.next_payment_date.toISOString?.().slice(0, 10) ?? loan.next_payment_date), '2026-09-10');
const card = debts.find(d => d.kind === 'card');
assert.equal(Number(card.balance), 20000);
assert.equal(Number(card.credit_limit), 100000);
assert.equal(Number(card.min_payment), 1000);
assert.equal((await q(`select * from public.debt_payments where debt_id = $1`, [loan.id])).length, 1, 'paid schedule row -> history');
assert.equal((await q(`select * from public.recurring_payments where user_id = $1`, [A])).length, 1);
assert.equal((await q(`select * from public.financial_goals where user_id = $1`, [A])).length, 1);
assert.equal((await q(`select * from public.legacy_profile_backup where user_id = $1`, [A])).length, 1);

// --- the Telegram bot keeps seeing the same shapes ---
const [profile] = await q(`select * from public.finance_profiles where user_id = $1`, [A]);
assert.deepEqual(profile.budgets, { Продукты: 30000 }, 'budgets untouched');
const next = profile.credits[0].schedule.find(p => !p.paid);
assert.equal(Number(next.rest) + Number(next.principal), 198000, 'bot remaining debt == balance');
assert.equal(String(next.date).slice(0, 10), '2026-09-10');
assert.equal(profile.credit_cards[0].used, 20000);
assert.equal(Number(profile.credit_cards[0].minPaymentPercent), 5);
assert.equal(profile.recurring[0].name, 'МТС');
assert.equal(profile.goals[0].name, 'Резерв');
assert.equal(profile.goals[0].saved, 50000);
assert.equal((await q(`select count(*)::int c from public.finance_operations where user_id = $1`, [A]))[0].c, 1, 'operations untouched');

// --- RLS ---
await asUser(B, async () => {
  assert.equal((await q(`select * from public.debts`)).length, 0, 'B cannot read A debts');
  assert.equal((await q(`select * from public.finance_operations`)).length, 0);
  await assert.rejects(() => db.query(`insert into public.tasks(user_id, title) values ($1, 'x')`, [A]), /row-level security/);
  await db.query(`insert into public.tasks(title) values ('mine')`); // user_id defaults to auth.uid()
  assert.equal((await q(`select * from public.tasks`)).length, 1);
  await db.query(`update public.debts set balance = 0 where user_id = $1`, [A]);
});
assert.equal(Number((await q(`select balance from public.debts where id = $1`, [loan.id]))[0].balance), 198000, 'B cannot update A debts');
let linkedCarOperationId;
await asUser(A, async () => {
  const [car] = await q(`insert into public.cars(name) values ('Lada') returning id`);
  const [operation] = await q(`insert into public.finance_operations(user_id, client_id, type, amount, category, note, date)
    values ($1, 'car-refuel-linked', 'expense', 1800, 'Другое', 'old', '2026-10-02') returning id`, [A]);
  linkedCarOperationId = operation.id;
  const [refuel] = await q(`insert into public.car_refuels(car_id, date, liters, total, station, operation_id)
    values ($1, '2026-10-02', 30, 1800, 'АЗС Один', $2) returning id`, [car.id, operation.id]);
  let synced = (await q(`select amount, category, note, date from public.finance_operations where id = $1`, [operation.id]))[0];
  assert.equal(Number(synced.amount), 1800);
  assert.equal(synced.category, 'Топливо');
  assert.equal(synced.note, 'Заправка · АЗС Один');

  await db.query(`update public.car_refuels set total = 1900, station = 'АЗС Два', date = '2026-10-03' where id = $1`, [refuel.id]);
  synced = (await q(`select amount, category, note, date from public.finance_operations where id = $1`, [operation.id]))[0];
  assert.equal(Number(synced.amount), 1900, 'editing a refuel updates the shared ledger');
  assert.equal(synced.note, 'Заправка · АЗС Два');
  assert.equal(String(synced.date.toISOString?.().slice(0, 10) ?? synced.date), '2026-10-03');
  await assert.rejects(() => db.query(`update public.car_refuels set total = -1 where id = $1`, [refuel.id]), /check constraint/);
  assert.equal(Number((await q(`select amount from public.finance_operations where id = $1`, [operation.id]))[0].amount), 1900,
    'a rejected car-log write leaves the ledger unchanged');
  await db.query(`delete from public.car_refuels where id = $1`, [refuel.id]);
  assert.equal((await q(`select * from public.finance_operations where id = $1`, [operation.id])).length, 1,
    'deleting a car-only record preserves the independent finance history');

  const [expenseOp] = await q(`insert into public.finance_operations(user_id, client_id, type, amount, category, date)
    values ($1, 'car-expense-linked', 'expense', 1, 'Другое', '2026-10-02') returning id`, [A]);
  await db.query(`insert into public.car_expenses(car_id, date, category, title, amount, operation_id)
    values ($1, '2026-10-02', 'Мойка', 'Экспресс', 500, $2)`, [car.id, expenseOp.id]);
  const syncedExpense = (await q(`select amount, category, note from public.finance_operations where id = $1`, [expenseOp.id]))[0];
  assert.equal(Number(syncedExpense.amount), 500);
  assert.equal(syncedExpense.category, 'Автомобиль');
  assert.equal(syncedExpense.note, 'Мойка: Экспресс');

  const [serviceOp] = await q(`insert into public.finance_operations(user_id, client_id, type, amount, category, date)
    values ($1, 'car-service-linked', 'expense', 1, 'Другое', '2026-10-02') returning id`, [A]);
  await db.query(`insert into public.car_service(car_id, date, title, total, operation_id)
    values ($1, '2026-10-02', 'Замена масла', 2500, $2)`, [car.id, serviceOp.id]);
  const syncedService = (await q(`select amount, category, note from public.finance_operations where id = $1`, [serviceOp.id]))[0];
  assert.equal(Number(syncedService.amount), 2500);
  assert.equal(syncedService.category, 'Автомобиль');
  assert.equal(syncedService.note, 'Обслуживание: Замена масла');

  assert.equal((await q(`select * from public.tasks`)).length, 0, 'A cannot read B tasks');
});
await asUser(B, async () => {
  const [carA] = await q(`select id from public.cars`);
  assert.equal(carA, undefined);
});
const carA = (await q(`select id from public.cars where user_id = $1`, [A]))[0].id;
await asUser(B, async () => {
  const [carB] = await q(`insert into public.cars(name) values ('B car') returning id`);
  await assert.rejects(() => db.query(`insert into public.car_refuels(car_id, liters, total, operation_id)
    values ($1, 1, 1, $2)`, [carB.id, linkedCarOperationId]), /Linked finance operation is missing or not owned by this user/,
    'B cannot link a vehicle record to A finance operation');
  await assert.rejects(() => db.query(`insert into public.car_refuels(car_id, liters, total) values ($1, 1, 1)`, [carA]), /row-level security/, 'B cannot attach rows to A car');
});
await asUser(A, async () => {
  await db.query(`select public.set_current_car($1)`, [carA]);
  assert.equal((await q(`select is_current from public.cars where id = $1`, [carA]))[0].is_current, true);
});

// --- debt payments ---
await asUser(A, async () => {
  const [p] = await q(`select * from public.record_debt_payment($1, 50000, '2026-10-02', 'тест', 40000, true, true)`, [loan.id]);
  assert.equal(Number(p.balance_after), 158000);
  const [d] = await q(`select balance, next_payment_date from public.debts where id = $1`, [loan.id]);
  assert.equal(Number(d.balance), 158000);
  assert.equal(String(d.next_payment_date.toISOString().slice(0, 10)), '2026-10-10');
  const ops = await q(`select * from public.finance_operations where category = 'Кредиты'`);
  assert.equal(ops.length, 1);
  assert.equal(Number(ops[0].amount), 50000);
  await assert.rejects(() => db.query(`select public.record_debt_payment($1, 0)`, [loan.id]), /больше нуля/);
  await db.query(`select public.delete_debt_payment($1)`, [p.id]);
  const [d2] = await q(`select balance, next_payment_date from public.debts where id = $1`, [loan.id]);
  assert.equal(Number(d2.balance), 198000);
  assert.equal(String(d2.next_payment_date.toISOString().slice(0, 10)), '2026-09-10');
  assert.equal((await q(`select * from public.finance_operations where category = 'Кредиты'`)).length, 0);
});
// the projection followed the change
const [after] = await q(`select credits from public.finance_profiles where user_id = $1`, [A]);
assert.equal(Number(after.credits[0].schedule[0].principal), 198000);

// closing a debt removes it from the bot's credits list
await asUser(A, async () => {
  await db.query(`select public.record_debt_payment($1, 198000, current_date, '', null, false, false)`, [loan.id]);
});
assert.equal((await q(`select credits from public.finance_profiles where user_id = $1`, [A]))[0].credits.length, 0);

// --- Telegram RPCs still work and mirror into the ledger ---
await db.query(`insert into public.telegram_pending_operations(token, user_id, telegram_chat_id, draft, expires_at)
  values ('tok1', $1, '777', $2, now() + interval '1 hour')`,
  [A, JSON.stringify({ type: 'expense', amount: 250, category: 'Кофе', note: 'кофе', date: '2026-10-02' })]);
const fin = await q(`select public.finalize_telegram_operation('tok1', '777') r`);
assert.equal(Number(fin[0].r.amount), 250);
const [op] = await q(`select * from public.finance_operations where client_id = 'tg-tok1'`);
assert.equal(op.recurrence, 'none');
assert.ok(op.updated_at);

console.log('db migration tests passed');
await db.close();
