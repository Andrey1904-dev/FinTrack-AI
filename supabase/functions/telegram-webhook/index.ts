/* ============================================================================
   telegram-webhook — бот FinTrack AI
   Команды: /start /help /link КОД /unlink /today /month /budget /credits.
   Любая другая фраза — операция: бот показывает карточку с кнопками
   «Сохранить / Другая категория / Отмена» и пишет в базу только после
   подтверждения. Операции бота получают client_id вида «tg-…», поэтому
   дубликатов в истории не появляется.

   Секреты: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (проверяется заголовок
   X-Telegram-Bot-Api-Secret-Token). Клиент — service_role: Telegram не умеет
   JWT, а боту нужно писать во всяческие профили; чужие чаты не могут вызвать
   функцию мимо проверки секрета.
   ========================================================================== */
import { preflight, json, fail } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import { smartParse, type Rule } from '../_shared/parse.ts';
import { sendMessage, answerCallback, confirmKeyboard, categoryKeyboard, money, esc, fmtDate, todayISO } from '../_shared/telegram.ts';

/* черновики операций по чатам (живут в изоляте; карточку можно сохранить
   только сразу после отправки — долгий срок хранения тут не нужен) */
const pending = new Map<string, { draft: any; createdAt: number }>();
const PENDING_TTL = 30 * 60 * 1000;

function keepPending(chatId: string) {
  const now = Date.now();
  for (const [k, v] of pending) if (now - v.createdAt > PENDING_TTL) pending.delete(k);
}

const HELP = [
  '<b>FinTrack AI — бот</b>',
  '',
  '/today — траты за сегодня',
  '/month — итоги месяца',
  '/budget — лимиты и остатки',
  '/credits — ближайшие платежи',
  '/link КОД — привязать аккаунт (код в разделе «Telegram AI» на сайте)',
  '/unlink — отвязать',
  '',
  'Просто напишите трату: «пятёрочка 1200 вчера», «билайн 900», «зарплата 80к».',
].join('\n');

type Profile = any;

async function getLinked(admin: ReturnType<typeof adminClient>, chatId: string) {
  const { data } = await admin.from('telegram_accounts').select('user_id,username').eq('telegram_chat_id', chatId).maybeSingle();
  return data || null;
}

async function getProfile(admin: ReturnType<typeof adminClient>, userId: string): Promise<Profile> {
  const { data } = await admin.from('finance_profiles').select('*').eq('user_id', userId).maybeSingle();
  return data || { budgets: {}, categories: {}, rules: [], settings: {} };
}

function categoriesOf(profile: Profile) {
  const expense = profile?.categories?.expense?.length ? profile.categories.expense : DEFAULT_EXPENSE;
  const income = profile?.categories?.income?.length ? profile.categories.income : DEFAULT_INCOME;
  return { expense, income };
}
const DEFAULT_EXPENSE = ['Продукты', 'Транспорт', 'Жильё', 'Кафе и рестораны', 'Покупки', 'Здоровье', 'Развлечения', 'Связь', 'Мобильный оператор', 'Образование', 'Подписки', 'Кредиты', 'Дети', 'Питомцы', 'Путешествия', 'Другое'];
const DEFAULT_INCOME = ['Зарплата', 'Аванс', 'Подработка', 'Подарки', 'Возврат', 'Продажа', 'Инвестиции', 'Проценты', 'Другое'];

function rulesOf(profile: Profile): Rule[] { return Array.isArray(profile?.rules) ? profile.rules : []; }

/* ---------- карточка операции ---------- */
function draftCard(d: any): string {
  const icon = d.type === 'income' ? '💰 Доход' : '💸 Расход';
  const why = d.why && d.why !== 'LLM' ? `\n<i>${esc(d.why)}</i>` : '';
  return `${icon}\nСумма: <b>${d.amount === null ? '—' : money(d.amount)}</b>\nКатегория: ${esc(d.category)}\nДата: ${fmtDate(d.date)}${d.note ? '\n' + esc(d.note) : ''}${why}`;
}

async function sendDraftCard(token: string, chatId: string, draft: any) {
  const sent = await sendMessage(token, chatId, draftCard(draft) + '\n\nСохранить?', confirmKeyboard());
  pending.set(chatId, { draft, createdAt: Date.now() });
  return sent;
}

/* ---------- отчёты ---------- */
function monthRange(today: string) { return { from: today.slice(0, 8) + '01', to: today.slice(0, 8) + '31' }; }

async function reportToday(admin: ReturnType<typeof adminClient>, userId: string, token: string, chatId: string) {
  const today = todayISO();
  const { data } = await admin.from('finance_operations').select('type,amount,category,note').eq('user_id', userId).eq('date', today);
  const ops = data || [];
  let inc = 0, exp = 0;
  ops.forEach(o => { if (o.type === 'income') inc += Number(o.amount); else exp += Number(o.amount); });
  const lines = ops.slice(0, 10).map(o => `${o.type === 'income' ? '➕' : '➖'} ${money(Number(o.amount))} · ${esc(o.category)}${o.note ? ' — ' + esc(o.note) : ''}`);
  await sendMessage(token, chatId, [
    '<b>Сегодня, ' + fmtDate(today) + '</b>',
    'Доходы: ' + money(inc),
    'Расходы: ' + money(exp),
    ops.length ? '' : '\nОпераци пока нет.',
  ].concat(lines.length ? ['', ...lines] : []).join('\n'));
}

async function reportMonth(admin: ReturnType<typeof adminClient>, userId: string, token: string, chatId: string) {
  const today = todayISO();
  const { from, to } = monthRange(today);
  const { data } = await admin.from('finance_operations').select('type,amount,category').eq('user_id', userId).gte('date', from).lte('date', to);
  const ops = data || [];
  let inc = 0, exp = 0;
  const byCat = new Map<string, number>();
  ops.forEach(o => {
    const v = Number(o.amount);
    if (o.type === 'income') inc += v;
    else {
      exp += v;
      byCat.set(o.category, (byCat.get(o.category) || 0) + v);
    }
  });
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([c, v]) => `• ${esc(c)} — ${money(v)}`);
  await sendMessage(token, chatId, [
    '<b>Месяц ' + today.slice(0, 7) + '</b>',
    'Доходы: <b>' + money(inc) + '</b>',
    'Расходы: <b>' + money(exp) + '</b>',
    'Баланс: ' + money(inc - exp),
    top.length ? '\nТоп расходов:' : '',
    ...top,
  ].filter(Boolean).join('\n'));
}

async function reportBudget(admin: ReturnType<typeof adminClient>, userId: string, token: string, chatId: string) {
  const profile = await getProfile(admin, userId);
  const budgets = profile?.budgets && typeof profile.budgets === 'object' ? profile.budgets : {};
  const entries = Object.entries(budgets).filter(([, v]) => Number(v) > 0);
  if (!entries.length) { await sendMessage(token, chatId, 'Месячные лимиты не заданы. Задайте их на сайте: «Бюджеты».'); return; }
  const today = todayISO();
  const { from, to } = monthRange(today);
  const { data } = await admin.from('finance_operations').select('type,amount,category').eq('user_id', userId).gte('date', from).lte('date', to);
  const spent = new Map<string, number>();
  (data || []).forEach(o => { if (o.type === 'expense') spent.set(o.category, (spent.get(o.category) || 0) + Number(o.amount)); });
  const lines = entries.sort((a, b) => Number(b[1]) - Number(a[1])).map(([cat, limit]) => {
    const s = spent.get(cat) || 0;
    const left = Number(limit) - s;
    const mark = left < 0 ? '🔴' : (s / Number(limit) > 0.8 ? '🟡' : '🟢');
    return `${mark} ${esc(cat)}: ${money(s)} из ${money(Number(limit))} (осталось ${money(left)})`;
  });
  await sendMessage(token, chatId, '<b>Лимиты на месяц</b>\n' + lines.join('\n'));
}

async function reportCredits(admin: ReturnType<typeof adminClient>, userId: string, token: string, chatId: string) {
  const profile = await getProfile(admin, userId);
  const lines: string[] = [];
  (profile?.credits || []).forEach((c: any) => {
    const next = (c.schedule || []).find((p: any) => !p.paid);
    if (next) lines.push(`🏦 ${esc(c.bank)}${c.purpose ? ' (' + esc(c.purpose) + ')' : ''} — ${money(Number(next.amount))}, ${fmtDate(next.date)}`);
    else lines.push(`✅ ${esc(c.bank)} — выплачен`);
  });
  (profile?.credit_cards || []).forEach((c: any) => {
    if (Number(c.used) > 0) lines.push(`💳 ${esc(c.bank)}${c.name ? ' (' + esc(c.name) + ')' : ''} — долг ${money(Number(c.used))}, платёж ${fmtDate(c.paymentDate)}`);
    else lines.push(`✅ ${esc(c.bank)}${c.name ? ' (' + esc(c.name) + ')' : ''} — без долга`);
  });
  await sendMessage(token, chatId, lines.length ? '<b>Ближайшие платежи</b>\n' + lines.join('\n') : 'Кредитов и кредиток нет.');
}

/* ---------- обработка сообщений ---------- */
async function handleMessage(token: string, admin: ReturnType<typeof adminClient>, msg: any) {
  const chatId = String(msg.chat.id);
  const text = String(msg.text || '').trim();
  const linked = await getLinked(admin, chatId);

  if (text.startsWith('/start') || text.startsWith('/help')) {
    await sendMessage(token, chatId, linked ? HELP : 'Сначала привяжите аккаунт: /link КОД (код — в разделе «Telegram AI» на сайте).\n\n' + HELP);
    return;
  }

  if (text.startsWith('/link')) {
    const code = text.split(/\s+/)[1] || '';
    if (!code) { await sendMessage(token, chatId, 'Формат: /link КОД (код из раздела «Telegram AI» на сайте).'); return; }
    const { data: row } = await admin.from('telegram_link_codes').select('id,user_id,expires_at').eq('code', code.toUpperCase()).maybeSingle();
    if (!row) { await sendMessage(token, chatId, 'Код не найден. Обновите код на сайте и попробуйте снова.'); return; }
    if (new Date(row.expires_at).getTime() < Date.now()) { await sendMessage(token, chatId, 'Код истёк. Сгенерируйте новый на сайте.'); return; }
    await admin.from('telegram_accounts').delete().eq('telegram_chat_id', chatId);
    await admin.from('telegram_accounts').upsert({ user_id: row.user_id, telegram_chat_id: chatId, username: msg.from?.username || null }, { onConflict: 'user_id' });
    await admin.from('telegram_link_codes').delete().eq('id', row.id);
    await sendMessage(token, chatId, '✅ Аккаунт привязан. Напишите трату — например, «кофе 350».');
    return;
  }

  if (text.startsWith('/unlink')) {
    await admin.from('telegram_accounts').delete().eq('telegram_chat_id', chatId);
    await sendMessage(token, chatId, 'Аккаунт отвязан.');
    return;
  }

  if (!linked) { await sendMessage(token, chatId, 'Сначала привяжите аккаунт: /link КОД (код — в разделе «Telegram AI» на сайте).'); return; }
  const userId = linked.user_id;

  if (text.startsWith('/today')) return reportToday(admin, userId, token, chatId);
  if (text.startsWith('/month')) return reportMonth(admin, userId, token, chatId);
  if (text.startsWith('/budget')) return reportBudget(admin, userId, token, chatId);
  if (text.startsWith('/credits')) return reportCredits(admin, userId, token, chatId);

  /* обычная фраза → черновик операции */
  const profile = await getProfile(admin, userId);
  const cats = categoriesOf(profile);
  const draft = smartParse(text, cats, rulesOf(profile), todayISO());
  if (draft.amount === null) {
    await sendMessage(token, chatId, 'Не понял сумму. Напишите, например: «кофе 350» или «зарплата 80к».');
    return;
  }
  await sendDraftCard(token, chatId, draft);
}

/* ---------- кнопки ---------- */
async function handleCallback(token: string, admin: ReturnType<typeof adminClient>, q: any) {
  const chatId = String(q.message.chat.id);
  const data = String(q.data || '');
  const linked = await getLinked(admin, chatId);
  if (!linked) { await answerCallback(token, q.id, 'Аккаунт не привязан'); return; }
  const userId = linked.user_id;
  keepPending();
  const p = pending.get(chatId);

  if (data === 'save') {
    if (!p) { await answerCallback(token, q.id, 'Черновик устарел, напишите операцию заново'); return; }
    const d = p.draft;
    const op = {
      user_id: userId, client_id: 'tg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      type: d.type, amount: d.amount, category: d.category, note: d.note || '', date: d.date,
    };
    const { error } = await admin.from('finance_operations').insert(op);
    pending.delete(chatId);
    if (error) { await answerCallback(token, q.id, 'Ошибка сохранения: ' + error.message); return; }
    await answerCallback(token, q.id, 'Сохранено');
    await sendMessage(token, chatId, `✅ ${d.type === 'income' ? 'Доход' : 'Расход'} ${money(Number(d.amount))} · ${esc(d.category)} — записано.`);
    return;
  }

  if (data === 'cat') {
    if (!p) { await answerCallback(token, q.id, 'Черновик устарел'); return; }
    const cats = categoriesOf(await getProfile(admin, userId));
    await answerCallback(token, q.id);
    await sendMessage(token, chatId, 'Какая категория?', categoryKeyboard(cats.expense));
    return;
  }

  if (data.startsWith('set:')) {
    const cat = data.slice(4);
    if (p) p.draft.category = cat;
    await answerCallback(token, q.id, cat);
    if (p) await sendMessage(token, chatId, draftCard(p.draft) + '\n\nСохранить?', confirmKeyboard());
    return;
  }

  if (data === 'back') {
    if (!p) { await answerCallback(token, q.id, 'Черновик устарел'); return; }
    await answerCallback(token, q.id);
    await sendMessage(token, chatId, draftCard(p.draft) + '\n\nСохранить?', confirmKeyboard());
    return;
  }

  if (data === 'cancel') {
    pending.delete(chatId);
    await answerCallback(token, q.id, 'Отменено');
    await sendMessage(token, chatId, 'Операция не сохранена.');
    return;
  }

  await answerCallback(token, q.id);
}

/* ---------- входная точка ---------- */
Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('Только POST', 405);

  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') || '';
  const got = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!secret || got !== secret) return fail('Forbidden', 403);

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') || '';
  if (!token) return fail('TELEGRAM_BOT_TOKEN не задан', 500);

  let update: any;
  try { update = await req.json(); } catch (_e) { return fail('Некорректный JSON', 400); }
  const admin = adminClient();

  try {
    if (update.callback_query) await handleCallback(token, admin, update.callback_query);
    else if (update.message) await handleMessage(token, admin, update.message);
  } catch (e) {
    console.error('webhook error', e);
  }
  return json({ ok: true });
});
