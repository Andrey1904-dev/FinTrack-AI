import { adminClient, jsonResponse } from '../_shared/supabase.js';
import { constantTimeEqual, editMessage, escapeHtml, inlineKeyboard, sendMessage, telegramRequest } from '../_shared/telegram.js';
import { daysBetweenISO, parseAmount, parseTransaction } from '../_shared/parser.js';
import {
  RULE, dateLabel, money, monthTitle, renderBalance, renderBudgetImpact, renderBudgets, renderCategories, renderCredits, renderGoals,
  renderHelp, renderMenu, renderOperationCard, renderPreferences, renderReport, renderUpcoming, renderWelcome, totalsOf
} from '../_shared/render.js';

const DEFAULT_PREFS = {
  notifications_enabled: true, credit_reminders: true, recurring_reminders: true,
  budget_alerts: true, weekly_digest: true, reminder_days: [3, 1, 0], timezone: 'UTC'
};
const PREF_LABELS = {
  notifications_enabled: 'Все уведомления', credit_reminders: 'Кредиты и кредитки',
  recurring_reminders: 'Регулярные платежи', budget_alerts: 'Бюджеты', weekly_digest: 'Недельная сводка'
};
const PREF_ICONS = {
  notifications_enabled: '🔔', credit_reminders: '🏦', recurring_reminders: '🔁', budget_alerts: '🎯', weekly_digest: '🗓'
};
/* Разделы, которые можно открыть кнопкой: остальное в callback игнорируется */
const MENU_COMMANDS = new Set(['menu', 'today', 'week', 'month', 'balance', 'credits', 'upcoming', 'budget', 'goals', 'notifications', 'undo', 'help', 'categories', 'timezone']);

const HOME_ROW = [{ text: '🏠 Меню', callback_data: 'menu:menu' }];
const MAIN_MENU = inlineKeyboard([
  [{ text: '📅 Сегодня', callback_data: 'menu:today' }, { text: '📆 Месяц', callback_data: 'menu:month' }],
  [{ text: '💰 Баланс', callback_data: 'menu:balance' }, { text: '🏆 Цели', callback_data: 'menu:goals' }],
  [{ text: '🎯 Бюджет', callback_data: 'menu:budget' }, { text: '🏦 Кредиты', callback_data: 'menu:credits' }],
  [{ text: '🗓 Платежи', callback_data: 'menu:upcoming' }, { text: '🔔 Уведомления', callback_data: 'menu:notifications' }],
  [{ text: '↩️ Отменить последнее', callback_data: 'menu:undo' }, { text: '❓ Помощь', callback_data: 'menu:help' }]
]);
/* Навигация внизу экранов: активный раздел отмечен точкой */
function navKeyboard(groups, active) {
  const mark = (id, text) => ({ text: id === active ? `• ${text}` : text, callback_data: `menu:${id}` });
  return inlineKeyboard([...groups.map(row => row.map(([id, text]) => mark(id, text))), HOME_ROW]);
}
const reportNav = active => navKeyboard([[['today', '📅 Сегодня'], ['week', '🗓 Неделя'], ['month', '📆 Месяц'], ['balance', '💰 Баланс']]], active);
const planNav = active => navKeyboard([[['budget', '🎯 Бюджет'], ['goals', '🏆 Цели']], [['upcoming', '🗓 Платежи'], ['credits', '🏦 Кредиты']]], active);

function resultOrThrow(result) {
  if (result.error) throw new Error(result.error.message || 'Database request failed');
  return result.data;
}
function localParts(timeZone, at = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(at);
    const map = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return { date: `${map.year}-${map.month}-${map.day}`, hour: Number(map.hour) };
  } catch {
    return localParts('UTC', at);
  }
}
function shiftDay(iso, delta) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
function monthStart(iso) { return `${iso.slice(0, 7)}-01`; }
function monthEnd(iso) {
  const year = Number(iso.slice(0, 4)), month = Number(iso.slice(5, 7));
  return new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10);
}
function previousMonthSamePeriod(iso) {
  const year = Number(iso.slice(0, 4)), month = Number(iso.slice(5, 7)), day = Number(iso.slice(8, 10));
  const first = new Date(Date.UTC(year, month - 2, 1, 12));
  const last = new Date(Date.UTC(year, month - 1, 0, 12)).getUTCDate();
  const from = first.toISOString().slice(0, 10);
  return { from, to: `${from.slice(0, 7)}-${String(Math.min(day, last)).padStart(2, '0')}` };
}
function weekStart(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}
function escapeCommand(text) { return String(text || '').slice(0, 1500); }
async function allOperations(db, userId, from, to) {
  const out = [];
  for (let offset = 0; offset < 20_000; offset += 1000) {
    let query = db.from('finance_operations').select('type,amount,category,note,date,client_id')
      .eq('user_id', userId).order('date', { ascending: false }).range(offset, offset + 999);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    const data = resultOrThrow(await query);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function getProfile(db, userId) {
  const data = resultOrThrow(await db.from('finance_profiles')
    .select('budgets,goals,recurring,credits,credit_cards,categories,rules,settings')
    .eq('user_id', userId).maybeSingle());
  return data || {};
}
async function getPrefs(db, userId) {
  resultOrThrow(await db.from('telegram_preferences').upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true }));
  const row = resultOrThrow(await db.from('telegram_preferences').select('*').eq('user_id', userId).single());
  return { ...DEFAULT_PREFS, ...row };
}
async function getAccount(db, chatId) {
  return resultOrThrow(await db.from('telegram_accounts').select('user_id,telegram_chat_id,username,first_name')
    .eq('telegram_chat_id', String(chatId)).maybeSingle());
}

/* io = куда отвечать. Если задан messageId (нажата кнопка) — экран обновляется
   на месте, как в приложении; если редактирование невозможно — шлём новым сообщением. */
function makeIo(chatId, messageId = null) { return { chatId, messageId }; }
async function respond(io, text, replyMarkup) {
  if (io.messageId) {
    try { return await editMessage(io.chatId, io.messageId, text, replyMarkup || inlineKeyboard([])); }
    catch { /* сообщение нельзя изменить — отправим новое */ }
  }
  return sendMessage(io.chatId, text, replyMarkup ? { reply_markup: replyMarkup } : {});
}
function typing(chatId) {
  telegramRequest('sendChatAction', { chat_id: String(chatId), action: 'typing' }).catch(() => {});
}

async function showMenu(io, account, prefs) {
  return respond(io, renderMenu({ name: account?.first_name || '', hour: localParts(prefs?.timezone || 'UTC').hour }), MAIN_MENU);
}
async function linkAccount(db, message, code) {
  const io = makeIo(message.chat.id);
  const chatId = String(message.chat.id);
  const existing = await getAccount(db, chatId);
  const normalizedCode = String(code || '').trim().toUpperCase();
  const codeOwner = resultOrThrow(await db.from('telegram_link_codes').select('user_id')
    .eq('code', normalizedCode).gt('expires_at', new Date().toISOString()).maybeSingle());
  if (!codeOwner) return respond(io, '⏳ <b>Код не найден или истёк</b>\nСоздайте новый в приложении: раздел Telegram AI → «Получить код привязки».');
  if (existing && existing.user_id !== codeOwner.user_id) return respond(io, '⚠️ <b>Этот Telegram уже привязан к другому аккаунту</b>\nСначала отвяжите его от прежнего аккаунта.');
  const consumed = resultOrThrow(await db.rpc('consume_telegram_link_code', { p_code: normalizedCode }));
  if (!consumed) return respond(io, '⚠️ <b>Код уже использован</b>\nСоздайте новый код в приложении.');
  resultOrThrow(await db.from('telegram_accounts').delete().eq('user_id', consumed));
  resultOrThrow(await db.from('telegram_accounts').insert({
    user_id: consumed, telegram_chat_id: chatId,
    username: message.from?.username || null,
    first_name: String(message.from?.first_name || '').slice(0, 100) || null
  }));
  resultOrThrow(await db.from('telegram_preferences').upsert({ user_id: consumed }, { onConflict: 'user_id', ignoreDuplicates: true }));
  return respond(io, renderWelcome(String(message.from?.first_name || '').slice(0, 100)), MAIN_MENU);
}

/* ---------- операция: черновик → подтверждение → запись ---------- */
function operationKeyboard(token, type) {
  return inlineKeyboard([
    [{ text: '✅ Сохранить', callback_data: `op:save:${token}` }, { text: '✖️ Отмена', callback_data: `op:cancel:${token}` }],
    [{ text: '🗂 Категория', callback_data: `op:categories:${token}` }, { text: type === 'income' ? '🔄 Это расход' : '🔄 Это доход', callback_data: `op:type:${token}` }]
  ]);
}
const PREVIEW_FOOTER = '<i>Запишу только после подтверждения · черновик действует 10 минут</i>';
async function sendOperationPreview(db, account, io, text, prefs) {
  const profile = await getProfile(db, account.user_id);
  const today = localParts(prefs.timezone).date;
  const draft = parseTransaction(text, { today, profile });
  if (!draft) {
    return respond(io, '🤔 <b>Не нашёл сумму</b>\nНапишите операцию вместе с суммой:\n<code>такси 450</code> · <code>кофе 250 вчера</code> · <code>зарплата 80к</code>', inlineKeyboard([HOME_ROW]));
  }
  if (/[$€£]|\b(?:PLN|EUR|USD)\b|zł/iu.test(text)) {
    return respond(io, '💱 <b>Пока только рубли</b>\nПроверьте валюту и отправьте сумму в ₽.');
  }
  const token = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  resultOrThrow(await db.from('telegram_pending_operations').insert({
    token, user_id: account.user_id, telegram_chat_id: String(io.chatId), draft,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
  }));
  return respond(io, renderOperationCard(draft, { footer: PREVIEW_FOOTER }), operationKeyboard(token, draft.type));
}
async function getPending(db, chatId, token) {
  return resultOrThrow(await db.from('telegram_pending_operations').select('draft,user_id')
    .eq('token', token).eq('telegram_chat_id', String(chatId)).gt('expires_at', new Date().toISOString()).maybeSingle());
}
const EXPIRED = '⌛ <b>Черновик истёк</b>\nОтправьте операцию ещё раз.';
async function updatePendingDraft(db, io, token, draft) {
  resultOrThrow(await db.from('telegram_pending_operations').update({ draft }).eq('token', token).eq('telegram_chat_id', String(io.chatId)));
  return respond(io, renderOperationCard(draft, { footer: PREVIEW_FOOTER }), operationKeyboard(token, draft.type));
}
async function updatePendingCategory(db, io, token, index) {
  const row = await getPending(db, io.chatId, token);
  if (!row) return respond(io, EXPIRED);
  const profile = await getProfile(db, row.user_id);
  const category = (profile.categories?.[row.draft.type] || [])[Number(index)];
  if (!category) return respond(io, 'Эта категория недоступна.');
  return updatePendingDraft(db, io, token, { ...row.draft, category });
}
async function togglePendingType(db, io, token) {
  const row = await getPending(db, io.chatId, token);
  if (!row) return respond(io, EXPIRED);
  const profile = await getProfile(db, row.user_id);
  const type = row.draft.type === 'income' ? 'expense' : 'income';
  const available = Array.isArray(profile.categories?.[type]) ? profile.categories[type] : [];
  const category = available.includes('Другое') ? 'Другое' : (available[0] || 'Другое');
  return updatePendingDraft(db, io, token, { ...row.draft, type, category });
}
async function showCategoryPicker(db, io, token) {
  const row = await getPending(db, io.chatId, token);
  if (!row) return respond(io, EXPIRED);
  const profile = await getProfile(db, row.user_id);
  const categories = (profile.categories?.[row.draft.type] || ['Другое']).slice(0, 20);
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(categories.slice(i, i + 2).map((category, offset) => ({ text: `${category === row.draft.category ? '✓ ' : ''}${category}`, callback_data: `op:cat:${token}:${i + offset}` })));
  }
  rows.push([{ text: '← К операции', callback_data: `op:back:${token}` }]);
  return respond(io, '🗂 <b>Выберите категорию</b>', inlineKeyboard(rows));
}
/* Чек после записи: если у категории есть лимит — сразу показываем, как он изменился */
async function budgetImpact(db, userId, saved) {
  try {
    if (saved.type !== 'expense') return '';
    const profile = await getProfile(db, userId);
    const monthLimit = Number(profile.budgets?.[saved.category] || 0);
    const weekLimit = Number(profile.settings?.weeklyBudgets?.[saved.category] || 0);
    if (!(monthLimit > 0) && !(weekLimit > 0)) return '';
    const date = String(saved.date).slice(0, 10);
    const wFrom = weekStart(date), wTo = shiftDay(wFrom, 6), mFrom = monthStart(date), mTo = monthEnd(date);
    const rows = (await allOperations(db, userId, wFrom < mFrom ? wFrom : mFrom, wTo > mTo ? wTo : mTo))
      .filter(row => row.type === 'expense' && row.category === saved.category);
    const sum = (from, to) => rows.filter(row => row.date >= from && row.date <= to).reduce((total, row) => total + Number(row.amount), 0);
    const blocks = [];
    if (monthLimit > 0) blocks.push(renderBudgetImpact({ category: saved.category, spent: sum(mFrom, mTo), limit: monthLimit, period: 'месяц' }));
    if (weekLimit > 0) blocks.push(renderBudgetImpact({ category: saved.category, spent: sum(wFrom, wTo), limit: weekLimit, period: 'неделя' }));
    return blocks.join('\n\n');
  } catch (error) {
    console.error('Budget impact failed:', error?.message || String(error));
    return '';
  }
}
async function saveOperation(db, account, io, token) {
  const result = resultOrThrow(await db.rpc('finalize_telegram_operation', { p_token: token, p_chat_id: String(io.chatId) }));
  if (!result) return respond(io, '⌛ Черновик истёк или уже обработан.', inlineKeyboard([HOME_ROW]));
  const impact = await budgetImpact(db, account.user_id, result);
  const footer = `${impact ? `${impact}\n\n` : ''}<i>Ошибка? Операцию можно отменить в течение суток.</i>`;
  return respond(io, renderOperationCard(result, { saved: true, footer }), inlineKeyboard([
    [{ text: '↩️ Отменить запись', callback_data: 'menu:undo' }, { text: '🎯 Бюджет', callback_data: 'menu:budget' }],
    [{ text: '📆 Итоги месяца', callback_data: 'menu:month' }, ...HOME_ROW]
  ]));
}

/* ---------- отчёты ---------- */
async function sendPeriodReport(db, io, userId, prefs, kind) {
  const today = localParts(prefs.timezone).date;
  let cfg;
  if (kind === 'today') {
    const yesterday = shiftDay(today, -1);
    cfg = { from: today, to: today, prev: [yesterday, yesterday], title: `Сегодня · ${dateLabel(today)}`, icon: '📅', previousLabel: 'вчера', days: 0, recent: 8 };
  } else if (kind === 'week') {
    const from = weekStart(today);
    cfg = { from, to: today, prev: [shiftDay(from, -7), shiftDay(today, -7)], title: `Неделя · ${dateLabel(from)} — ${dateLabel(today)}`, icon: '🗓', previousLabel: 'на прошлой неделе', days: (daysBetweenISO(from, today) || 0) + 1, recent: 0 };
  } else {
    const prev = previousMonthSamePeriod(today);
    cfg = { from: monthStart(today), to: today, prev: [prev.from, prev.to], title: monthTitle(today), icon: '📆', previousLabel: 'в прошлом месяце за те же дни', days: Number(today.slice(8, 10)), recent: 0 };
  }
  const [rows, prevRows] = await Promise.all([
    allOperations(db, userId, cfg.from, cfg.to),
    allOperations(db, userId, cfg.prev[0], cfg.prev[1])
  ]);
  const text = renderReport({
    title: cfg.title, icon: cfg.icon, rows, previous: prevRows.length ? totalsOf(prevRows) : null,
    previousLabel: cfg.previousLabel, days: cfg.days, showRecent: cfg.recent
  });
  return respond(io, text, reportNav(kind));
}
async function sendBalance(db, io, userId) {
  return respond(io, renderBalance(await allOperations(db, userId)), reportNav('balance'));
}
function nextCreditPayment(credit) {
  return Array.isArray(credit?.schedule) ? credit.schedule.find(payment => !payment.paid) || null : null;
}
function creditRemaining(credit) {
  const next = nextCreditPayment(credit);
  if (!next) return 0;
  return Math.max(0, Number(next.rest || 0) + Number(next.principal || 0));
}
function cardMin(card) {
  const used = Math.max(0, Number(card.used || 0));
  return Math.min(used, Math.max(0, Math.round(used * Number(card.minPaymentPercent || 0)) / 100));
}
async function sendCredits(db, io, userId, prefs) {
  const profile = await getProfile(db, userId);
  const today = localParts(prefs.timezone).date;
  const credits = Array.isArray(profile.credits) ? profile.credits : [];
  const cards = Array.isArray(profile.credit_cards) ? profile.credit_cards : [];
  if (!credits.length && !cards.length) {
    return respond(io, '🏦 <b>Кредиты и карты</b>\nПока ничего нет. Добавьте кредиты и кредитные карты в приложении — я покажу остаток долга и даты платежей.', planNav('credits'));
  }
  return respond(io, renderCredits({
    credits: credits.map(credit => {
      const payment = nextCreditPayment(credit);
      const date = payment?.date ? String(payment.date).slice(0, 10) : '';
      return {
        title: `${credit.bank || 'Кредит'}${credit.purpose ? ' · ' + credit.purpose : ''}`, remaining: creditRemaining(credit),
        next: payment ? { amount: Number(payment.amount || 0), date, delta: daysBetweenISO(today, date) ?? 0 } : null
      };
    }),
    cards: cards.map(card => {
      const date = card.paymentDate ? String(card.paymentDate).slice(0, 10) : '';
      return {
        title: `${card.bank || 'Карта'} · ${card.name || 'кредитная карта'}`, used: Number(card.used || 0), limit: Number(card.limit || 0),
        minimum: cardMin(card), date, delta: date ? (daysBetweenISO(today, date) ?? 0) : 0
      };
    })
  }), planNav('credits'));
}
async function sendUpcoming(db, io, userId, prefs) {
  const profile = await getProfile(db, userId);
  const today = localParts(prefs.timezone).date;
  const items = [];
  const push = (date, amount, name) => {
    const delta = daysBetweenISO(today, date);
    if (delta !== null && delta >= -7 && delta <= 14) items.push({ date, amount, name, delta });
  };
  for (const credit of Array.isArray(profile.credits) ? profile.credits : []) {
    const payment = nextCreditPayment(credit);
    if (payment?.date) push(String(payment.date).slice(0, 10), Number(payment.amount || 0), `Кредит · ${credit.bank || 'Банк'}`);
  }
  for (const card of Array.isArray(profile.credit_cards) ? profile.credit_cards : []) {
    if (Number(card.used) && card.paymentDate) push(String(card.paymentDate).slice(0, 10), cardMin(card), `Кредитка · ${card.bank || 'Банк'}`);
  }
  for (const payment of Array.isArray(profile.recurring) ? profile.recurring : []) {
    if (payment.next) push(String(payment.next).slice(0, 10), Number(payment.amount || 0), payment.name || 'Регулярный платёж');
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return respond(io, renderUpcoming(items), planNav('upcoming'));
}
async function sendBudget(db, io, userId, setCommand = '', prefs = DEFAULT_PREFS) {
  const profile = await getProfile(db, userId);
  if (setCommand) {
    const match = setCommand.match(/^set\s+(week\s+)?(.+?)\s+([\d\s\u00a0.,]+(?:к|тыс)?)\s*$/iu);
    if (!match) return respond(io, 'Формат: <code>/budget set Продукты 30000</code> или <code>/budget set week Продукты 8000</code>. Для удаления лимита задайте 0.');
    const category = match[2].trim();
    const profileCategories = Array.isArray(profile.categories?.expense) ? profile.categories.expense : [];
    if (profileCategories.length && !profileCategories.includes(category)) return respond(io, `🤷 Категория «${escapeHtml(category)}» не найдена. Список: /categories`);
    const amount = parseAmount(match[3]);
    if (amount === null) return respond(io, 'Проверьте сумму лимита.');
    const period = match[1] ? 'weekly' : 'monthly';
    resultOrThrow(await db.rpc('set_telegram_budget', { p_user_id: userId, p_category: category, p_amount: amount, p_period: period }));
    const done = amount === 0
      ? `🗑 Лимит «${escapeHtml(category)}» удалён.`
      : `🎯 ${period === 'weekly' ? 'Недельный' : 'Месячный'} лимит «${escapeHtml(category)}» установлен: <b>${money(amount)}</b>`;
    return respond(io, done, planNav('budget'));
  }
  const today = localParts(prefs.timezone).date;
  const [monthlyRows, weeklyRows] = await Promise.all([
    allOperations(db, userId, monthStart(today), today),
    allOperations(db, userId, weekStart(today), today)
  ]);
  const spentBy = rows => {
    const map = new Map();
    for (const row of rows) if (row.type === 'expense') map.set(row.category, (map.get(row.category) || 0) + Number(row.amount));
    return map;
  };
  const monthSpent = spentBy(monthlyRows), weekSpent = spentBy(weeklyRows);
  const monthly = Object.entries(profile.budgets || {}).filter(([, limit]) => Number(limit) > 0)
    .map(([category, limit]) => ({ category, limit: Number(limit), spent: monthSpent.get(category) || 0 }));
  const weekly = Object.entries(profile.settings?.weeklyBudgets || {}).filter(([, limit]) => Number(limit) > 0)
    .map(([category, limit]) => ({ category, limit: Number(limit), spent: weekSpent.get(category) || 0 }));
  return respond(io, renderBudgets({ monthly, weekly }), planNav('budget'));
}
async function sendGoals(db, io, userId) {
  const profile = await getProfile(db, userId);
  const goals = Array.isArray(profile.goals) ? profile.goals : [];
  if (!goals.length) return respond(io, '🏆 <b>Финансовые цели</b>\nЦелей пока нет. Создайте первую в приложении — и я буду показывать прогресс.', planNav('goals'));
  return respond(io, renderGoals(goals), planNav('goals'));
}
function preferenceKeyboard(prefs) {
  const rows = Object.entries(PREF_LABELS).map(([key, title]) => [{ text: `${prefs[key] ? '✅' : '⬜️'} ${PREF_ICONS[key]} ${title}`, callback_data: `pref:${key}` }]);
  rows.push([{ text: `🌍 Часовой пояс: ${prefs.timezone}`, callback_data: 'timezone:menu' }]);
  rows.push(HOME_ROW);
  return inlineKeyboard(rows);
}
async function showPreferences(db, io, userId) {
  return respond(io, renderPreferences(), preferenceKeyboard(await getPrefs(db, userId)));
}
const TIMEZONES = ['Europe/Warsaw', 'Europe/Moscow', 'Asia/Yekaterinburg', 'UTC'];
function timezoneKeyboard() {
  return inlineKeyboard([
    [{ text: 'Europe/Warsaw', callback_data: 'tz:Europe/Warsaw' }, { text: 'Europe/Moscow', callback_data: 'tz:Europe/Moscow' }],
    [{ text: 'Asia/Yekaterinburg', callback_data: 'tz:Asia/Yekaterinburg' }, { text: 'UTC', callback_data: 'tz:UTC' }],
    [{ text: '← К уведомлениям', callback_data: 'menu:notifications' }]
  ]);
}
async function showUndo(db, io, account) {
  const row = resultOrThrow(await db.from('telegram_operations').select('id,amount,category,note,operation_date')
    .eq('user_id', account.user_id).eq('telegram_chat_id', String(io.chatId))
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (!row) return respond(io, '↩️ <b>Нечего отменять</b>\nЗа последние 24 часа из Telegram операций не было.', inlineKeyboard([HOME_ROW]));
  return respond(io, `↩️ <b>Отменить последнюю операцию?</b>\n${RULE}\n<b>${money(row.amount)}</b> · ${escapeHtml(row.category)}\n📝 ${escapeHtml(row.note || 'без описания')}\n📅 ${escapeHtml(dateLabel(row.operation_date))}`, inlineKeyboard([
    [{ text: '↩️ Да, отменить', callback_data: `undo:${row.id}` }, { text: 'Оставить', callback_data: 'undo:cancel' }]
  ]));
}
async function handleCommand(db, account, io, command, args, prefs, text = '') {
  switch (command) {
    case 'start':
    case 'menu': return showMenu(io, account, prefs);
    case 'help': return respond(io, renderHelp(), inlineKeyboard([HOME_ROW]));
    case 'today': return sendPeriodReport(db, io, account.user_id, prefs, 'today');
    case 'week': return sendPeriodReport(db, io, account.user_id, prefs, 'week');
    case 'month':
    case 'report': return sendPeriodReport(db, io, account.user_id, prefs, 'month');
    case 'balance': return sendBalance(db, io, account.user_id);
    case 'credits':
    case 'debts': return sendCredits(db, io, account.user_id, prefs);
    case 'upcoming':
    case 'payments': return sendUpcoming(db, io, account.user_id, prefs);
    case 'budget': return sendBudget(db, io, account.user_id, args, prefs);
    case 'goals': return sendGoals(db, io, account.user_id);
    case 'notifications':
    case 'notify':
    case 'settings': return showPreferences(db, io, account.user_id);
    case 'timezone': return respond(io, '🌍 <b>Часовой пояс напоминаний</b>\nВыберите подходящий вариант:', timezoneKeyboard());
    case 'categories': {
      const profile = await getProfile(db, account.user_id);
      return respond(io, renderCategories({ expense: profile.categories?.expense || [], income: profile.categories?.income || [] }), inlineKeyboard([HOME_ROW]));
    }
    case 'undo': return showUndo(db, io, account);
    case 'unlink': return respond(io, '🔌 <b>Отключить Telegram?</b>\nЯ перестану видеть аккаунт и присылать напоминания. Данные в приложении останутся.', inlineKeyboard([
      [{ text: 'Да, отвязать', callback_data: 'unlink:confirm' }, { text: 'Не отвязывать', callback_data: 'unlink:cancel' }]
    ]));
    default: return sendOperationPreview(db, account, io, text, prefs);
  }
}
async function handleMessage(db, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  const io = makeIo(chatId);
  if (message.chat.type !== 'private') return respond(io, '🔒 Для защиты финансовых данных бот работает только в личном чате.');
  const text = escapeCommand(message.text || '');
  if (!text) return respond(io, 'Отправьте команду /help или опишите операцию, например: <code>кофе 250</code>.');
  const commandMatch = text.match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu);
  const command = commandMatch ? commandMatch[1].toLowerCase() : '';
  const args = commandMatch ? (commandMatch[2] || '').trim() : '';
  const rateOk = resultOrThrow(await db.rpc('consume_telegram_rate_limit', { p_chat_id: String(chatId), p_limit: 25 }));
  if (!rateOk) return respond(io, '⏱ Слишком много запросов. Подождите минуту и попробуйте снова.');
  if (command === 'link') return linkAccount(db, message, args);
  if (command === 'start' && /^link_[A-Z0-9]+$/iu.test(args)) return linkAccount(db, message, args.slice(5));
  const account = await getAccount(db, chatId);
  if (!account) {
    if (command === 'help' || command === 'start') return respond(io, '👋 <b>Добро пожаловать в FinTrack</b>\nЧтобы подключить аккаунт: откройте раздел Telegram в приложении, создайте одноразовый код и отправьте <code>/link КОД</code>. Код действует 15 минут.');
    return respond(io, '🔗 Аккаунт не привязан. В приложении создайте код подключения и отправьте <code>/link КОД</code>.');
  }
  typing(chatId);
  const prefs = await getPrefs(db, account.user_id);
  if (!command) return sendOperationPreview(db, account, io, text, prefs);
  return handleCommand(db, account, io, command, args, prefs, text);
}
const CALLBACK_TOASTS = { 'op:save': 'Записываю…', 'op:cancel': 'Отменено', 'undo:': 'Отменяю…', 'unlink:confirm': 'Готово' };
function callbackToast(data) {
  const key = Object.keys(CALLBACK_TOASTS).find(prefix => data.startsWith(prefix));
  return key ? CALLBACK_TOASTS[key] : undefined;
}
async function handleCallback(db, callback) {
  const chatId = callback.message?.chat?.id;
  const message = callback.message;
  if (!chatId || !message || message.chat.type !== 'private') return;
  const io = makeIo(chatId, message.message_id);
  const data = String(callback.data || '');
  const account = await getAccount(db, chatId);
  if (!account) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Сначала привяжите аккаунт' }).catch(() => {});
    return respond(makeIo(chatId), '🔗 Аккаунт не привязан. Создайте код подключения в приложении.');
  }
  const rateOk = resultOrThrow(await db.rpc('consume_telegram_rate_limit', { p_chat_id: String(chatId), p_limit: 25 }));
  if (!rateOk) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Подождите минуту' }).catch(() => {});
    return;
  }
  const toast = callbackToast(data);
  await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, ...(toast ? { text: toast } : {}) }).catch(() => {});
  if (data.startsWith('menu:')) {
    const command = data.slice(5);
    if (!MENU_COMMANDS.has(command)) return;
    return handleCommand(db, account, io, command, '', await getPrefs(db, account.user_id));
  }
  if (data.startsWith('op:')) {
    const [, action, token, value] = data.split(':');
    if (action === 'cancel') {
      resultOrThrow(await db.from('telegram_pending_operations').delete().eq('token', token).eq('telegram_chat_id', String(chatId)));
      return respond(io, '✖️ <b>Операция отменена</b>\nНичего не записано.', inlineKeyboard([HOME_ROW]));
    }
    if (action === 'categories') return showCategoryPicker(db, io, token);
    if (action === 'cat') return updatePendingCategory(db, io, token, value);
    if (action === 'type') return togglePendingType(db, io, token);
    if (action === 'back') {
      const row = await getPending(db, chatId, token);
      if (!row) return respond(io, EXPIRED);
      return respond(io, renderOperationCard(row.draft, { footer: PREVIEW_FOOTER }), operationKeyboard(token, row.draft.type));
    }
    if (action === 'save') return saveOperation(db, account, io, token);
  }
  if (data.startsWith('pref:')) {
    const key = data.slice(5);
    if (!(key in PREF_LABELS)) return;
    const prefs = await getPrefs(db, account.user_id);
    const update = await db.from('telegram_preferences').update({ [key]: !prefs[key], updated_at: new Date().toISOString() }).eq('user_id', account.user_id);
    if (update.error) throw new Error(update.error.message);
    return respond(io, renderPreferences(), preferenceKeyboard({ ...prefs, [key]: !prefs[key] }));
  }
  if (data === 'timezone:menu') return respond(io, '🌍 <b>Часовой пояс напоминаний</b>\nОт него зависит время, когда приходят уведомления.', timezoneKeyboard());
  if (data.startsWith('tz:')) {
    const timezone = data.slice(3);
    if (!TIMEZONES.includes(timezone)) return;
    const result = await db.from('telegram_preferences').update({ timezone, updated_at: new Date().toISOString() }).eq('user_id', account.user_id);
    if (result.error) throw new Error(result.error.message);
    return respond(io, `🌍 Часовой пояс установлен: <b>${timezone}</b>\nНапоминания приходят с 09:00 до 21:00 по местному времени.`, inlineKeyboard([[{ text: '🔔 К уведомлениям', callback_data: 'menu:notifications' }], HOME_ROW]));
  }
  if (data === 'unlink:cancel') return respond(io, '👌 Аккаунт оставлен подключённым.', inlineKeyboard([HOME_ROW]));
  if (data === 'unlink:confirm') {
    resultOrThrow(await db.from('telegram_accounts').delete().eq('telegram_chat_id', String(chatId)).eq('user_id', account.user_id));
    return respond(io, '🔌 <b>Telegram отвязан</b>\nДанные в приложении не удалены. Чтобы подключить снова, создайте новый код.');
  }
  if (data === 'undo:cancel') return respond(io, '👌 Операция оставлена без изменений.', inlineKeyboard([HOME_ROW]));
  if (data.startsWith('undo:')) {
    const id = Number(data.slice(5));
    if (!Number.isSafeInteger(id)) return;
    const undone = resultOrThrow(await db.rpc('undo_telegram_operation', { p_operation_id: id, p_chat_id: String(chatId) }));
    return respond(io, undone ? '↩️ <b>Операция отменена</b>\nОтчёты и баланс обновятся сразу.' : '⚠️ Не удалось отменить: операция уже удалена или прошло больше 24 часов.', inlineKeyboard([HOME_ROW]));
  }
}
async function processUpdate(db, update) {
  if (update.message) return handleMessage(db, update.message);
  if (update.callback_query) return handleCallback(db, update.callback_query);
}
function safeEqualHeader(request, expected) {
  return constantTimeEqual(request.headers.get('x-telegram-bot-api-secret-token') || '', expected || '');
}

Deno.serve(async request => {
  if (request.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);
  const expected = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!expected) return jsonResponse({ error: 'webhook_secret_not_configured' }, 503);
  if (!safeEqualHeader(request, expected)) return jsonResponse({ error: 'unauthorized' }, 401);
  let update;
  try { update = await request.json(); }
  catch { return jsonResponse({ error: 'invalid_json' }, 400); }
  if (!Number.isSafeInteger(update?.update_id)) return jsonResponse({ ok: true });
  const db = adminClient();
  const insert = await db.from('telegram_webhook_updates').insert({ update_id: update.update_id });
  if (insert.error?.code === '23505') return jsonResponse({ ok: true, duplicate: true });
  if (insert.error) return jsonResponse({ error: 'update_store_failed' }, 500);
  try {
    await processUpdate(db, update);
    return jsonResponse({ ok: true });
  } catch (error) {
    await db.from('telegram_webhook_updates').delete().eq('update_id', update.update_id);
    console.error('Telegram update failed:', error?.message || String(error));
    return jsonResponse({ error: 'update_failed' }, 500);
  }
});
