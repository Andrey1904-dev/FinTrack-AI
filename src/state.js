/* ============================================================================
   state.js — состояние приложения, дефолты, локальный кэш и очередь изменений
   Единственный источник правды о состоянии: объект S.
   ========================================================================== */

const DEFAULT_CATEGORIES = {
  expense: ['Продукты', 'Транспорт', 'Жильё', 'Кафе и рестораны', 'Покупки', 'Здоровье',
            'Развлечения', 'Связь', 'Мобильный оператор', 'Образование', 'Подписки',
            'Кредиты', 'Дети', 'Питомцы', 'Путешествия', 'Другое'],
  income: ['Зарплата', 'Аванс', 'Подработка', 'Подарки', 'Возврат', 'Продажа', 'Инвестиции', 'Проценты', 'Другое']
};
const DEFAULT_BUDGETS = { 'Продукты': 30000, 'Транспорт': 10000, 'Кафе и рестораны': 8000, 'Жильё': 25000 };

const PERIODS = { monthly: 'ежемесячно', weekly: 'еженедельно', yearly: 'ежегодно' };

function defaultSettings(){ return { currency: 'RUB', weekStart: 1, alerts: true, theme: 'auto', weeklyBudgets: {}, aiParse: false, lastBackupAt: '' }; }

function blankState(){
  return {
    user: null,
    ops: [], budgets: {}, goals: [], recurring: [], accounts: [], credits: [], cards: [],
    categorySets: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
    rules: [], settings: defaultSettings(),
    view: { tab: 'overview', opQuery: '', opType: 'all', opCategory: 'all', opMonth: 'all', opLimit: 40, editingId: null },
    sync: { state: 'idle', lastSync: 0, pending: 0, message: '', offlineSnapshotAt: 0 },
    demo: false
  };
}
let S = blankState();

function categoriesFlat(){ return S.categorySets.expense.concat(S.categorySets.income.filter(c => !S.categorySets.expense.includes(c))); }
function ensureCategories(){
  const d = DEFAULT_CATEGORIES;
  ['expense', 'income'].forEach(k => {
    if (!Array.isArray(S.categorySets[k])) S.categorySets[k] = [];
    d[k].forEach(c => { if (!S.categorySets[k].includes(c)) S.categorySets[k].push(c); });
  });
}
function categoryOf(name){ return S.categorySets.expense.includes(name) ? 'expense' : (S.categorySets.income.includes(name) ? 'income' : 'expense'); }
function categoryOptions(type){ return type === 'income' ? S.categorySets.income : S.categorySets.expense; }

/* ---------- производные величины ---------- */
function monthStats(key){
  const k = key || thisMonthKey();
  let inc = 0, exp = 0;
  for (const o of S.ops){ if (monthKey(o.date) !== k) continue; if (o.type === 'income') inc += num(o.amount); else exp += num(o.amount); }
  return { key: k, income: round2(inc), expense: round2(exp), balance: round2(inc - exp) };
}
function allTimeBalance(){ let acc = 0; for (const o of S.ops) acc += o.type === 'income' ? num(o.amount) : -num(o.amount); return round2(acc); }
function monthSeries(months){
  const keys = monthRangeBack(months || 6);
  return keys.map(k => { const st = monthStats(k); return { key: k, label: fmtMonthShort(k), income: st.income, expense: st.expense }; });
}
function spendByCategory(key, type){
  const map = new Map();
  for (const o of S.ops){
    if (o.type !== (type || 'expense')) continue;
    if (key && monthKey(o.date) !== key) continue;
    map.set(o.category, round2((map.get(o.category) || 0) + num(o.amount)));
  }
  return [...map.entries()].map(([category, value]) => ({ category, value })).sort((a, b) => b.value - a.value);
}
function upcomingRecurring(days){
  const limit = days || 31;
  return S.recurring.filter(r => { const d = daysUntil(r.next); return d !== null && d >= 0 && d <= limit; })
    .sort((a, b) => String(a.next).localeCompare(String(b.next)));
}
function upcomingCreditPayments(days){
  const limit = days === undefined ? 31 : days, out = [];
  for (const c of S.credits){
    const p = nextUnpaidPayment(c);
    if (!p) continue;
    const d = daysUntil(p.date);
    if (d === null || d < 0 || d > limit) continue;
    out.push({ kind: 'credit', id: c.id, title: c.bank + (c.purpose ? ' · ' + c.purpose : ''), date: p.date, amount: p.amount, days: d });
  }
  for (const c of S.cards){
    if (!c.paymentDate || !num(c.used)) continue;
    const d = daysUntil(c.paymentDate);
    if (d === null || d < 0 || d > limit) continue;
    out.push({ kind: 'card', id: c.id, title: c.bank + (c.name ? ' · ' + c.name : ''), date: c.paymentDate, amount: cardMinPayment(c), days: d });
  }
  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function safeToSpendPerDay(){
  const st = monthStats(), dim = daysInMonth(thisMonthKey());
  const left = daysInMonth(thisMonthKey()) - fromISO(today()).getDate() + 1;
  const obligations = upcomingRecurring(left).reduce((a, r) => a + num(r.amount), 0)
                    + upcomingCreditPayments(left).reduce((a, r) => a + num(r.amount), 0);
  const free = st.balance - obligations;
  return { perDay: round2(Math.max(0, free / Math.max(1, left))), left, obligations: round2(obligations), free: round2(free), daysInMonth: dim };
}

/* ---------- локальный кэш и очередь изменений ---------- */
const LS = {
  cache: uid => 'ft.v2.cache.' + uid,
  outbox: uid => 'ft.v2.outbox.' + uid,
  ui: 'ft.v2.ui',
  demo: 'ft.v2.demo'
};
function lsGet(key, fallback){ try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e){ return fallback; } }
function lsSet(key, value){ try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e){ return false; } }
function lsDel(key){ try { localStorage.removeItem(key); } catch (e){} }

function snapshotState(){
  return {
    at: Date.now(),
    ops: S.ops, budgets: S.budgets, goals: S.goals, recurring: S.recurring, accounts: S.accounts,
    credits: S.credits, cards: S.cards, categorySets: S.categorySets, rules: S.rules, settings: S.settings
  };
}
function cacheSave(){ if (S.user) lsSet(LS.cache(S.user.id), snapshotState()); }
function cacheLoad(uid){
  const snap = lsGet(LS.cache(uid), null);
  if (!snap) return null;
  applySnapshot(snap);
  S.sync.offlineSnapshotAt = snap.at || 0;
  return snap;
}
function applySnapshot(snap){
  if (!snap) return;
  S.ops = Array.isArray(snap.ops) ? snap.ops : S.ops;
  S.budgets = snap.budgets && typeof snap.budgets === 'object' ? snap.budgets : S.budgets;
  S.goals = Array.isArray(snap.goals) ? snap.goals : S.goals;
  S.recurring = Array.isArray(snap.recurring) ? snap.recurring : S.recurring;
  S.accounts = Array.isArray(snap.accounts) ? snap.accounts : S.accounts;
  S.credits = Array.isArray(snap.credits) ? snap.credits : S.credits;
  S.cards = Array.isArray(snap.cards) ? snap.cards : S.cards;
  S.rules = Array.isArray(snap.rules) ? snap.rules : S.rules;
  if (snap.categorySets && Array.isArray(snap.categorySets.expense)) S.categorySets = snap.categorySets;
  if (snap.settings) S.settings = Object.assign(defaultSettings(), snap.settings);
  ensureCategories();
  normalizeAll();
}

/* Приведение данных к ожидаемому виду (совместимость со старой версией и с ботом). */
function normalizeOperation(o){
  const op = {
    id: String(o.id !== undefined && o.id !== null ? o.id : (o.client_id || uid('op'))),
    type: o.type === 'income' ? 'income' : 'expense',
    amount: round2(Math.abs(num(o.amount))),
    category: o.category || 'Другое',
    note: String(o.note === undefined || o.note === null ? '' : o.note).slice(0, 300),
    date: isValidISO(o.date) ? String(o.date).slice(0, 10) : today(),
    accountId: o.accountId ? String(o.accountId) : '',
    source: o.source || ''
  };
  // операции из старых версий могли хранить исходную валюту (orig) — она больше
  // не нужна: учёт ведётся только в рублях, поэтому поле просто не переносим.
  return op;
}
function normalizeCredit(c){
  const credit = {
    id: String(c.id || uid('cr')), bank: c.bank || 'Банк', purpose: c.purpose || '',
    principal: round2(num(c.principal)), rate: num(c.rate), termMonths: Math.max(1, Math.round(num(c.termMonths) || 1)),
    issueDate: isValidISO(c.issueDate) ? String(c.issueDate).slice(0, 10) : today(),
    paymentDate: isValidISO(c.paymentDate) ? String(c.paymentDate).slice(0, 10) : today(),
    monthlyPayment: round2(num(c.monthlyPayment)), schedule: Array.isArray(c.schedule) ? c.schedule : null,
    paid: !!c.paid, paidAt: c.paidAt || null, createdAt: c.createdAt || new Date().toISOString()
  };
  if (!credit.schedule || !credit.schedule.length){ credit.schedule = buildSchedule(credit); }
  if (!credit.monthlyPayment) credit.monthlyPayment = credit.schedule[0] ? credit.schedule[0].amount : 0;
  const nxt = nextUnpaidPayment(credit);
  if (nxt) credit.paymentDate = nxt.date;
  return credit;
}
function normalizeCard(c){
  return {
    id: String(c.id || uid('cd')), bank: c.bank || 'Банк', name: c.name || 'Карта',
    limit: round2(num(c.limit)), used: round2(num(c.used)), rate: num(c.rate), graceDays: Math.round(num(c.graceDays)),
    minPaymentPercent: num(c.minPaymentPercent),
    issueDate: isValidISO(c.issueDate) ? String(c.issueDate).slice(0, 10) : today(),
    paymentDate: isValidISO(c.paymentDate) ? String(c.paymentDate).slice(0, 10) : today(),
    statementDate: isValidISO(c.statementDate) ? String(c.statementDate).slice(0, 10) : today(),
    lastPaymentAmount: round2(num(c.lastPaymentAmount)), lastPaymentAt: c.lastPaymentAt || null,
    status: c.status || 'active', createdAt: c.createdAt || new Date().toISOString()
  };
}
/* ---------- периоды бюджетов ---------- */
function weekRangeISO(dateISO){
  const base = fromISO(dateISO || today());
  const dow = (base.getDay() + 6) % 7;                       // 0 = понедельник
  const from = addDaysISO(toISO(base), -dow);
  return { from, to: addDaysISO(from, 6), label: 'неделя ' + fmtDateShort(from) + '–' + fmtDateShort(addDaysISO(from, 6)) };
}
function monthRangeISO(dateISO){
  const key = monthKey(dateISO || today());
  return { from: key + '-01', to: key + '-' + pad2(daysInMonth(key)), label: fmtMonth(key) };
}
function spentInRange(category, range){
  let acc = 0;
  for (const o of S.ops){
    if (o.type !== 'expense' || o.category !== category) continue;
    if (o.date >= range.from && o.date <= range.to) acc += num(o.amount);
  }
  return round2(acc);
}
/* Лимиты: месячные лежат в S.budgets (как в версии 1.0 — их читает бот),
   недельные — в settings.weeklyBudgets, чтобы не ломать формат для бота. */
function budgetsList(){
  const out = [];
  Object.entries(S.budgets || {}).forEach(([category, limit]) => { if (num(limit) > 0) out.push({ category, limit: round2(limit), period: 'monthly' }); });
  Object.entries((S.settings && S.settings.weeklyBudgets) || {}).forEach(([category, limit]) => { if (num(limit) > 0) out.push({ category, limit: round2(limit), period: 'weekly' }); });
  return out.sort((a, b) => b.limit - a.limit);
}
function budgetStats(item){
  const range = item.period === 'weekly' ? weekRangeISO() : monthRangeISO();
  const spent = spentInRange(item.category, range);
  return Object.assign({}, item, { spent, left: round2(item.limit - spent), pct: item.limit ? spent / item.limit * 100 : 0, range });
}
function setBudget(category, limit, period){
  if ((period || 'monthly') === 'weekly'){
    S.settings.weeklyBudgets = S.settings.weeklyBudgets || {};
    if (limit > 0) S.settings.weeklyBudgets[category] = round2(limit);
    else delete S.settings.weeklyBudgets[category];
  } else {
    if (limit > 0) S.budgets[category] = round2(limit);
    else delete S.budgets[category];
  }
}

function normalizeAll(){
  S.ops = (S.ops || []).map(normalizeOperation).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  S.credits = (S.credits || []).map(normalizeCredit);
  S.cards = (S.cards || []).map(normalizeCard);
  S.goals = (S.goals || []).map(g => ({
    id: String(g.id || uid('g')), name: g.name || 'Цель', target: round2(num(g.target)), saved: round2(num(g.saved)),
    date: isValidISO(g.date) ? String(g.date).slice(0, 10) : '', contributions: Array.isArray(g.contributions) ? g.contributions : []
  }));
  S.recurring = (S.recurring || []).map(r => ({
    id: String(r.id || uid('r')), name: r.name || 'Платёж', amount: round2(num(r.amount)),
    period: PERIODS[r.period] ? r.period : 'monthly', next: isValidISO(r.next) ? String(r.next).slice(0, 10) : today(),
    category: r.category || 'Подписки', type: r.type === 'income' ? 'income' : 'expense', accountId: r.accountId || ''
  }));
  S.accounts = (S.accounts || []).map(a => ({ id: String(a.id || uid('a')), name: a.name || 'Счёт', kind: a.kind || 'card', initial: round2(num(a.initial)) }));
  S.rules = (S.rules || []).map(r => ({ id: String(r.id || uid('rl')), keyword: String(r.keyword || '').toLowerCase().trim(), category: r.category || 'Другое', type: r.type === 'income' ? 'income' : 'expense' })).filter(r => r.keyword);
  S.budgets = S.budgets && typeof S.budgets === 'object' ? S.budgets : {};
  if (!S.settings.weeklyBudgets || typeof S.settings.weeklyBudgets !== 'object') S.settings.weeklyBudgets = {};
  // Валюта одна — рубль: чужие значения из старых профилей (злотый, евро…)
  // больше не влияют на подписи и суммы, а курсы не нужны вовсе.
  S.settings.currency = 'RUB';
  delete S.settings.rates;
  ensureCategories();
}

/* ---------- изменения данных ---------- */
function findOp(id){ return S.ops.find(o => String(o.id) === String(id)); }
/* Защита от потери данных: пока облако не загрузилось, писать нельзя.
   В версии 1.0 именно из-за отсутствия такой проверки пустая копия в памяти
   затирала историю в базе. */
function writesBlocked(){
  if (S.sync.state !== 'error') return false;
  toast('Данные из облака не загружены — запись отключена, чтобы не потерять историю. Нажмите «Повторить».', { bad: true, timeout: 6000 });
  return true;
}
function upsertOp(op){
  if (writesBlocked()) return null;
  const clean = normalizeOperation(op);
  const i = S.ops.findIndex(o => String(o.id) === clean.id);
  if (i >= 0) S.ops[i] = clean; else S.ops.push(clean);
  S.ops.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  cacheSave(); outboxPush({ kind: 'ops-upsert', rows: [clean] });
  return clean;
}
function removeOps(ids){
  if (writesBlocked()) return [];
  const set = new Set(ids.map(String));
  const removed = S.ops.filter(o => set.has(String(o.id)));
  S.ops = S.ops.filter(o => !set.has(String(o.id)));
  cacheSave(); outboxPush({ kind: 'ops-delete', ids: [...set] });
  return removed;
}
function saveProfileToCloud(){ if (writesBlocked()) return; cacheSave(); outboxPush({ kind: 'profile' }); }
function accountsWithBalance(){
  return S.accounts.map(a => {
    let bal = num(a.initial);
    for (const o of S.ops){ if (o.accountId !== a.id) continue; bal += o.type === 'income' ? num(o.amount) : -num(o.amount); }
    return Object.assign({}, a, { balance: round2(bal) });
  });
}
