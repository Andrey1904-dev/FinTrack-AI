/* ============================================================================
   render.js — оформление сообщений Telegram-бота (чистые функции, без сети и БД).
   Вся «внешность» бота собрана здесь: карточки, индикаторы прогресса, эмодзи
   категорий, статусы бюджетов. Модуль можно тестировать обычным Node.
   ========================================================================== */
import { formatRUB } from './parser.js';
import { escapeHtml } from './telegram.js';

export const RULE = '━━━━━━━━━━━━━━━━';
const MINUS = '−';

/* ---------- базовые кирпичики ---------- */
export function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
export function bar(ratio, width = 10) {
  const safe = Number.isFinite(ratio) ? clamp(ratio, 0, 1) : 0;
  // любая ненулевая доля видна хотя бы одним сегментом
  const filled = safe > 0 ? Math.max(1, Math.round(safe * width)) : 0;
  return '▰'.repeat(filled) + '▱'.repeat(width - filled);
}
export function percent(part, whole) {
  return Number(whole) > 0 ? Math.round(Number(part) / Number(whole) * 100) : 0;
}
export function money(amount) { return formatRUB(amount); }
export function signed(amount) {
  const value = Number(amount) || 0;
  return `${value < 0 ? MINUS : '+'}${formatRUB(Math.abs(value))}`;
}
export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100, last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}
export function dateLabel(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`));
}
export function dateLong(iso) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`));
}
export function monthTitle(iso) {
  const text = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T12:00:00Z`)).replace(/\s*г\.$/u, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
export function relativeDay(delta) {
  if (delta < 0) return `просрочен на ${-delta} ${plural(-delta, 'день', 'дня', 'дней')}`;
  if (delta === 0) return 'сегодня';
  if (delta === 1) return 'завтра';
  return `через ${delta} ${plural(delta, 'день', 'дня', 'дней')}`;
}

/* Светофор бюджета: зелёный до 80%, жёлтый до 100%, красный при превышении */
export function statusIcon(pct) { return pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢'; }

const CATEGORY_ICONS = [
  [/продукт|еда|супермаркет/iu, '🛒'], [/транспорт|такси|авто|бензин/iu, '🚕'],
  [/жиль|аренд|жкх|коммун|дом/iu, '🏠'], [/кафе|ресторан|кофе/iu, '☕'],
  [/покупк|одежд|обув/iu, '🛍'], [/здоров|аптек|врач|медицин/iu, '💊'],
  [/развлеч|кино|игр|отдых/iu, '🎮'], [/мобильн|связь|интернет/iu, '📱'],
  [/образован|курс|учёб|учеб/iu, '🎓'], [/подписк/iu, '🔁'], [/кредит|долг|ипотек/iu, '🏦'],
  [/дети|ребён|ребен/iu, '🧸'], [/питомц|животн/iu, '🐾'], [/путешеств|отпуск|поездк/iu, '✈️'],
  [/зарплат|аванс/iu, '💼'], [/подработ|фриланс/iu, '🧑‍💻'], [/подар/iu, '🎁'],
  [/возврат|кэшб|кешб/iu, '↩️'], [/продаж/iu, '🏷'], [/инвест|процент|дивиденд/iu, '📈']
];
export function categoryIcon(name) {
  const found = CATEGORY_ICONS.find(([pattern]) => pattern.test(String(name || '')));
  return found ? found[1] : '🔹';
}
const cat = name => `${categoryIcon(name)} ${escapeHtml(name)}`;

/* ---------- приветствие, меню, справка ---------- */
export function greeting(hour) {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 18) return 'Добрый день';
  if (hour >= 18 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}
export function renderMenu({ name = '', hour = 12 } = {}) {
  const who = name ? `, ${escapeHtml(name)}` : '';
  return `💎 <b>FinTrack</b> · центр управления\n${RULE}\n${greeting(hour)}${who}! Ваши финансы под контролем.\n\n` +
    `✍️ <b>Просто напишите</b> — я пойму:\n<code>кофе 250</code> · <code>такси вчера 450</code> · <code>зарплата 80к</code>\n\n` +
    `Выберите раздел ниже 👇`;
}
export function renderWelcome(name) {
  return `🎉 <b>Аккаунт привязан${name ? `, ${escapeHtml(name)}` : ''}!</b>\n${RULE}\n` +
    `Теперь FinTrack работает и здесь, в Telegram:\n` +
    `✅ записывайте траты обычным текстом\n📊 смотрите отчёты, бюджеты и цели\n🔔 получайте напоминания о платежах\n\n` +
    `Попробуйте прямо сейчас: <code>кофе 250</code>`;
}
export function renderHelp() {
  return `📖 <b>Что умеет FinTrack</b>\n${RULE}\n\n` +
    `✍️ <b>Запись операций</b>\nПросто напишите: <code>кофе 250 вчера</code>, <code>зарплата 80к</code>, <code>такси 1 250,50 28.09</code>. Я покажу карточку и запишу только после «Сохранить».\n\n` +
    `📊 <b>Отчёты</b>\n/today — сегодня\n/month — месяц со сравнением\n/balance — баланс за всё время\n/credits — кредиты и карты\n/upcoming — платежи на 14 дней\n/budget — лимиты\n/goals — цели\n/categories — список категорий\n\n` +
    `⚙️ <b>Управление</b>\n<code>/budget set Продукты 30000</code> — месячный лимит\n<code>/budget set week Кафе 5000</code> — недельный лимит\n/notifications — уведомления\n/timezone — часовой пояс\n/undo — отменить последнюю операцию (24 ч)\n/unlink — отвязать Telegram`;
}

/* ---------- операция: карточка, подтверждение, чек ---------- */
export function renderOperationCard(draft, { saved = false, footer = '' } = {}) {
  const income = draft.type === 'income';
  const head = saved ? '✅ <b>Записано</b>' : `🧾 <b>Проверьте операцию</b>`;
  return `${head}\n${RULE}\n${income ? '📈 Доход' : '📉 Расход'}\n` +
    `<b>${income ? '+' : MINUS}${money(draft.amount)}</b>\n\n` +
    `${cat(draft.category)}\n📅 ${escapeHtml(dateLabel(draft.date))}\n📝 ${escapeHtml(draft.note || draft.category)}` +
    (footer ? `\n\n${footer}` : '');
}
export function renderBudgetImpact({ category, spent, limit, period = 'месяц' }) {
  if (!(Number(limit) > 0)) return '';
  const pct = percent(spent, limit);
  const left = Number(limit) - Number(spent);
  const tail = left >= 0 ? `осталось ${money(left)}` : `перерасход ${money(-left)}`;
  return `${statusIcon(pct)} <b>Бюджет · ${escapeHtml(category)}</b> (${period})\n${bar(spent / limit)} ${pct}%\n${money(spent)} из ${money(limit)} · ${tail}`;
}

/* ---------- отчёты ---------- */
export function totalsOf(rows) {
  let income = 0, expense = 0;
  for (const row of rows) {
    if (row.type === 'income') income += Number(row.amount);
    else if (row.type === 'expense') expense += Number(row.amount);
  }
  const round = v => Math.round(v * 100) / 100;
  return { income: round(income), expense: round(expense), balance: round(income - expense) };
}
export function topExpenseCategories(rows, limit = 5) {
  const map = new Map();
  for (const row of rows) if (row.type === 'expense') map.set(row.category, (map.get(row.category) || 0) + Number(row.amount));
  return [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
function trendLine(current, previous, label) {
  if (!(previous > 0)) return '';
  const diff = Math.round((current - previous) / previous * 100);
  if (diff === 0) return `➖ Расходы как ${label}`;
  return diff < 0
    ? `🟢 Расходы на ${-diff}% ниже, чем ${label}`
    : `🟠 Расходы на ${diff}% выше, чем ${label}`;
}
/* rows — операции периода; previous — итоги сравнимого периода (необязательно);
   days — сколько дней прошло в периоде (для среднего в день) */
export function renderReport({ title, icon = '📊', rows, previous = null, previousLabel = '', days = 0, showRecent = 0 }) {
  const totals = totalsOf(rows);
  const lines = [`${icon} <b>${escapeHtml(title)}</b>`, RULE];
  if (!rows.length) {
    lines.push('Операций пока нет.', '', '✍️ Напишите, например: <code>кофе 250</code>');
    return lines.join('\n');
  }
  lines.push(`📈 Доходы   <b>${money(totals.income)}</b>`, `📉 Расходы  <b>${money(totals.expense)}</b>`,
    `💎 Баланс   <b>${signed(totals.balance)}</b>`);
  if (totals.income > 0 && totals.balance > 0) {
    lines.push('', `🏦 Сберегли <b>${percent(totals.balance, totals.income)}%</b> дохода`, bar(totals.balance / totals.income));
  }
  if (days > 1 && totals.expense > 0) lines.push('', `⏱ В среднем <b>${money(totals.expense / days)}</b> в день`);
  if (previous) {
    const trend = trendLine(totals.expense, previous.expense, previousLabel);
    if (trend) lines.push(trend);
  }
  const top = topExpenseCategories(rows);
  if (top.length) {
    lines.push('', '🔥 <b>Куда уходят деньги</b>');
    for (const [name, amount] of top) {
      lines.push(`${cat(name)} — <b>${money(amount)}</b> · ${percent(amount, totals.expense)}%`, bar(amount / totals.expense));
    }
  }
  if (showRecent > 0) {
    const recent = rows.slice(0, showRecent);
    lines.push('', `🕘 <b>Последние операции</b>`);
    for (const row of recent) {
      lines.push(`${categoryIcon(row.category)} ${escapeHtml(row.note || row.category)} — ${row.type === 'income' ? '+' : MINUS}${money(row.amount)}`);
    }
    if (rows.length > recent.length) lines.push(`… и ещё ${rows.length - recent.length}`);
  }
  return lines.join('\n');
}
export function renderBalance(rows) {
  const totals = totalsOf(rows);
  return `💰 <b>Баланс за всё время</b>\n${RULE}\n<b>${signed(totals.balance)}</b>\n\n📈 Доходы: ${money(totals.income)}\n📉 Расходы: ${money(totals.expense)}\n🧾 Операций: ${rows.length}`;
}

/* ---------- бюджеты ---------- */
export function renderBudgets({ monthly, weekly }) {
  const block = (title, items) => {
    if (!items.length) return [];
    const lines = ['', `<b>${title}</b>`];
    for (const item of [...items].sort((a, b) => b.spent / b.limit - a.spent / a.limit)) {
      const pct = percent(item.spent, item.limit);
      const left = item.limit - item.spent;
      lines.push(`${statusIcon(pct)} <b>${escapeHtml(item.category)}</b> — ${pct}%`, `${bar(item.spent / item.limit)}`,
        `${money(item.spent)} из ${money(item.limit)} · ${left >= 0 ? `осталось ${money(left)}` : `перерасход ${money(-left)}`}`);
    }
    return lines;
  };
  const lines = ['🎯 <b>Бюджеты</b>', RULE, ...block('📆 На месяц', monthly), ...block('🗓 На неделю', weekly)];
  if (!monthly.length && !weekly.length) lines.push('Лимиты пока не настроены.');
  lines.push('', '💡 <code>/budget set Продукты 30000</code>', '<code>/budget set week Кафе 5000</code> · 0 — удалить лимит');
  return lines.join('\n');
}

/* ---------- цели ---------- */
export function renderGoals(goals) {
  const lines = ['🏆 <b>Финансовые цели</b>', RULE];
  for (const goal of goals.slice(0, 10)) {
    const target = Number(goal.target) || 0, saved = Number(goal.saved) || 0;
    const pct = target ? Math.min(100, percent(saved, target)) : 0;
    const icon = pct >= 100 ? '🏁' : pct >= 50 ? '🚀' : '🎯';
    lines.push('', `${icon} <b>${escapeHtml(goal.name || 'Цель')}</b> — ${pct}%`, bar(target ? saved / target : 0),
      `${money(saved)} из ${money(target)}${target > saved ? ` · осталось ${money(target - saved)}` : ' · достигнута 🎉'}`);
  }
  return lines.join('\n');
}

/* ---------- кредиты и платежи ---------- */
export function renderCredits({ credits, cards }) {
  const lines = ['🏦 <b>Кредиты и кредитные карты</b>', RULE];
  let total = 0;
  for (const credit of credits) {
    total += credit.remaining;
    lines.push('', `🏦 <b>${escapeHtml(credit.title)}</b>`, `Долг: <b>${money(credit.remaining)}</b>`);
    lines.push(credit.next
      ? `📅 Платёж <b>${money(credit.next.amount)}</b> · ${escapeHtml(dateLabel(credit.next.date))} (${relativeDay(credit.next.delta)})`
      : '✅ График закрыт');
  }
  for (const card of cards) {
    total += card.used;
    lines.push('', `💳 <b>${escapeHtml(card.title)}</b>`, `Долг: <b>${money(card.used)}</b> · минимум ${money(card.minimum)}`);
    if (card.limit > 0) lines.push(`${bar(card.used / card.limit)} ${percent(card.used, card.limit)}% лимита`);
    if (card.used > 0 && card.date) lines.push(`📅 Дата платежа: ${escapeHtml(dateLabel(card.date))} (${relativeDay(card.delta)})`);
  }
  lines.push('', RULE, `Общий долг: <b>${money(total)}</b>`);
  return lines.join('\n');
}
export function renderUpcoming(items) {
  if (!items.length) return `🗓 <b>Ближайшие платежи</b>\n${RULE}\n✨ На ближайшие 14 дней платежей нет.`;
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const lines = ['🗓 <b>Ближайшие платежи</b>', RULE];
  for (const item of items) {
    const icon = item.delta < 0 ? '🔴' : item.delta <= 1 ? '🟠' : item.delta <= 3 ? '🟡' : '🟢';
    lines.push(`${icon} <b>${escapeHtml(item.name)}</b> — ${money(item.amount)}`, `     ${escapeHtml(dateLabel(item.date))} · ${relativeDay(item.delta)}`);
  }
  lines.push('', RULE, `Итого к оплате: <b>${money(total)}</b>`);
  return lines.join('\n');
}

/* ---------- настройки ---------- */
export function renderPreferences() {
  return `🔔 <b>Уведомления FinTrack</b>\n${RULE}\nВключайте только нужное. Кредитные напоминания приходят за 3 дня, за день и в день платежа, в 09:00–21:00 по вашему часовому поясу.`;
}
export function renderCategories({ expense, income }) {
  const list = items => items.length ? items.map(cat).join('\n') : '—';
  return `🗂 <b>Категории</b>\n${RULE}\n\n📉 <b>Расходы</b>\n${list(expense)}\n\n📈 <b>Доходы</b>\n${list(income)}`;
}

/* ---------- уведомления (их шлёт планировщик) ---------- */
export function renderCreditAlert({ name, wording, amount, urgent }) {
  return `${urgent ? '🚨' : '🔔'} <b>${escapeHtml(name)}</b>\n${RULE}\n${wording}\n💳 Сумма: <b>${money(amount)}</b>\n\n<i>Проверьте график платежей в приложении.</i>`;
}
export function renderRecurringAlert({ name, timing, amount, category }) {
  return `⏰ <b>${escapeHtml(name)}</b>\n${RULE}\n${timing}\n💳 Сумма: <b>${money(amount)}</b>\n${cat(category || 'Другое')}`;
}
export function renderBudgetAlert({ category, spent, limit, threshold, period }) {
  const over = threshold >= 100;
  return `${over ? '🚨' : '⚠️'} <b>${over ? 'Лимит исчерпан' : 'Почти лимит'}</b> · ${escapeHtml(category)}\n${RULE}\n` +
    `${bar(spent / limit)} ${percent(spent, limit)}%\n${money(spent)} из ${money(limit)} (${period === 'week' ? 'неделя' : 'месяц'})\n\n` +
    (over ? '<i>Стоит притормозить с тратами в этой категории.</i>' : '<i>Использовано не менее 80% лимита.</i>');
}
export function renderWeeklyDigest({ from, to, rows }) {
  const totals = totalsOf(rows);
  const top = topExpenseCategories(rows, 3);
  const lines = [`🗓 <b>Итоги недели</b>`, `${escapeHtml(dateLabel(from))} — ${escapeHtml(dateLabel(to))}`, RULE,
    `📈 Доходы   <b>${money(totals.income)}</b>`, `📉 Расходы  <b>${money(totals.expense)}</b>`, `💎 Баланс   <b>${signed(totals.balance)}</b>`];
  if (top.length) {
    lines.push('', '🔥 <b>Главные траты</b>');
    top.forEach(([name, amount], index) => lines.push(`${['🥇', '🥈', '🥉'][index]} ${cat(name)} — ${money(amount)} · ${percent(amount, totals.expense)}%`));
  }
  return lines.join('\n');
}
