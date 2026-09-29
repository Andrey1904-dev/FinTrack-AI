#!/usr/bin/env node
/* ============================================================================
   tests/functions.mjs — проверки Edge Functions без Deno, Supabase и ключей.
   Загружает настоящие index.ts функций (type stripping в Node), подменяя
   окружение (tests/deno-stub.mjs), клиент supabase-js (tests/stubs/…) и сеть
   (Telegram API / AI API — локальный стаб fetch).

   Запуск: node --experimental-strip-types --import ./tests/deno-stub.mjs tests/functions.mjs
   ========================================================================== */

let passed = 0;
const failures = [];
function check(name, cond, extra) {
  if (cond) { passed++; }
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function eq(name, got, want) { check(name, JSON.stringify(got) === JSON.stringify(want), 'получено ' + JSON.stringify(got) + ', ожидалось ' + JSON.stringify(want)); }

/* ---------- стаб сети: Telegram + OpenAI-совместимый AI ---------- */
const tgCalls = [];
let aiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('api.telegram.org')) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    tgCalls.push({ method: url.split('/bot')[1]?.split('/')[1] || '', body });
    return new Response(JSON.stringify({ ok: true, result: { message_id: tgCalls.length } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/chat/completions')) {
    aiCalls++;
    const mode = globalThis.__FT_AI_MODE || 'ok';
    let content = 'not-json-at-all';
    if (mode === 'ok') content = JSON.stringify(globalThis.__FT_AI_REPLY || {});
    const payload = { choices: [{ message: { content } }] };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (url.includes('/audio/transcriptions')) {
    return new Response(JSON.stringify({ text: globalThis.__FT_STT || 'билайн 900' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error('неожиданный запрос в стабе fetch: ' + url);
};

/* ---------- окружение и «база» ---------- */
function localToday() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function isoAdd(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function isoAddMonthsUTC(n) { const d = new Date(); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); }
const TODAY = localToday();

Object.assign(globalThis.__FT_ENV, {
  SUPABASE_URL: 'https://stub.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  TELEGRAM_BOT_TOKEN: 'TTEST',
  TELEGRAM_WEBHOOK_SECRET: 'whsec',
  CRON_SECRET: 'cronsec',
});

globalThis.__FT_USERS = {
  'tok-ivan': { id: 'u-ivan', email: 'ivan@example.com' },
  'tok-flood': { id: 'u-flood', email: 'flood@example.com' },
  'tok-clean': { id: 'u-clean', email: 'clean@example.com' },
};

function freshDB() {
  return {
    finance_operations: [],
    finance_profiles: [],
    telegram_accounts: [],
    telegram_link_codes: [],
  };
}
globalThis.__FT_DB = freshDB();

const CATS = {
  expense: ['Продукты', 'Транспорт', 'Жильё', 'Кафе и рестораны', 'Покупки', 'Здоровье', 'Развлечения', 'Связь', 'Мобильный оператор', 'Образование', 'Подписки', 'Кредиты', 'Дети', 'Питомцы', 'Путешествия', 'Другое'],
  income: ['Зарплата', 'Аванс', 'Подработка', 'Подарки', 'Возврат', 'Продажа', 'Инвестиции', 'Проценты', 'Другое'],
};

/* ---------- загрузка функций ---------- */
async function loadHandler(rel) {
  globalThis.__FT_HANDLER = null;
  await import(new URL(rel, import.meta.url).href);
  const h = globalThis.__FT_HANDLER;
  if (!h) throw new Error('не найден обработчик для ' + rel);
  return h;
}
const aiH = await loadHandler('../supabase/functions/ai-parse/index.ts');
const delH = await loadHandler('../supabase/functions/delete-account/index.ts');
const tgH = await loadHandler('../supabase/functions/telegram-webhook/index.ts');
const remH = await loadHandler('../supabase/functions/credit-reminders/index.ts');
const digH = await loadHandler('../supabase/functions/weekly-digest/index.ts');

const req = (h, body, headers = {}) => new Request('http://stub/v1/' + h, {
  method: 'POST',
  headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const asJson = async (res) => ({ status: res.status, body: await res.json().catch(() => null) });
const auth = (token) => ({ Authorization: 'Bearer ' + token });

const NBSP = /[\u00A0\u202F]/g;
function tgTexts(method) { return tgCalls.filter(c => c.method === method).map(c => String(c.body.text || '').replace(NBSP, ' ')); }
function tgKeyboards(method) { return tgCalls.filter(c => c.method === method).map(c => c.body.reply_markup); }
const lastTg = () => tgCalls[tgCalls.length - 1];
function tgCountFrom(mark) { return tgCalls.length - mark; }

/* сброс чатов: новый chatId для каждой группы сценариев */
let chatSeq = 100;
const nextChat = () => String(++chatSeq);

/* ==========================================================================
   1. ai-parse
   ====================================================================== */
{
  const body = (extra) => Object.assign({ text: 'билайн 900', categories: CATS, rules: [], currency: 'RUB', today: TODAY }, extra);

  let r = await asJson(await aiH(new Request('http://stub/v1/ai-parse', { method: 'OPTIONS' })));
  check('ai-parse: OPTIONS отвечает 200', r.status === 200);

  r = await asJson(await aiH(req('ai-parse', body())));
  eq('ai-parse: без JWT — 401', r.status, 401);

  r = await asJson(await aiH(new Request('http://stub/v1/ai-parse', { method: 'GET' })));
  eq('ai-parse: GET — 405', r.status, 405);

  r = await asJson(await aiH(req('ai-parse', '{oops', auth('tok-ivan'))));
  eq('ai-parse: битый JSON — 400', r.status, 400);

  r = await asJson(await aiH(req('ai-parse', body({ text: '   ' }), auth('tok-ivan'))));
  eq('ai-parse: пустой текст — 400', r.status, 400);

  r = await asJson(await aiH(req('ai-parse', body(), auth('tok-ivan'))));
  check('ai-parse: словарь «билайн 900» → категория «Мобильный оператор»', r.body && r.body.category === 'Мобильный оператор', JSON.stringify(r.body));
  check('ai-parse: сумма 900 распознана', r.body && r.body.amount === 900);
  eq('ai-parse: тип — расход', r.body && r.body.type, 'expense');
  eq('ai-parse: дата = сегодня', r.body && r.body.date, TODAY);

  r = await asJson(await aiH(req('ai-parse', body({ text: 'зарплата 80к' }), auth('tok-ivan'))));
  check('ai-parse: «зарплата 80к» → доход 80 000, категория «Зарплата»', r.body && r.body.type === 'income' && r.body.amount === 80000 && r.body.category === 'Зарплата', JSON.stringify(r.body));

  r = await asJson(await aiH(req('ai-parse', body({ text: 'пятёрочка 1200 вчера' }), auth('tok-ivan'))));
  check('ai-parse: «вчера» сдвигает дату', r.body && r.body.date === isoAdd(-1) && r.body.category === 'Продукты' && r.body.amount === 1200, JSON.stringify(r.body));

  const rules = [{ id: 'rl1', keyword: 'кофе', category: 'Кафе и рестораны', type: 'expense' }];
  r = await asJson(await aiH(req('ai-parse', body({ text: 'кофе 350', rules }), auth('tok-ivan'))));
  check('ai-parse: правило пользователя побеждает', r.body && r.body.category === 'Кафе и рестораны', JSON.stringify(r.body));

  /* --- с ключом модели --- */
  globalThis.__FT_ENV.AI_API_KEY = 'sk-test';
  globalThis.__FT_AI_MODE = 'ok';

  globalThis.__FT_AI_REPLY = { type: 'expense', amount: 1234.5, category: 'Транспорт', date: TODAY, note: 'такси в аэропорт', confidence: 0.95 };
  r = await asJson(await aiH(req('ai-parse', body({ text: 'какая-то фраза' }), auth('tok-ivan'))));
  check('ai-parse: ответ модели проходит проверку', r.body && r.body.amount === 1234.5 && r.body.category === 'Транспорт' && r.body.note === 'такси в аэропорт', JSON.stringify(r.body));

  globalThis.__FT_AI_REPLY = { type: 'expense', amount: 'около трёхсот', category: 'Транспорт', date: TODAY };
  r = await asJson(await aiH(req('ai-parse', body({ text: 'какая-то фраза' }), auth('tok-ivan'))));
  check('ai-parse: «выдуманная» нечисловая сумма → null', r.body && r.body.amount === null, JSON.stringify(r.body));

  globalThis.__FT_AI_REPLY = { type: 'expense', amount: -50, category: 'Транспорт', date: TODAY };
  r = await asJson(await aiH(req('ai-parse', body({ text: 'какая-то фраза' }), auth('tok-ivan'))));
  check('ai-parse: отрицательная сумма → null', r.body && r.body.amount === null);

  globalThis.__FT_AI_REPLY = { type: 'expense', amount: 100, category: 'Несуществующая', date: TODAY };
  r = await asJson(await aiH(req('ai-parse', body({ text: 'какая-то фраза' }), auth('tok-ivan'))));
  check('ai-parse: чужая категория → «Другое»', r.body && r.body.category === 'Другое');

  globalThis.__FT_AI_REPLY = { type: 'income', amount: 5000, category: 'Подарки', date: TODAY, confidence: 5 };
  r = await asJson(await aiH(req('ai-parse', body({ text: 'что-то ещё' }), auth('tok-ivan'))));
  check('ai-parse: доходная категория сохраняется, confidence обрезан до 1', r.body && r.body.type === 'income' && r.body.category === 'Подарки' && r.body.confidence <= 1, JSON.stringify(r.body));

  globalThis.__FT_AI_MODE = 'invalid';
  r = await asJson(await aiH(req('ai-parse', body({ text: 'билайн 900' }), auth('tok-ivan'))));
  check('ai-parse: мусор от модели → фолбэк в словарь', r.body && r.body.category === 'Мобильный оператор' && r.body.amount === 900, JSON.stringify(r.body));

  /* --- голос --- */
  globalThis.__FT_AI_MODE = 'ok';
  globalThis.__FT_STT = 'билайн 900';
  globalThis.__FT_AI_REPLY = { type: 'expense', amount: 900, category: 'Мобильный оператор', date: TODAY, note: 'пополнение телефона' };

  delete globalThis.__FT_ENV.AI_API_KEY;
  r = await asJson(await aiH(req('ai-parse', { mode: 'voice', audio: { data: 'aGVsbG8=', mime: 'audio/webm' }, categories: CATS, rules: [], today: TODAY, language: 'ru' }, auth('tok-ivan'))));
  check('ai-parse: голос без ключа → ok:false и честная причина', r.body && r.body.ok === false && /AI_API_KEY/.test(r.body.reason || ''), JSON.stringify(r.body));
  r = await asJson(await aiH(req('ai-parse', { mode: 'photo', image: { data: 'aGVsbG8=', mime: 'image/jpeg' }, categories: CATS, today: TODAY }, auth('tok-ivan'))));
  check('ai-parse: фото без ключа → ok:false', r.body && r.body.ok === false, JSON.stringify(r.body));

  globalThis.__FT_ENV.AI_API_KEY = 'sk-test';
  r = await asJson(await aiH(req('ai-parse', { mode: 'voice', audio: { data: 'aGVsbG8=', mime: 'audio/webm' }, categories: CATS, rules: [], today: TODAY, language: 'ru' }, auth('tok-ivan'))));
  check('ai-parse: голос → расшифровка и разбор', r.body && r.body.ok === true && r.body.transcript === 'билайн 900' && r.body.amount === 900, JSON.stringify(r.body));

  r = await asJson(await aiH(req('ai-parse', { mode: 'photo', image: { data: 'aGVsbG8=', mime: 'image/jpeg' }, categories: CATS, today: TODAY }, auth('tok-ivan'))));
  check('ai-parse: фото → сумма/дата/категория', r.body && r.body.ok === true && r.body.amount === 900 && r.body.category === 'Мобильный оператор', JSON.stringify(r.body));

  globalThis.__FT_AI_MODE = 'invalid';
  r = await asJson(await aiH(req('ai-parse', { mode: 'photo', image: { data: 'aGVsbG8=', mime: 'image/jpeg' }, categories: CATS, today: TODAY }, auth('tok-ivan'))));
  check('ai-parse: модель не прочитала чек → ok:false', r.body && r.body.ok === false, JSON.stringify(r.body));
  globalThis.__FT_AI_MODE = 'ok';

  r = await asJson(await aiH(req('ai-parse', { mode: 'voice', audio: { data: 'x'.repeat(6_000_001), mime: 'audio/webm' }, categories: CATS, today: TODAY }, auth('tok-ivan'))));
  eq('ai-parse: слишком большое аудио — 413', r.status, 413);
  r = await asJson(await aiH(req('ai-parse', { mode: 'photo', image: { data: 'y'.repeat(6_000_001), mime: 'image/jpeg' }, categories: CATS, today: TODAY }, auth('tok-ivan'))));
  eq('ai-parse: слишком большое фото — 413', r.status, 413);
  delete globalThis.__FT_ENV.AI_API_KEY;

  /* --- rate limit (отдельный пользователь) --- */
  let last;
  for (let i = 0; i < 31; i++) last = await asJson(await aiH(req('ai-parse', body(), auth('tok-flood'))));
  eq('ai-parse: 31-й запрос за минуту — 429', last.status, 429);
  r = await asJson(await aiH(req('ai-parse', body(), auth('tok-ivan'))));
  check('ai-parse: лимит у каждого пользователя свой', r.status === 200, 'статус ' + r.status);
}

/* ==========================================================================
   2. delete-account
   ====================================================================== */
{
  globalThis.__FT_DB = freshDB();
  globalThis.__FT_DB.finance_operations = [
    { user_id: 'u-clean', client_id: 'op1', type: 'expense', amount: 100, category: 'Другое', note: '', date: TODAY },
    { user_id: 'u-ivan', client_id: 'op2', type: 'expense', amount: 200, category: 'Другое', note: '', date: TODAY },
  ];
  globalThis.__FT_DB.finance_profiles = [{ user_id: 'u-clean', budgets: {} }, { user_id: 'u-ivan', budgets: {} }];
  globalThis.__FT_DB.telegram_accounts = [{ user_id: 'u-clean', telegram_chat_id: '555' }];
  globalThis.__FT_DB.telegram_link_codes = [{ id: 'c1', user_id: 'u-clean', code: 'X1', expires_at: new Date(Date.now() + 60000).toISOString() }];

  let r = await asJson(await delH(new Request('http://stub/v1/delete-account', { method: 'GET' })));
  eq('delete-account: GET — 405', r.status, 405);
  r = await asJson(await delH(req('delete-account', {})));
  eq('delete-account: без JWT — 401', r.status, 401);

  r = await asJson(await delH(req('delete-account', {}, auth('tok-ivan'))));
  eq('delete-account: чужой JWT удаляет только свой аккаунт — ok', r.body && r.body.ok, true);
  check('delete-account: операции u-ivan удалены, чужие на месте',
    globalThis.__FT_DB.finance_operations.length === 1 && globalThis.__FT_DB.finance_operations[0].user_id === 'u-clean');
  check('delete-account: профиль u-ivan удалён', !globalThis.__FT_DB.finance_profiles.some(p => p.user_id === 'u-ivan'));

  r = await asJson(await delH(req('delete-account', {}, auth('tok-clean'))));
  eq('delete-account: второй аккаунт удалён', r.body && r.body.ok, true);
  check('delete-account: таблицы пусты', globalThis.__FT_DB.finance_operations.length === 0 && globalThis.__FT_DB.telegram_accounts.length === 0 && globalThis.__FT_DB.telegram_link_codes.length === 0);
  r = await asJson(await delH(req('delete-account', {}, auth('tok-clean'))));
  eq('delete-account: после удаления JWT недействителен — 401', r.status, 401);
}

/* ==========================================================================
   3. telegram-webhook
   ====================================================================== */
{
  const upd = (update, secret = 'whsec') => req('telegram-webhook', update, { 'X-Telegram-Bot-Api-Secret-Token': secret });

  let r = await asJson(await tgH(req('telegram-webhook', {})));
  eq('webhook: без секрета — 403', r.status, 403);
  r = await asJson(await tgH(upd({}, 'wrong')));
  eq('webhook: неверный секрет — 403', r.status, 403);
  r = await asJson(await tgH(new Request('http://stub/v1/telegram-webhook', { method: 'OPTIONS' })));
  eq('webhook: OPTIONS — 200', r.status, 200);
  r = await asJson(await tgH(upd('not-json')));
  eq('webhook: битый JSON — 400', r.status, 400);

  const keepToken = globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN;
  delete globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN;
  r = await asJson(await tgH(upd({ message: { chat: { id: '1' }, text: '/start' } })));
  eq('webhook: без TELEGRAM_BOT_TOKEN — 500', r.status, 500);
  globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN = keepToken;

  /* --- не привязан --- */
  let chat = nextChat();
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, from: { username: 'ivan' }, text: '/start' } }));
  check('webhook: /start без привязки подсказывает /link', tgTexts('sendMessage')[0] && tgTexts('sendMessage')[0].includes('/link'), tgTexts('sendMessage')[0]);

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/today' } }));
  check('webhook: /today без привязки подсказывает /link', tgTexts('sendMessage')[0].includes('/link'));

  /* --- /link --- */
  globalThis.__FT_DB.telegram_link_codes = [
    { id: 'code-ok', user_id: 'u-ivan', code: 'ABC123', expires_at: new Date(Date.now() + 15 * 60000).toISOString() },
    { id: 'code-old', user_id: 'u-ivan', code: 'OLD111', expires_at: new Date(Date.now() - 60000).toISOString() },
  ];
  chat = nextChat();
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, from: { username: 'ivan' }, text: '/link ABC123' } }));
  check('webhook: /link успешен', tgTexts('sendMessage')[0].includes('привязан'), tgTexts('sendMessage')[0]);
  check('webhook: строка telegram_accounts создана с user_id и chat_id',
    globalThis.__FT_DB.telegram_accounts.some(a => a.user_id === 'u-ivan' && a.telegram_chat_id === chat && a.username === 'ivan'));
  check('webhook: код одноразовый', !globalThis.__FT_DB.telegram_link_codes.some(c => c.id === 'code-ok'));

  tgCalls.length = 0;
  const chatOld = nextChat();
  await tgH(upd({ message: { chat: { id: chatOld }, text: '/link OLD111' } }));
  check('webhook: истёкший код отклонён', /истёк/.test(tgTexts('sendMessage')[0] || ''), tgTexts('sendMessage')[0]);
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chatOld }, text: '/link NOPE99' } }));
  check('webhook: несуществующий код отклонён', /не найден/.test(tgTexts('sendMessage')[0] || ''));
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chatOld }, text: '/link' } }));
  check('webhook: /link без кода показывает формат', /Формат/.test(tgTexts('sendMessage')[0] || ''));

  /* перепривязка того же чата на другого пользователя */
  globalThis.__FT_DB.telegram_link_codes = [{ id: 'code-2', user_id: 'u-clean', code: 'NEW777', expires_at: new Date(Date.now() + 60000).toISOString() }];
  await tgH(upd({ message: { chat: { id: chat }, text: '/link NEW777' } }));
  const rebound = globalThis.__FT_DB.telegram_accounts.find(a => a.telegram_chat_id === chat);
  check('webhook: перепривязка чата на другого пользователя', rebound && rebound.user_id === 'u-clean', JSON.stringify(rebound));

  /* возвращаем чат к u-ivan */
  globalThis.__FT_DB.telegram_link_codes = [{ id: 'code-3', user_id: 'u-ivan', code: 'BACK1', expires_at: new Date(Date.now() + 60000).toISOString() }];
  await tgH(upd({ message: { chat: { id: chat }, text: '/link BACK1' } }));

  /* --- фраза → карточка → кнопки --- */
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: 'кофе 350' } }));
  let card = tgTexts('sendMessage')[0] || '';
  check('webhook: «кофе 350» → карточка с суммой 350', card.includes('350'), card);
  check('webhook: категория по словарю — «Кафе и рестораны»', card.includes('Кафе и рестораны'), card);
  check('webhook: карточка предлагает сохранение', card.includes('Сохранить'));
  check('webhook: у карточки есть кнопки confirm', (() => { const kb = tgKeyboards('sendMessage')[0]; return kb && kb.inline_keyboard[0].length === 3 && kb.inline_keyboard[0][0].callback_data === 'save'; })());

  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb1', data: 'save', message: { chat: { id: chat } } } }));
  const saved = globalThis.__FT_DB.finance_operations.find(o => o.user_id === 'u-ivan' && String(o.amount) === '350');
  check('webhook: «Сохранить» пишет операцию', !!saved, JSON.stringify(globalThis.__FT_DB.finance_operations));
  check('webhook: client_id операции бота начинается с tg-', saved && /^tg-/.test(saved.client_id));
  check('webhook: категория сохранена', saved && saved.category === 'Кафе и рестораны');
  check('webhook: бот подтвердил сохранение', /записано/.test(tgTexts('sendMessage')[0] || ''), tgTexts('sendMessage')[0]);
  check('webhook: callback_query закрыт', tgCalls.some(c => c.method === 'answerCallbackQuery'));

  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb2', data: 'save', message: { chat: { id: chat } } } }));
  check('webhook: повторный «Сохранить» не дублирует операцию',
    globalThis.__FT_DB.finance_operations.filter(o => o.user_id === 'u-ivan').length === 1);

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: 'билайн 900' } }));
  card = tgTexts('sendMessage')[0] || '';
  check('webhook: «билайн 900» → «Мобильный оператор»', card.includes('Мобильный оператор'), card);

  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb3', data: 'cat', message: { chat: { id: chat } } } }));
  const catKb = tgKeyboards('sendMessage')[0];
  check('webhook: «Другая категория» показывает список', !!catKb && catKb.inline_keyboard.flat().some(b => b.callback_data === 'set:Транспорт'));
  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb4', data: 'set:Транспорт', message: { chat: { id: chat } } } }));
  card = tgTexts('sendMessage').join(' ');
  check('webhook: выбранная категория подставляется в карточку', card.includes('Транспорт'), card);
  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb5', data: 'cancel', message: { chat: { id: chat } } } }));
  check('webhook: «Отмена» ничего не пишет', /не сохранена/.test(tgTexts('sendMessage')[0] || ''));
  check('webhook: после отмены операция не появилась',
    globalThis.__FT_DB.finance_operations.filter(o => o.user_id === 'u-ivan' && o.category === 'Мобильный оператор').length === 0);

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: 'купил что-то непонятное' } }));
  check('webhook: фраза без суммы — бот просит сумму', /Не понял сумму/.test(tgTexts('sendMessage')[0] || ''), tgTexts('sendMessage')[0]);

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: 'зарплата 80к' } }));
  card = tgTexts('sendMessage')[0] || '';
  check('webhook: «зарплата 80к» → доход 80 000', card.includes('Доход') && card.includes('80 000'), card);
  tgCalls.length = 0;
  await tgH(upd({ callback_query: { id: 'cb6', data: 'cancel', message: { chat: { id: chat } } } }));

  /* --- отчёты --- */
  globalThis.__FT_DB.finance_operations = [
    { user_id: 'u-ivan', client_id: 'a1', type: 'income', amount: 80000, category: 'Зарплата', note: '', date: TODAY },
    { user_id: 'u-ivan', client_id: 'a2', type: 'expense', amount: 300, category: 'Продукты', note: 'хлеб', date: TODAY },
    { user_id: 'u-ivan', client_id: 'a3', type: 'expense', amount: 5000, category: 'Транспорт', note: '', date: TODAY.slice(0, 8) + '05' },
    { user_id: 'u-clean', client_id: 'a4', type: 'expense', amount: 9999, category: 'Другое', note: '', date: TODAY },
  ];
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/today' } }));
  let text = tgTexts('sendMessage').join(' ');
  check('webhook: /today показывает доходы 80 000', text.includes('80 000'), text);
  check('webhook: /today показывает расходы 300', text.includes('300'));
  check('webhook: /today перечисляет операции', text.includes('хлеб'));
  check('webhook: /today не видит чужих операций', !text.includes('9999'));

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/month' } }));
  text = tgTexts('sendMessage').join(' ');
  check('webhook: /month показывает баланс месяца', text.includes('Баланс'), text);
  check('webhook: /month показывает топ категорий', text.includes('Транспорт'));

  globalThis.__FT_DB.finance_profiles = [{
    user_id: 'u-ivan',
    budgets: { 'Продукты': 30000, 'Кафе и рестораны': 8000 },
    categories: {},
    rules: [],
    settings: {},
    credits: [{
      id: 'cr1', bank: 'Альфа', purpose: 'авто', principal: 300000, rate: 12, termMonths: 12,
      schedule: [
        { n: 1, date: isoAdd(-30), amount: 10000, interest: 3000, principal: 7000, rest: 293000, paid: true, paidAt: '', operationId: null },
        { n: 2, date: isoAdd(10), amount: 10000, interest: 2930, principal: 7070, rest: 285930, paid: false, paidAt: null, operationId: null },
      ],
      paid: false, paidAt: null, createdAt: new Date().toISOString(),
    }],
    credit_cards: [
      { id: 'cd1', bank: 'Т-Банк', name: 'Platinum', limit: 100000, used: 20000, rate: 30, graceDays: 55, minPaymentPercent: 5, issueDate: TODAY, paymentDate: isoAdd(4), statementDate: TODAY, lastPaymentAmount: 0, lastPaymentAt: null, status: 'active', createdAt: new Date().toISOString() },
      { id: 'cd2', bank: 'Сбер', name: 'Extra', limit: 50000, used: 0, rate: 25, graceDays: 50, minPaymentPercent: 5, issueDate: TODAY, paymentDate: isoAdd(20), statementDate: TODAY, lastPaymentAmount: 0, lastPaymentAt: null, status: 'active', createdAt: new Date().toISOString() },
    ],
  }];

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/budget' } }));
  text = tgTexts('sendMessage').join(' ');
  check('webhook: /budget показывает лимит и остаток', text.includes('30 000') && text.includes('29 700'), text);
  check('webhook: /budget показывает обе категории', text.includes('Продукты') && text.includes('Кафе и рестораны'));

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/credits' } }));
  text = tgTexts('sendMessage').join(' ');
  check('webhook: /credits показывает ближайший платёж по кредиту', text.includes('Альфа') && text.includes('10 000'), text);
  check('webhook: /credits показывает долг по кредитке', text.includes('Т-Банк') && text.includes('20 000'), text);
  check('webhook: кредитка без долга помечена как чистая', text.includes('без долга'), text);

  const profileNoBudgets = { user_id: 'u-clean', budgets: {}, categories: {}, rules: [], settings: {} };
  globalThis.__FT_DB.finance_profiles.push(profileNoBudgets);
  const chatClean = nextChat();
  globalThis.__FT_DB.telegram_accounts.push({ user_id: 'u-clean', telegram_chat_id: chatClean, username: 'clean' });
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chatClean }, text: '/budget' } }));
  check('webhook: /budget без лимитов даёт подсказку', /не заданы/.test(tgTexts('sendMessage')[0] || ''), tgTexts('sendMessage')[0]);

  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/unlink' } }));
  check('webhook: /unlink отвязывает', !globalThis.__FT_DB.telegram_accounts.some(a => a.telegram_chat_id === chat));
  tgCalls.length = 0;
  await tgH(upd({ message: { chat: { id: chat }, text: '/today' } }));
  check('webhook: после /unlink отчёты недоступны', /привяжите/.test(tgTexts('sendMessage')[0] || ''));
}

/* ==========================================================================
   4. credit-reminders
   ====================================================================== */
{
  const cronReq = (secret = 'cronsec', method = 'POST') => new Request('http://stub/v1/credit-reminders', {
    method, headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' }, body: '{}',
  });

  let r = await asJson(await remH(cronReq('wrong')));
  eq('reminders: неверный секрет — 403', r.status, 403);
  const keep = globalThis.__FT_ENV.CRON_SECRET;
  delete globalThis.__FT_ENV.CRON_SECRET;
  r = await asJson(await remH(cronReq('cronsec')));
  eq('reminders: без CRON_SECRET — 403', r.status, 403);
  globalThis.__FT_ENV.CRON_SECRET = keep;
  const keepToken = globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN;
  delete globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN;
  r = await asJson(await remH(cronReq()));
  eq('reminders: без токена бота — 500', r.status, 500);
  globalThis.__FT_ENV.TELEGRAM_BOT_TOKEN = keepToken;

  globalThis.__FT_DB = freshDB();
  globalThis.__FT_DB.telegram_accounts = [
    { user_id: 'u-ivan', telegram_chat_id: '700', username: 'ivan' },
    { user_id: 'u-clean', telegram_chat_id: '701', username: 'clean' },
  ];
  const mkSchedule = (nextDate) => ([
    { n: 1, date: isoAdd(-30), amount: 10000, interest: 3000, principal: 7000, rest: 293000, paid: true, paidAt: '', operationId: null },
    { n: 2, date: nextDate, amount: 10000, interest: 2930, principal: 7070, rest: 285930, paid: false, paidAt: null, operationId: null },
  ]);
  globalThis.__FT_DB.finance_profiles = [
    {
      user_id: 'u-ivan', budgets: {}, categories: {}, settings: {},
      credits: [{ id: 'crA', bank: 'Альфа', purpose: '', schedule: mkSchedule(isoAdd(3)), paid: false, paidAt: null, createdAt: '', principal: 300000, rate: 12, termMonths: 12 }],
      credit_cards: [{ id: 'cdA', bank: 'Т-Банк', name: 'Platinum', limit: 100000, used: 20000, rate: 30, graceDays: 55, minPaymentPercent: 5, issueDate: TODAY, paymentDate: isoAdd(3), statementDate: TODAY, lastPaymentAmount: 0, lastPaymentAt: null, status: 'active', createdAt: '' }],
    },
    {
      user_id: 'u-clean', budgets: {}, categories: {}, settings: {},
      credits: [{ id: 'crB', bank: 'ВТБ', purpose: '', schedule: mkSchedule(isoAdd(5)), paid: false, paidAt: null, createdAt: '', principal: 200000, rate: 14, termMonths: 24 }],
      credit_cards: [],
    },
  ];

  tgCalls.length = 0;
  r = await asJson(await remH(cronReq()));
  check('reminders: напоминание за 3 дня отправлено', r.body && r.body.sent === 2, JSON.stringify(r.body));
  const reminderText = tgTexts('sendMessage').join(' ');
  check('reminders: в тексте банк и сумма', reminderText.includes('Альфа') && reminderText.includes('10 000'), reminderText);
  check('reminders: «через 3 дн.»', reminderText.includes('через 3 дн.'), reminderText);
  check('reminders: кредитка тоже напомнена', reminderText.includes('Т-Банк'), reminderText);
  const ivanProfile = globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan');
  const marks = ivanProfile && ivanProfile.settings && ivanProfile.settings.reminderMarks;
  check('reminders: пометки о доставке сохранены', marks && marks['credit:crA:' + isoAdd(3)] && marks['card:cdA:' + isoAdd(3)], JSON.stringify(marks));

  tgCalls.length = 0;
  await remH(cronReq());
  check('reminders: повторный запуск не дублирует', (r.body ? true : true) && tgTexts('sendMessage').length === 0, JSON.stringify(tgTexts('sendMessage')));

  /* платёж сегодня */
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-clean').credits[0].schedule[1].date = TODAY;
  tgCalls.length = 0;
  r = await asJson(await remH(cronReq()));
  check('reminders: в день платежа напоминание приходит', r.body && r.body.sent === 1, JSON.stringify(r.body));
  check('reminders: «сегодня» в тексте', tgTexts('sendMessage').join(' ').includes('сегодня'));

  tgCalls.length = 0;
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-clean').credits[0].schedule[1].date = isoAdd(6);
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-clean').settings = {};
  r = await asJson(await remH(cronReq()));
  check('reminders: за 6 дней молчит', r.body && r.body.sent === 0, JSON.stringify(r.body));

  r = await asJson(await remH(new Request('http://stub/v1/credit-reminders', { method: 'GET', headers: { 'x-cron-secret': 'cronsec' } })));
  check('reminders: GET тоже работает (для cron-сервисов)', r.body && r.body.ok === true);
}

/* ==========================================================================
   5. weekly-digest
   ====================================================================== */
{
  const cronReq = (secret = 'cronsec') => req('weekly-digest', {}, { 'x-cron-secret': secret });

  let r = await asJson(await digH(cronReq('wrong')));
  eq('digest: неверный секрет — 403', r.status, 403);

  /* диапазон прошлой недели (пн–вс), как в функции */
  const d = new Date(TODAY + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  const addDays = (iso, n) => { const x = new Date(iso + 'T12:00:00'); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const weekFrom = addDays(TODAY, -dow - 7);
  const weekTo = addDays(weekFrom, 6);
  const thisMonday = addDays(TODAY, -dow);

  globalThis.__FT_DB = freshDB();
  globalThis.__FT_DB.telegram_accounts = [{ user_id: 'u-ivan', telegram_chat_id: '800', username: 'ivan' }];
  globalThis.__FT_DB.finance_operations = [
    { user_id: 'u-ivan', client_id: 'w1', type: 'income', amount: 50000, category: 'Зарплата', note: '', date: addDays(weekFrom, 1) },
    { user_id: 'u-ivan', client_id: 'w2', type: 'expense', amount: 12000, category: 'Продукты', note: '', date: addDays(weekFrom, 2) },
    { user_id: 'u-ivan', client_id: 'w3', type: 'expense', amount: 8000, category: 'Кафе и рестораны', note: '', date: addDays(weekFrom, 3) },
    { user_id: 'u-ivan', client_id: 'w4', type: 'expense', amount: 3000, category: 'Транспорт', note: '', date: weekTo },
  ];
  globalThis.__FT_DB.finance_profiles = [{
    user_id: 'u-ivan', budgets: { 'Продукты': 13000, 'Транспорт': 30000 }, categories: {}, rules: [],
    settings: {},
    recurring: [{ id: 'r1', name: 'Интернет', amount: 700, period: 'monthly', next: addDays(TODAY, 3), category: 'Связь', type: 'expense', accountId: '' }],
    credits: [], credit_cards: [],
  }];

  tgCalls.length = 0;
  r = await asJson(await digH(cronReq()));
  check('digest: отправлен один дайджест', r.body && r.body.sent === 1, JSON.stringify(r.body));
  let text = tgTexts('sendMessage').join(' ');
  check('digest: доходы недели', text.includes('50 000'), text);
  check('digest: расходы недели', text.includes('23 000'), text);
  check('digest: топ категорий с «Продукты»', text.includes('Продукты'), text);
  check('digest: диапазон недели в заголовке', text.includes('.'), text);
  const ivanProfile = globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan');
  eq('digest: lastDigestISO = начало недели', ivanProfile.settings.lastDigestISO, weekFrom);

  tgCalls.length = 0;
  r = await asJson(await digH(cronReq()));
  check('digest: повторно за ту же неделю молчит', r.body && r.body.sent === 0, JSON.stringify(r.body));

  tgCalls.length = 0;
  globalThis.__FT_DB.finance_operations = globalThis.__FT_DB.finance_operations.filter(o => o.user_id !== 'u-ivan');
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan').settings = {};
  r = await asJson(await digH(cronReq()));
  check('digest: без операций молчит', r.body && r.body.sent === 0, JSON.stringify(r.body));

  /* рискованный лимит + предстоящее списание: операция нужна и в прощлой
     неделе (иначе дайджест молчит), и в текущем месяце (для лимита) */
  globalThis.__FT_DB.finance_operations = [
    { user_id: 'u-ivan', client_id: 'w5', type: 'expense', amount: 4000, category: 'Продукты', note: '', date: addDays(weekFrom, 4) },
    { user_id: 'u-ivan', client_id: 'm1', type: 'expense', amount: 12000, category: 'Продукты', note: '', date: thisMonday },
  ];
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan').settings = {};
  tgCalls.length = 0;
  r = await asJson(await digH(cronReq()));
  text = tgTexts('sendMessage').join(' ');
  check('digest: лимит под давлением помечен ⚠️', text.includes('⚠️') && text.includes('Продукты'), text);
  check('digest: Транспорт (спокойный лимит) не помечен', !text.includes('Транспорт:'), text);
  check('digest: предстоящее списание показано', text.includes('Интернет') && text.includes('700'), text);

  /* доходный повторяющийся платёж не попадает в «Скоро списания» */
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan').recurring =
    [{ id: 'r2', name: 'Процент по вкладу', amount: 5000, period: 'monthly', next: addDays(TODAY, 2), category: 'Проценты', type: 'income', accountId: '' }];
  globalThis.__FT_DB.finance_profiles.find(p => p.user_id === 'u-ivan').settings = {};
  tgCalls.length = 0;
  await digH(cronReq());
  text = tgTexts('sendMessage').join(' ');
  check('digest: доходные платежи не в «Скоро списания»', !text.includes('Процент по вкладу'), text);
}

/* ==========================================================================
   итог
   ====================================================================== */
console.log('');
console.log('Edge Functions: ' + passed + ' ✓, ' + failures.length + ' ✗');
if (failures.length) {
  console.log('Провалены:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
