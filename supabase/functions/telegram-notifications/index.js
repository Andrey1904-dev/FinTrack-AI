import { adminClient, jsonResponse } from '../_shared/supabase.js';
import { constantTimeEqual, inlineKeyboard, sendMessage } from '../_shared/telegram.js';
import { daysBetweenISO } from '../_shared/parser.js';
import { relativeDay, renderBudgetAlert, renderCreditAlert, renderRecurringAlert, renderWeeklyDigest } from '../_shared/render.js';

const DEFAULT_PREFS = {
  notifications_enabled: true, credit_reminders: true, recurring_reminders: true,
  budget_alerts: true, weekly_digest: true, reminder_days: [3, 1, 0], timezone: 'UTC'
};

function resultOrThrow(result) {
  if (result.error) throw new Error(result.error.message || 'Database request failed');
  return result.data;
}
function localParts(timeZone, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23'
    }).formatToParts(at);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour), weekday: map.weekday };
  } catch {
    return localParts('UTC', at);
  }
}
function monthStart(iso) { return `${iso.slice(0, 7)}-01`; }
function weekStart(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
function labelDate(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`));
}
function nextCreditPayment(credit) {
  return Array.isArray(credit?.schedule) ? credit.schedule.find(payment => !payment.paid) || null : null;
}
function minimumCardPayment(card) {
  const used = Math.max(0, Number(card.used || 0));
  return Math.min(used, Math.round(used * Number(card.minPaymentPercent || 0)) / 100);
}
/* Кнопки под уведомлением открывают нужный раздел бота одним нажатием */
const actions = (...pairs) => ({ reply_markup: inlineKeyboard([pairs.map(([text, command]) => ({ text, callback_data: `menu:${command}` }))]) });
const PAYMENT_ACTIONS = actions(['🗓 Платежи', 'upcoming'], ['🏦 Кредиты', 'credits']);
const BUDGET_ACTIONS = actions(['🎯 Бюджеты', 'budget'], ['📆 Месяц', 'month']);
const DIGEST_ACTIONS = actions(['📆 Месяц', 'month'], ['🎯 Бюджеты', 'budget']);
async function claimAndSend(db, userId, chatId, eventKey, text, extra = {}) {
  const claimed = resultOrThrow(await db.rpc('claim_telegram_notification', { p_user_id: userId, p_event_key: eventKey }));
  if (!claimed) return false;
  try {
    await sendMessage(chatId, text, extra);
    resultOrThrow(await db.rpc('mark_telegram_notification_sent', { p_user_id: userId, p_event_key: eventKey }));
    return true;
  } catch (error) {
    await db.rpc('release_telegram_notification', { p_user_id: userId, p_event_key: eventKey });
    throw error;
  }
}
async function getMonthOperations(db, userId, from, to) {
  const rows = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const data = resultOrThrow(await db.from('finance_operations').select('type,amount,category,date')
      .eq('user_id', userId).gte('date', from).lte('date', to)
      .order('date', { ascending: false }).range(offset, offset + 999));
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}
async function deliverCreditAlerts(db, userId, chatId, profile, prefs, today, counts) {
  if (!prefs.credit_reminders) return;
  const reminderDays = Array.isArray(prefs.reminder_days) ? prefs.reminder_days : [3, 1, 0];
  const items = [];
  for (const credit of Array.isArray(profile.credits) ? profile.credits : []) {
    const payment = nextCreditPayment(credit);
    if (!payment?.date) continue;
    items.push({ id: credit.id || credit.bank, name: `Платёж по кредиту · ${credit.bank || 'Банк'}`, date: String(payment.date).slice(0, 10), amount: Number(payment.amount || 0) });
  }
  for (const card of Array.isArray(profile.credit_cards) ? profile.credit_cards : []) {
    if (!Number(card.used) || !card.paymentDate) continue;
    items.push({ id: card.id || card.bank, name: `Платёж по кредитке · ${card.bank || 'Банк'}`, date: String(card.paymentDate).slice(0, 10), amount: minimumCardPayment(card) });
  }
  for (const item of items) {
    const delta = daysBetweenISO(today, item.date);
    if (delta === null || (delta < 0 ? delta < -30 : !reminderDays.includes(delta))) continue;
    const kind = delta < 0 ? 'overdue' : `d${delta}`;
    const eventKey = `credit:${item.id}:${item.date}:${kind}`;
    const wording = delta < 0 ? `🔴 Платёж просрочен с ${labelDate(item.date)}.` : delta === 0 ? '🟠 Срок платежа — <b>сегодня</b>.' : `📅 Платёж ${relativeDay(delta)} · ${labelDate(item.date)}.`;
    const sent = await claimAndSend(db, userId, chatId, eventKey,
      renderCreditAlert({ name: item.name, wording, amount: item.amount, urgent: delta <= 0 }), PAYMENT_ACTIONS);
    if (sent) counts.credit += 1;
  }
}
async function deliverRecurringAlerts(db, userId, chatId, profile, prefs, today, counts) {
  if (!prefs.recurring_reminders) return;
  const reminderDays = Array.isArray(prefs.reminder_days) ? prefs.reminder_days : [3, 1, 0];
  for (const payment of Array.isArray(profile.recurring) ? profile.recurring : []) {
    if (!payment.next) continue;
    const date = String(payment.next).slice(0, 10);
    const delta = daysBetweenISO(today, date);
    if (delta === null || (delta < 0 ? delta < -7 : !reminderDays.includes(delta))) continue;
    const kind = delta < 0 ? 'overdue' : `d${delta}`;
    const eventKey = `recurring:${payment.id || payment.name}:${date}:${kind}`;
    const timing = delta < 0 ? `🔴 Платёж просрочен с ${labelDate(date)}.` : delta === 0 ? '🟠 Списание запланировано на <b>сегодня</b>.' : `📅 Списание ${relativeDay(delta)} · ${labelDate(date)}.`;
    const sent = await claimAndSend(db, userId, chatId, eventKey,
      renderRecurringAlert({ name: payment.name || 'Регулярный платёж', timing, amount: payment.amount, category: payment.category }), PAYMENT_ACTIONS);
    if (sent) counts.recurring += 1;
  }
}
async function deliverBudgetAlerts(db, userId, chatId, profile, prefs, today, counts) {
  if (!prefs.budget_alerts) return;
  const monthFrom = monthStart(today), weekFrom = weekStart(today);
  const operations = await getMonthOperations(db, userId, monthFrom < weekFrom ? monthFrom : weekFrom, today);
  const monthlySpent = new Map(), weeklySpent = new Map();
  for (const row of operations) {
    if (row.type !== 'expense') continue;
    monthlySpent.set(row.category, (monthlySpent.get(row.category) || 0) + Number(row.amount));
    if (row.date >= weekFrom) weeklySpent.set(row.category, (weeklySpent.get(row.category) || 0) + Number(row.amount));
  }
  const budgets = Object.entries(profile.budgets || {}).map(([category, limit]) => ({ category, limit: Number(limit), period: 'month', from: monthFrom, spent: monthlySpent.get(category) || 0 }));
  const weekBudgets = Object.entries(profile.settings?.weeklyBudgets || {}).map(([category, limit]) => ({ category, limit: Number(limit), period: 'week', from: weekFrom, spent: weeklySpent.get(category) || 0 }));
  for (const budget of [...budgets, ...weekBudgets]) {
    if (!(budget.limit > 0)) continue;
    const percent = budget.spent / budget.limit * 100;
    const threshold = percent >= 100 ? 100 : percent >= 80 ? 80 : 0;
    if (!threshold) continue;
    const eventKey = `budget:${budget.period}:${budget.from}:${budget.category}:${threshold}`;
    const sent = await claimAndSend(db, userId, chatId, eventKey,
      renderBudgetAlert({ category: budget.category, spent: budget.spent, limit: budget.limit, threshold, period: budget.period }), BUDGET_ACTIONS);
    if (sent) counts.budget += 1;
  }
}
async function deliverWeeklyDigest(db, userId, chatId, prefs, today, counts) {
  if (!prefs.weekly_digest) return;
  const start = weekStart(today);
  const eventKey = `digest:week:${start}`;
  const rows = await getMonthOperations(db, userId, start, today);
  if (!rows.length) return;
  const sent = await claimAndSend(db, userId, chatId, eventKey, renderWeeklyDigest({ from: start, to: today, rows }), DIGEST_ACTIONS);
  if (sent) counts.digest += 1;
}
async function processAccount(db, account, prefsRow, profileRow, now, counts) {
  const prefs = { ...DEFAULT_PREFS, ...(prefsRow || {}) };
  if (!prefs.notifications_enabled) return;
  const local = localParts(prefs.timezone, now);
  // Send routine reminders only during daytime in each user's configured zone.
  if (local.hour < 9 || local.hour >= 21) return;
  const profile = profileRow || {};
  await deliverCreditAlerts(db, account.user_id, account.telegram_chat_id, profile, prefs, local.date, counts);
  await deliverRecurringAlerts(db, account.user_id, account.telegram_chat_id, profile, prefs, local.date, counts);
  await deliverBudgetAlerts(db, account.user_id, account.telegram_chat_id, profile, prefs, local.date, counts);
  const weekday = local.weekday;
  if (weekday === 'Sun' && local.hour === 10) await deliverWeeklyDigest(db, account.user_id, account.telegram_chat_id, prefs, local.date, counts);
}
function safeSecretMatch(request, expected) {
  return constantTimeEqual(request.headers.get('x-cron-secret') || '', expected || '');
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret) return jsonResponse({ error: 'cron_secret_not_configured' }, 503);
  if (!safeSecretMatch(request, secret)) return jsonResponse({ error: 'unauthorized' }, 401);
  const db = adminClient();
  const now = new Date();
  const counts = { credit: 0, recurring: 0, budget: 0, digest: 0, accounts: 0, errors: 0 };
  try {
    for (let offset = 0; offset < 10_000; offset += 500) {
      const accounts = resultOrThrow(await db.from('telegram_accounts').select('user_id,telegram_chat_id').order('created_at').range(offset, offset + 499));
      if (!accounts?.length) break;
      const userIds = accounts.map(account => account.user_id);
      const [prefsRows, profileRows] = await Promise.all([
        db.from('telegram_preferences').select('*').in('user_id', userIds),
        db.from('finance_profiles').select('user_id,budgets,goals,recurring,credits,credit_cards,categories,rules,settings').in('user_id', userIds)
      ]);
      const prefsByUser = new Map(resultOrThrow(prefsRows).map(row => [row.user_id, row]));
      const profilesByUser = new Map(resultOrThrow(profileRows).map(row => [row.user_id, row]));
      for (const account of accounts) {
        counts.accounts += 1;
        try { await processAccount(db, account, prefsByUser.get(account.user_id), profilesByUser.get(account.user_id), now, counts); }
        catch (error) { counts.errors += 1; console.error('Notification delivery failed:', account.user_id, error?.message || String(error)); }
      }
      if (accounts.length < 500) break;
    }
    await Promise.all([
      db.from('telegram_pending_operations').delete().lt('expires_at', now.toISOString()),
      db.from('telegram_link_codes').delete().lt('expires_at', now.toISOString()),
      db.from('telegram_webhook_updates').delete().lt('created_at', new Date(now.getTime() - 30 * 86400_000).toISOString()),
      db.from('telegram_operations').delete().lt('created_at', new Date(now.getTime() - 90 * 86400_000).toISOString()),
      db.from('telegram_notification_claims').delete().eq('state', 'sent').lt('sent_at', new Date(now.getTime() - 180 * 86400_000).toISOString())
    ]);
    return jsonResponse({ ok: true, ...counts });
  } catch (error) {
    console.error('Telegram notification run failed:', error?.message || String(error));
    return jsonResponse({ error: 'notification_run_failed', ...counts }, 500);
  }
});
