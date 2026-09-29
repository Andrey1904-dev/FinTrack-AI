import { adminClient, jsonResponse } from '../_shared/supabase.js';
import { constantTimeEqual, editMessage, escapeHtml, inlineKeyboard, sendMessage, telegramRequest } from '../_shared/telegram.js';
import { daysBetweenISO, formatRUB, parseAmount, parseTransaction } from '../_shared/parser.js';

const DEFAULT_PREFS = {
  notifications_enabled: true, credit_reminders: true, recurring_reminders: true,
  budget_alerts: true, weekly_digest: true, reminder_days: [3, 1, 0], timezone: 'UTC'
};
const PREF_LABELS = {
  notifications_enabled: 'Все уведомления', credit_reminders: 'Кредиты и кредитки',
  recurring_reminders: 'Регулярные платежи', budget_alerts: 'Бюджеты', weekly_digest: 'Недельная сводка'
};
const MAIN_MENU = inlineKeyboard([
  [{ text: 'Сегодня', callback_data: 'menu:today' }, { text: 'Месяц', callback_data: 'menu:month' }],
  [{ text: 'Кредиты', callback_data: 'menu:credits' }, { text: 'Платежи', callback_data: 'menu:upcoming' }],
  [{ text: 'Бюджет', callback_data: 'menu:budget' }, { text: 'Цели', callback_data: 'menu:goals' }],
  [{ text: 'Уведомления', callback_data: 'menu:notifications' }, { text: 'Отменить последнее', callback_data: 'menu:undo' }],
  [{ text: 'Помощь', callback_data: 'menu:help' }]
]);

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
function dateLabel(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}
function monthStart(iso) { return `${iso.slice(0, 7)}-01`; }
function weekStart(iso) {
  const date = new Date(`${iso}T12:00:00Z`);
  const dow = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dow);
  return date.toISOString().slice(0, 10);
}
function escapeCommand(text) { return String(text || '').slice(0, 1500); }
function formatPeriodTotals(rows) {
  const income = rows.reduce((sum, row) => sum + (row.type === 'income' ? Number(row.amount) : 0), 0);
  const expense = rows.reduce((sum, row) => sum + (row.type === 'expense' ? Number(row.amount) : 0), 0);
  return { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100, balance: Math.round((income - expense) * 100) / 100 };
}
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
async function reply(chatId, text, replyMarkup) {
  return sendMessage(chatId, text, replyMarkup ? { reply_markup: replyMarkup } : {});
}
async function showMenu(chatId) {
  return reply(chatId, '<b>FinTrack · управление финансами</b>\nВыберите нужный раздел или отправьте операцию обычным текстом.', MAIN_MENU);
}
function helpText() {
  return `<b>Что умеет бот</b>

<b>Отчёты</b>
/today — итоги за сегодня
/month — итоги за текущий месяц
/balance — баланс за всё время
/credits — кредиты и кредитные карты
/upcoming — платежи на ближайшие 14 дней
/budget — лимиты и потрачено
/goals — прогресс финансовых целей

<b>Управление</b>
/budget set Продукты 30000 — месячный лимит
/budget set week Продукты 8000 — недельный лимит
/notifications — настроить напоминания
/timezone — часовой пояс уведомлений
/undo — отменить операцию из Telegram за последние 24 часа
/unlink — отключить Telegram от аккаунта

Отправьте, например: <code>кофе 250 вчера</code> или <code>зарплата 80к</code>. Перед записью бот покажет операцию и попросит подтверждение.`;
}
async function linkAccount(db, message, code) {
  const chatId = String(message.chat.id);
  const existing = await getAccount(db, chatId);
  const normalizedCode = String(code || '').trim().toUpperCase();
  const codeOwner = resultOrThrow(await db.from('telegram_link_codes').select('user_id')
    .eq('code', normalizedCode).gt('expires_at', new Date().toISOString()).maybeSingle());
  if (!codeOwner) return reply(chatId, 'Код не найден или срок его действия истёк. Создайте новый код в приложении.');
  if (existing && existing.user_id !== codeOwner.user_id) return reply(chatId, 'Этот Telegram уже привязан к другому аккаунту. Сначала отвяжите его от прежнего аккаунта.');
  const consumed = resultOrThrow(await db.rpc('consume_telegram_link_code', { p_code: normalizedCode }));
  if (!consumed) return reply(chatId, 'Код уже использован. Создайте новый код в приложении.');
  resultOrThrow(await db.from('telegram_accounts').delete().eq('user_id', consumed));
  resultOrThrow(await db.from('telegram_accounts').insert({
    user_id: consumed, telegram_chat_id: chatId,
    username: message.from?.username || null,
    first_name: String(message.from?.first_name || '').slice(0, 100) || null
  }));
  resultOrThrow(await db.from('telegram_preferences').upsert({ user_id: consumed }, { onConflict: 'user_id', ignoreDuplicates: true }));
  return reply(chatId, `<b>Готово, аккаунт привязан.</b>\nТеперь можно записывать операции, смотреть отчёты и получать напоминания. Настройки уведомлений: /notifications`, MAIN_MENU);
}
function operationKeyboard(token) {
  return inlineKeyboard([
    [{ text: '✓ Сохранить', callback_data: `op:save:${token}` }, { text: 'Отмена', callback_data: `op:cancel:${token}` }],
    [{ text: 'Изменить категорию', callback_data: `op:categories:${token}` }]
  ]);
}
async function sendOperationPreview(db, account, message, text, prefs) {
  const profile = await getProfile(db, account.user_id);
  const today = localParts(prefs.timezone).date;
  const draft = parseTransaction(text, { today, profile });
  if (!draft) return reply(message.chat.id, 'Не смог найти сумму. Отправьте фразу с суммой, например: <code>такси 450</code> или <code>зарплата 80000</code>.');
  if (/[$€£]|\b(?:PLN|EUR|USD)\b|zł/iu.test(text)) {
    return reply(message.chat.id, 'Сейчас бот ведёт учёт только в рублях. Проверьте валюту и отправьте сумму в ₽.');
  }
  const token = crypto.randomUUID().replaceAll('-', '').slice(0, 20);
  resultOrThrow(await db.from('telegram_pending_operations').insert({
    token, user_id: account.user_id, telegram_chat_id: String(message.chat.id), draft,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString()
  }));
  const sign = draft.type === 'income' ? '+' : '−';
  const typeLabel = draft.type === 'income' ? 'Доход' : 'Расход';
  return reply(message.chat.id,
    `<b>Проверьте операцию</b>\n${typeLabel}: <b>${sign}${formatRUB(draft.amount)}</b>\nКатегория: ${escapeHtml(draft.category)}\nДата: ${escapeHtml(dateLabel(draft.date))}\nОписание: ${escapeHtml(draft.note)}\n\nЗапишу её только после вашего подтверждения.`,
    operationKeyboard(token));
}
async function sendReport(db, chatId, userId, from, to, title) {
  const rows = await allOperations(db, userId, from, to);
  const totals = formatPeriodTotals(rows);
  const categories = new Map();
  for (const row of rows) if (row.type === 'expense') categories.set(row.category, (categories.get(row.category) || 0) + Number(row.amount));
  const top = [...categories].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sign = totals.balance >= 0 ? '+' : '−';
  const topText = top.length ? `\n\n<b>Крупные категории расходов</b>\n${top.map(([name, amount]) => `• ${escapeHtml(name)} — ${formatRUB(amount)}`).join('\n')}` : '';
  return reply(chatId, `<b>${escapeHtml(title)}</b>\nОпераций: ${rows.length}\nДоходы: <b>${formatRUB(totals.income)}</b>\nРасходы: <b>${formatRUB(totals.expense)}</b>\nБаланс: <b>${sign}${formatRUB(Math.abs(totals.balance))}</b>${topText}`);
}
async function sendBalance(db, chatId, userId) {
  const rows = await allOperations(db, userId);
  const totals = formatPeriodTotals(rows);
  return reply(chatId, `<b>Баланс за всё время</b>\n${totals.balance >= 0 ? '+' : '−'}<b>${formatRUB(Math.abs(totals.balance))}</b>\nДоходы: ${formatRUB(totals.income)} · расходы: ${formatRUB(totals.expense)}\nОпераций: ${rows.length}`);
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
async function sendCredits(db, chatId, userId) {
  const profile = await getProfile(db, userId);
  const credits = Array.isArray(profile.credits) ? profile.credits : [];
  const cards = Array.isArray(profile.credit_cards) ? profile.credit_cards : [];
  if (!credits.length && !cards.length) return reply(chatId, 'В аккаунте пока нет кредитов или кредитных карт. Добавьте их в приложении — бот сможет показывать остаток долга и даты платежей.');
  const lines = ['<b>Кредиты и кредитные карты</b>'];
  for (const credit of credits) {
    const payment = nextCreditPayment(credit);
    lines.push(`\n🏦 <b>${escapeHtml(credit.bank || 'Кредит')}${credit.purpose ? ' · ' + escapeHtml(credit.purpose) : ''}</b>`);
    lines.push(`Долг: ${formatRUB(creditRemaining(credit))}`);
    if (payment) lines.push(`Платёж: ${formatRUB(payment.amount)} · ${escapeHtml(dateLabel(String(payment.date).slice(0, 10)))}`);
    else lines.push('График закрыт.');
  }
  for (const card of cards) {
    const used = Number(card.used || 0);
    lines.push(`\n💳 <b>${escapeHtml(card.bank || 'Карта')} · ${escapeHtml(card.name || 'кредитная карта')}</b>`);
    lines.push(`Долг: ${formatRUB(used)} · минимум: ${formatRUB(cardMin(card))}`);
    if (used > 0 && card.paymentDate) lines.push(`Дата платежа: ${escapeHtml(dateLabel(String(card.paymentDate).slice(0, 10)))}`);
  }
  lines.push('\nУправление графиком и погашением доступно в приложении.');
  return reply(chatId, lines.join('\n'));
}
async function sendUpcoming(db, chatId, userId, prefs) {
  const profile = await getProfile(db, userId);
  const today = localParts(prefs.timezone).date;
  const items = [];
  for (const credit of Array.isArray(profile.credits) ? profile.credits : []) {
    const payment = nextCreditPayment(credit);
    if (!payment?.date) continue;
    const date = String(payment.date).slice(0, 10);
    const delta = daysBetweenISO(today, date);
    if (delta !== null && delta >= -7 && delta <= 14) items.push({ date, amount: Number(payment.amount || 0), name: `Кредит · ${credit.bank || 'Банк'}`, delta });
  }
  for (const card of Array.isArray(profile.credit_cards) ? profile.credit_cards : []) {
    if (!Number(card.used) || !card.paymentDate) continue;
    const date = String(card.paymentDate).slice(0, 10);
    const delta = daysBetweenISO(today, date);
    if (delta !== null && delta >= -7 && delta <= 14) items.push({ date, amount: cardMin(card), name: `Кредитка · ${card.bank || 'Банк'}`, delta });
  }
  for (const payment of Array.isArray(profile.recurring) ? profile.recurring : []) {
    if (!payment.next) continue;
    const date = String(payment.next).slice(0, 10);
    const delta = daysBetweenISO(today, date);
    if (delta !== null && delta >= -7 && delta <= 14) items.push({ date, amount: Number(payment.amount || 0), name: payment.name || 'Регулярный платёж', delta });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  if (!items.length) return reply(chatId, 'На ближайшие 14 дней запланированных платежей нет.');
  const lines = items.map(item => `• ${escapeHtml(dateLabel(item.date))} · ${escapeHtml(item.name)} — <b>${formatRUB(item.amount)}</b>${item.delta < 0 ? ' · просрочен' : item.delta === 0 ? ' · сегодня' : ` · через ${item.delta} дн.`}`);
  return reply(chatId, `<b>Ближайшие платежи</b>\n${lines.join('\n')}`);
}
async function sendBudget(db, chatId, userId, setCommand = '', prefs = DEFAULT_PREFS) {
  const profile = await getProfile(db, userId);
  if (setCommand) {
    const match = setCommand.match(/^set\s+(week\s+)?(.+?)\s+([\d\s\u00a0.,]+(?:к|тыс)?)\s*$/iu);
    if (!match) return reply(chatId, 'Формат: <code>/budget set Продукты 30000</code> или <code>/budget set week Продукты 8000</code>. Для удаления лимита задайте 0.');
    const category = match[2].trim();
    const profileCategories = Array.isArray(profile.categories?.expense) ? profile.categories.expense : [];
    if (profileCategories.length && !profileCategories.includes(category)) return reply(chatId, `Категория «${escapeHtml(category)}» не найдена. Сначала проверьте список: /categories`);
    const amount = parseAmount(match[3]);
    if (amount === null) return reply(chatId, 'Проверьте сумму лимита.');
    const period = match[1] ? 'weekly' : 'monthly';
    resultOrThrow(await db.rpc('set_telegram_budget', { p_user_id: userId, p_category: category, p_amount: amount, p_period: period }));
    return reply(chatId, amount === 0 ? `Лимит «${escapeHtml(category)}» удалён.` : `${period === 'weekly' ? 'Недельный' : 'Месячный'} лимит «${escapeHtml(category)}» установлен: <b>${formatRUB(amount)}</b>.`);
  }
  const today = localParts(prefs.timezone).date;
  const [monthlyRows, weeklyRows] = await Promise.all([
    allOperations(db, userId, monthStart(today), today),
    allOperations(db, userId, weekStart(today), today)
  ]);
  const monthSpent = new Map(), weekSpent = new Map();
  for (const row of monthlyRows) if (row.type === 'expense') monthSpent.set(row.category, (monthSpent.get(row.category) || 0) + Number(row.amount));
  for (const row of weeklyRows) if (row.type === 'expense') weekSpent.set(row.category, (weekSpent.get(row.category) || 0) + Number(row.amount));
  const budgets = Object.entries(profile.budgets || {}).filter(([, amount]) => Number(amount) > 0);
  const weekly = Object.entries(profile.settings?.weeklyBudgets || {}).filter(([, amount]) => Number(amount) > 0);
  const lines = [];
  for (const [category, limit] of budgets) lines.push(`• ${escapeHtml(category)}: ${formatRUB(monthSpent.get(category) || 0)} / ${formatRUB(limit)} за месяц`);
  for (const [category, limit] of weekly) lines.push(`• ${escapeHtml(category)}: ${formatRUB(weekSpent.get(category) || 0)} / ${formatRUB(limit)} за неделю`);
  return reply(chatId, `<b>Бюджеты</b>\n${lines.length ? lines.join('\n') : 'Лимиты пока не настроены.'}\n\nИзменить: <code>/budget set Продукты 30000</code> · удалить: задайте 0.`);
}
async function sendGoals(db, chatId, userId) {
  const profile = await getProfile(db, userId);
  const goals = Array.isArray(profile.goals) ? profile.goals : [];
  if (!goals.length) return reply(chatId, 'Финансовые цели пока не добавлены. Создайте цель в приложении.');
  return reply(chatId, `<b>Финансовые цели</b>\n${goals.slice(0, 10).map(goal => {
    const percent = goal.target ? Math.min(100, Math.round(Number(goal.saved || 0) / Number(goal.target) * 100)) : 0;
    return `• ${escapeHtml(goal.name || 'Цель')}: ${formatRUB(goal.saved)} из ${formatRUB(goal.target)} · ${percent}%`;
  }).join('\n')}`);
}
function preferenceKeyboard(prefs) {
  const rows = Object.entries(PREF_LABELS).map(([key, title]) => [{ text: `${prefs[key] ? '✅' : '◻️'} ${title}`, callback_data: `pref:${key}` }]);
  rows.push([{ text: `Часовой пояс: ${prefs.timezone}`, callback_data: 'timezone:menu' }]);
  return inlineKeyboard(rows);
}
async function showPreferences(db, chatId, userId) {
  const prefs = await getPrefs(db, userId);
  return reply(chatId, '<b>Уведомления FinTrack</b>\nВключайте только нужные типы. Кредитные напоминания приходят за 3 дня, за день и в день платежа; часовой пояс влияет на время отправки.', preferenceKeyboard(prefs));
}
async function showUndo(db, chatId, account) {
  const row = resultOrThrow(await db.from('telegram_operations').select('id,amount,category,note,operation_date')
    .eq('user_id', account.user_id).eq('telegram_chat_id', String(chatId))
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (!row) return reply(chatId, 'Нет операций из Telegram за последние 24 часа, которые можно отменить.');
  return reply(chatId, `<b>Отменить последнюю операцию?</b>\n${formatRUB(row.amount)} · ${escapeHtml(row.category)} · ${escapeHtml(row.note || 'без описания')}\n${escapeHtml(dateLabel(row.operation_date))}`, inlineKeyboard([
    [{ text: 'Отменить операцию', callback_data: `undo:${row.id}` }, { text: 'Оставить', callback_data: 'undo:cancel' }]
  ]));
}
async function handleCommand(db, account, message, command, args, prefs) {
  const chatId = message.chat.id;
  const today = localParts(prefs.timezone).date;
  switch (command) {
    case 'start':
    case 'menu': return showMenu(chatId);
    case 'help': return reply(chatId, helpText(), MAIN_MENU);
    case 'today': return sendReport(db, chatId, account.user_id, today, today, `Сегодня · ${dateLabel(today)}`);
    case 'month':
    case 'report': return sendReport(db, chatId, account.user_id, monthStart(today), today, `Месяц · ${new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${today}T12:00:00Z`))}`);
    case 'balance': return sendBalance(db, chatId, account.user_id);
    case 'credits':
    case 'debts': return sendCredits(db, chatId, account.user_id);
    case 'upcoming':
    case 'payments': return sendUpcoming(db, chatId, account.user_id, prefs);
    case 'budget': return sendBudget(db, chatId, account.user_id, args, prefs);
    case 'goals': return sendGoals(db, chatId, account.user_id);
    case 'notifications':
    case 'notify':
    case 'settings': return showPreferences(db, chatId, account.user_id);
    case 'timezone': return reply(chatId, '<b>Часовой пояс напоминаний</b>\nВыберите подходящий вариант:', inlineKeyboard([
[{ text: 'Europe/Warsaw', callback_data: 'tz:Europe/Warsaw' }, { text: 'Europe/Moscow', callback_data: 'tz:Europe/Moscow' }],
      [{ text: 'Asia/Yekaterinburg', callback_data: 'tz:Asia/Yekaterinburg' }, { text: 'UTC', callback_data: 'tz:UTC' }]
    ]));
    case 'categories': {
      const profile = await getProfile(db, account.user_id);
      return reply(chatId, `<b>Категории</b>\nРасходы: ${(profile.categories?.expense || []).map(escapeHtml).join(', ') || '—'}\nДоходы: ${(profile.categories?.income || []).map(escapeHtml).join(', ') || '—'}`);
    }
    case 'undo': return showUndo(db, chatId, account);
    case 'unlink': return reply(chatId, '<b>Отключить Telegram?</b> Бот перестанет получать данные аккаунта и отправлять напоминания. Данные в приложении останутся.', inlineKeyboard([
      [{ text: 'Да, отвязать', callback_data: 'unlink:confirm' }, { text: 'Не отвязывать', callback_data: 'unlink:cancel' }]
    ]));
    default: return sendOperationPreview(db, account, message, message.text || '', prefs);
  }
}
async function handleMessage(db, message) {
  const chatId = message.chat?.id;
  if (!chatId) return;
  if (message.chat.type !== 'private') return reply(chatId, 'Для защиты финансовых данных бот работает только в личном чате.');
  const text = escapeCommand(message.text || '');
  if (!text) return reply(chatId, 'Отправьте команду /help или опишите операцию, например: <code>кофе 250</code>.');
  const commandMatch = text.match(/^\/([a-z0-9_]+)(?:@[a-z0-9_]+)?(?:\s+([\s\S]*))?$/iu);
  const command = commandMatch ? commandMatch[1].toLowerCase() : '';
  const args = commandMatch ? (commandMatch[2] || '').trim() : '';
  const db = adminClient();
  const rateOk = resultOrThrow(await db.rpc('consume_telegram_rate_limit', { p_chat_id: String(chatId), p_limit: 25 }));
  if (!rateOk) return reply(chatId, 'Слишком много запросов. Подождите минуту и попробуйте снова.');
  if (command === 'link') return linkAccount(db, message, args);
  if (command === 'start' && /^link_[A-Z0-9]+$/iu.test(args)) return linkAccount(db, message, args.slice(5));
  const account = await getAccount(db, chatId);
  if (!account) {
    if (command === 'help' || command === 'start') return reply(chatId, 'Чтобы подключить аккаунт, откройте раздел Telegram в приложении, создайте одноразовый код и отправьте <code>/link КОД</code>. Код действует 15 минут.');
    return reply(chatId, 'Аккаунт не привязан. В приложении создайте код подключения и отправьте <code>/link КОД</code>.');
  }
  const prefs = await getPrefs(db, account.user_id);
  if (!command) return sendOperationPreview(db, account, message, text, prefs);
  return handleCommand(db, account, message, command, args, prefs);
}
async function updatePendingCategory(db, chatId, token, index, message) {
  const row = resultOrThrow(await db.from('telegram_pending_operations').select('draft,user_id')
    .eq('token', token).eq('telegram_chat_id', String(chatId)).gt('expires_at', new Date().toISOString()).maybeSingle());
  if (!row) return reply(chatId, 'Черновик истёк. Отправьте операцию ещё раз.');
  const profile = await getProfile(db, row.user_id);
  const categories = profile.categories?.[row.draft.type] || [];
  const category = categories[Number(index)];
  if (!category) return reply(chatId, 'Эта категория недоступна.');
  const draft = { ...row.draft, category };
  resultOrThrow(await db.from('telegram_pending_operations').update({ draft }).eq('token', token).eq('telegram_chat_id', String(chatId)));
  const text = `<b>Проверьте операцию</b>\n${draft.type === 'income' ? 'Доход' : 'Расход'}: <b>${draft.type === 'income' ? '+' : '−'}${formatRUB(draft.amount)}</b>\nКатегория: ${escapeHtml(draft.category)}\nДата: ${escapeHtml(dateLabel(draft.date))}\nОписание: ${escapeHtml(draft.note)}\n\nЗапишу её только после подтверждения.`;
  return editMessage(chatId, message.message_id, text, operationKeyboard(token));
}
async function showCategoryPicker(db, chatId, token, message) {
  const row = resultOrThrow(await db.from('telegram_pending_operations').select('draft,user_id')
    .eq('token', token).eq('telegram_chat_id', String(chatId)).gt('expires_at', new Date().toISOString()).maybeSingle());
  if (!row) return reply(chatId, 'Черновик истёк. Отправьте операцию ещё раз.');
  const profile = await getProfile(db, row.user_id);
  const categories = (profile.categories?.[row.draft.type] || ['Другое']).slice(0, 20);
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    rows.push(categories.slice(i, i + 2).map((category, offset) => ({ text: category, callback_data: `op:cat:${token}:${i + offset}` })));
  }
  rows.push([{ text: '← К операции', callback_data: `op:back:${token}` }]);
  return editMessage(chatId, message.message_id, '<b>Выберите категорию</b>', inlineKeyboard(rows));
}
async function handleCallback(db, callback) {
  const chatId = callback.message?.chat?.id;
  const message = callback.message;
  if (!chatId || !message || message.chat.type !== 'private') return;
  const data = String(callback.data || '');
  const account = await getAccount(db, chatId);
  if (!account) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Сначала привяжите аккаунт' }).catch(() => {});
    return reply(chatId, 'Аккаунт не привязан. Создайте код подключения в приложении.');
  }
  const rateOk = resultOrThrow(await db.rpc('consume_telegram_rate_limit', { p_chat_id: String(chatId), p_limit: 25 }));
  if (!rateOk) {
    await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id, text: 'Подождите минуту' }).catch(() => {});
    return;
  }
  await telegramRequest('answerCallbackQuery', { callback_query_id: callback.id }).catch(() => {});
  if (data.startsWith('menu:')) {
    const command = data.slice(5);
    return handleCommand(db, account, { chat: message.chat, text: `/${command}` }, command, '', await getPrefs(db, account.user_id));
  }
  if (data.startsWith('op:')) {
    const [, action, token, value] = data.split(':');
    if (action === 'cancel') {
      resultOrThrow(await db.from('telegram_pending_operations').delete().eq('token', token).eq('telegram_chat_id', String(chatId)));
      return editMessage(chatId, message.message_id, 'Операция отменена. Ничего не записано.');
    }
    if (action === 'categories') return showCategoryPicker(db, chatId, token, message);
    if (action === 'cat') return updatePendingCategory(db, chatId, token, value, message);
    if (action === 'back') {
      const row = resultOrThrow(await db.from('telegram_pending_operations').select('draft').eq('token', token).eq('telegram_chat_id', String(chatId)).maybeSingle());
      if (!row) return editMessage(chatId, message.message_id, 'Черновик истёк. Отправьте операцию ещё раз.');
      const draft = row.draft;
      return editMessage(chatId, message.message_id, `<b>Проверьте операцию</b>\n${draft.type === 'income' ? 'Доход' : 'Расход'}: <b>${draft.type === 'income' ? '+' : '−'}${formatRUB(draft.amount)}</b>\nКатегория: ${escapeHtml(draft.category)}\nДата: ${escapeHtml(dateLabel(draft.date))}\nОписание: ${escapeHtml(draft.note)}`, operationKeyboard(token));
    }
    if (action === 'save') {
      const result = resultOrThrow(await db.rpc('finalize_telegram_operation', { p_token: token, p_chat_id: String(chatId) }));
      if (!result) return editMessage(chatId, message.message_id, 'Черновик истёк или уже обработан.');
      return editMessage(chatId, message.message_id, `✅ <b>Записано</b>\n${result.type === 'income' ? '+' : '−'}${formatRUB(result.amount)} · ${escapeHtml(result.category)}\n${escapeHtml(dateLabel(result.date))} · ${escapeHtml(result.note)}\n\nОтменить можно командой /undo в течение суток.`);
    }
  }
  if (data.startsWith('pref:')) {
    const key = data.slice(5);
    if (!(key in PREF_LABELS)) return;
    const prefs = await getPrefs(db, account.user_id);
    const resultOrThrowUpdate = await db.from('telegram_preferences').update({ [key]: !prefs[key], updated_at: new Date().toISOString() }).eq('user_id', account.user_id);
    if (resultOrThrowUpdate.error) throw new Error(resultOrThrowUpdate.error.message);
    return editMessage(chatId, message.message_id, '<b>Уведомления FinTrack</b>\nВыберите, какие сообщения получать:', preferenceKeyboard({ ...prefs, [key]: !prefs[key] }));
  }
  if (data === 'timezone:menu') {
    return editMessage(chatId, message.message_id, '<b>Часовой пояс напоминаний</b>', inlineKeyboard([
      [{ text: 'Europe/Warsaw', callback_data: 'tz:Europe/Warsaw' }, { text: 'Europe/Moscow', callback_data: 'tz:Europe/Moscow' }],
      [{ text: 'Asia/Yekaterinburg', callback_data: 'tz:Asia/Yekaterinburg' }, { text: 'UTC', callback_data: 'tz:UTC' }], [{ text: '← К уведомлениям', callback_data: 'menu:notifications' }]
    ]));
  }
  if (data.startsWith('tz:')) {
    const timezone = data.slice(3);
    if (!['Europe/Warsaw', 'Europe/Moscow', 'Asia/Yekaterinburg', 'UTC'].includes(timezone)) return;
    const result = await db.from('telegram_preferences').update({ timezone, updated_at: new Date().toISOString() }).eq('user_id', account.user_id);
    if (result.error) throw new Error(result.error.message);
    return editMessage(chatId, message.message_id, `Часовой пояс установлен: <b>${timezone}</b>. Напоминания приходят около 09:00 по местному времени.`, inlineKeyboard([[{ text: 'Настроить уведомления', callback_data: 'menu:notifications' }]]));
  }
  if (data === 'unlink:cancel') return editMessage(chatId, message.message_id, 'Аккаунт оставлен подключённым.');
  if (data === 'unlink:confirm') {
    resultOrThrow(await db.from('telegram_accounts').delete().eq('telegram_chat_id', String(chatId)).eq('user_id', account.user_id));
    return editMessage(chatId, message.message_id, 'Telegram отвязан. Данные в приложении не удалены. Чтобы подключить снова, создайте новый код.');
  }
  if (data === 'undo:cancel') return editMessage(chatId, message.message_id, 'Операция оставлена без изменений.');
  if (data.startsWith('undo:')) {
    const id = Number(data.slice(5));
    if (!Number.isSafeInteger(id)) return;
    const undone = resultOrThrow(await db.rpc('undo_telegram_operation', { p_operation_id: id, p_chat_id: String(chatId) }));
    return editMessage(chatId, message.message_id, undone ? '↩ Операция отменена. Баланс и отчёты обновятся после синхронизации.' : 'Не удалось отменить: операция уже удалена или прошло больше 24 часов.');
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
