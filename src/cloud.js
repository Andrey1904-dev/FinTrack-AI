/* ============================================================================
   cloud.js — Supabase: вход, синхронизация, очередь изменений, офлайн-режим
   Главное отличие от версии 1.0: запись идёт точечно (upsert по client_id и
   удаление конкретных строк). Схемы «DELETE всех операций → INSERT заново»,
   из-за которой при сбое сети терялась вся история, больше нет.
   Изменения, сделанные офлайн, попадают в очередь и уходят на сервер сами.
   ========================================================================== */

const SUPABASE_URL = 'https://bqlocvjjdulpizdfqotm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ii5Ny_JSFV_LLWPRiPVwzg_eEp1rz9z';

let sb = null, cloudReady = false, flushing = false, recentPushAt = 0, realtimeChannel = null;
const OUTBOX_RETRY_MS = 5000;          // как часто повторяем отправку очереди, пока в ней что-то есть
let outboxTimer = null, lastOutboxError = '';
let syncedIds = new Set();
let hasAccountColumn = true, hasRulesColumn = true, hasSettingsColumn = true;

function sbClient(){
  if (!sb){
    const factory = (window.supabase && window.supabase.createClient) ? window.supabase : (typeof supabaseJs !== 'undefined' ? supabaseJs : null);
    if (!factory) throw new Error('Клиент Supabase не загрузился');
    sb = factory.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }
  return sb;
}
function isOnline(){ return typeof navigator === 'undefined' ? true : navigator.onLine !== false; }

/* ---------------- авторизация ---------------- */
async function authSignIn(email, password){
  const { data, error } = await sbClient().auth.signInWithPassword({ email, password });
  if (error) throw error; return data;
}
async function authSignUp(email, password){
  const { data, error } = await sbClient().auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error; return data;
}
async function authSignOut(){ await sbClient().auth.signOut(); }
async function authSendReset(email){
  const { error } = await sbClient().auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
async function authUpdatePassword(password){
  const { error } = await sbClient().auth.updateUser({ password });
  if (error) throw error;
}
async function authGetSession(){
  try { const { data } = await sbClient().auth.getSession(); return (data && data.session) || null; } catch (e){ return null; }
}

/* ---------------- сопоставление с таблицами ---------------- */
function opToRow(o, uid){
  const row = { user_id: uid, client_id: String(o.id), type: o.type, amount: num(o.amount), category: o.category, note: o.note || '', date: o.date };
  if (hasAccountColumn) row.account_id = o.accountId || null;
  return row;
}
function rowToOp(x){
  return normalizeOperation({ id: x.client_id, type: x.type, amount: x.amount, category: x.category, note: x.note || '', date: x.date, accountId: x.account_id || '' });
}
function profileRow(uid){
  const row = {
    user_id: uid, budgets: S.budgets, goals: S.goals, recurring: S.recurring, accounts: S.accounts,
    credits: S.credits, credit_cards: S.cards, categories: S.categorySets, updated_at: new Date().toISOString()
  };
  if (hasRulesColumn) row.rules = S.rules;
  if (hasSettingsColumn) row.settings = S.settings;
  return row;
}
function applyProfileRow(row){
  if (!row) return;
  if (row.budgets && typeof row.budgets === 'object') S.budgets = row.budgets;
  if (Array.isArray(row.goals)) S.goals = row.goals;
  if (Array.isArray(row.recurring)) S.recurring = row.recurring;
  if (Array.isArray(row.accounts)) S.accounts = row.accounts;
  if (Array.isArray(row.credits)) S.credits = row.credits;
  if (Array.isArray(row.credit_cards)) S.cards = row.credit_cards;
  if (row.categories && Array.isArray(row.categories.expense)) S.categorySets = row.categories;
  if (Array.isArray(row.rules)) S.rules = row.rules; else if (row.rules === undefined) hasRulesColumn = false;
  if (row.settings && typeof row.settings === 'object') S.settings = Object.assign(defaultSettings(), row.settings); else if (row.settings === undefined) hasSettingsColumn = false;
}

/* ---------------- загрузка ---------------- */
async function fetchOps(uid){
  const base = 'client_id,type,amount,category,note,date';
  let res = await sbClient().from('finance_operations').select(hasAccountColumn ? base + ',account_id' : base).eq('user_id', uid).order('date', { ascending: false }).limit(20000);
  if (res.error && /account_id/.test(res.error.message || '')){
    hasAccountColumn = false;
    res = await sbClient().from('finance_operations').select(base).eq('user_id', uid).order('date', { ascending: false }).limit(20000);
  }
  if (res.error) throw res.error;
  return (res.data || []).map(rowToOp);
}
async function fetchProfile(uid){
  const res = await sbClient().from('finance_profiles').select('*').eq('user_id', uid).maybeSingle();
  if (res.error) throw res.error;
  return res.data || null;
}

/* Основная синхронизация: сервер → приложение. При сбое показываем кэш. */
async function syncPull(opts){
  const optional = opts || {};
  if (!S.user) return false;
  S.sync.state = 'loading'; renderSync();
  try {
    const [ops, profile] = await Promise.all([fetchOps(S.user.id), fetchProfile(S.user.id)]);
    S.ops = ops;
    applyProfileRow(profile);
    normalizeAll();
    syncedIds = new Set(S.ops.map(o => String(o.id)));
    cloudReady = true;
    S.sync.state = 'ok'; S.sync.message = ''; S.sync.lastSync = Date.now(); S.sync.offlineSnapshotAt = 0;
    applyOutboxLocally();
    cacheSave();
    renderSync();
    return true;
  } catch (e){
    const cached = cacheLoad(S.user.id);
    cloudReady = false;
    S.sync.state = cached ? 'offline' : 'error';
    S.sync.message = e.message || 'нет связи с сервером';
    diagLog('sync', S.sync.message, 'syncPull');
    renderSync();
    if (optional.silent) return false;
    return false;
  }
}

/* ---------------- очередь изменений ---------------- */
function outboxAll(){ return S.user ? lsGet(LS.outbox(S.user.id), []) : []; }
function outboxSave(list){
  if (!S.user) return;
  lsSet(LS.outbox(S.user.id), list);
  S.sync.pending = list.length;
  renderSync();
  if (typeof renderBanner === 'function') renderBanner();
}
function outboxPush(entry){
  if (!S.user || S.demo) return;
  const list = outboxAll();
  if (entry.kind === 'ops-upsert'){
    const ids = new Set(entry.rows.map(r => String(r.id)));
    list.forEach(e => { if (e.kind === 'ops-delete') e.ids = e.ids.filter(i => !ids.has(String(i))); });
    const same = list.find(e => e.kind === 'ops-upsert');
    if (same) same.rows = same.rows.filter(r => !ids.has(String(r.id))).concat(entry.rows);
    else list.push({ kind: 'ops-upsert', rows: entry.rows, ts: Date.now() });
  } else if (entry.kind === 'ops-delete'){
    const ids = entry.ids.filter(id => syncedIds.has(String(id)));
    if (ids.length){
      const same = list.find(e => e.kind === 'ops-delete');
      if (same) same.ids = [...new Set(same.ids.concat(ids))];
      else list.push({ kind: 'ops-delete', ids, ts: Date.now() });
    }
    list.forEach(e => { if (e.kind === 'ops-upsert') e.rows = e.rows.filter(r => !entry.ids.includes(String(r.id))); });
  } else if (entry.kind === 'profile'){
    if (!list.find(e => e.kind === 'profile')) list.push({ kind: 'profile', ts: Date.now() });
  }
  outboxSave(list.filter(e => (e.kind !== 'ops-upsert' || e.rows.length) && (e.kind !== 'ops-delete' || e.ids.length)));
  if (isOnline() && S.sync.state !== 'error') flushOutbox();
}
function applyOutboxLocally(){
  const list = outboxAll();
  if (!list.length) return;
  for (const e of list){
    if (e.kind === 'ops-upsert'){
      e.rows.forEach(r => {
        const clean = normalizeOperation(r);
        const i = S.ops.findIndex(o => String(o.id) === clean.id);
        if (i >= 0) S.ops[i] = clean; else S.ops.push(clean);
      });
    } else if (e.kind === 'ops-delete'){
      const ids = new Set(e.ids.map(String));
      S.ops = S.ops.filter(o => !ids.has(String(o.id)));
    }
  }
  S.ops.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
}
async function flushOutbox(){
  if (flushing || !S.user || S.demo || !isOnline()) return;
  if (!outboxAll().length){ S.sync.pending = 0; return; }
  flushing = true;
  renderSync();
  try {
    for (let guard = 0; guard < 50; guard++){
      const list = outboxAll();
      if (!list.length) break;
      const e = list[0];
      try {
        if (e.kind === 'ops-upsert'){
          let res = await sbClient().from('finance_operations').upsert(e.rows.map(r => opToRow(r, S.user.id)), { onConflict: 'user_id,client_id' });
          if (res.error && /account_id/.test(res.error.message || '')){
            hasAccountColumn = false;
            res = await sbClient().from('finance_operations').upsert(e.rows.map(r => { const row = opToRow(r, S.user.id); delete row.account_id; return row; }), { onConflict: 'user_id,client_id' });
          }
          if (res.error) throw res.error;
          e.rows.forEach(r => syncedIds.add(String(r.id)));
        } else if (e.kind === 'ops-delete'){
          const res = await sbClient().from('finance_operations').delete().eq('user_id', S.user.id).in('client_id', e.ids);
          if (res.error) throw res.error;
        } else if (e.kind === 'profile'){
          let res = await sbClient().from('finance_profiles').upsert(profileRow(S.user.id), { onConflict: 'user_id' });
          if (res.error && /rules|settings/.test(res.error.message || '')){
            if (/rules/.test(res.error.message)) hasRulesColumn = false;
            if (/settings/.test(res.error.message)) hasSettingsColumn = false;
            res = await sbClient().from('finance_profiles').upsert(profileRow(S.user.id), { onConflict: 'user_id' });
          }
          if (res.error) throw res.error;
        }
        recentPushAt = Date.now();
        S.sync.lastSync = Date.now();
        outboxSave(outboxAll().slice(1));
      } catch (err){
        S.sync.state = 'pending';
        S.sync.message = err.message || 'не удалось отправить изменения';
        // повтор идёт каждые 5 с — одинаковую ошибку пишем в журнал один раз, а не сотни
        if (S.sync.message !== lastOutboxError){ lastOutboxError = S.sync.message; diagLog('outbox', S.sync.message, e.kind); }
        renderSync();
        if (typeof renderBanner === 'function') renderBanner();
        break;
      }
    }
    if (!outboxAll().length){ S.sync.pending = 0; lastOutboxError = ''; if (S.sync.state !== 'ok'){ S.sync.state = 'ok'; S.sync.message = ''; } }
  } finally {
    flushing = false;
    renderSync();
  }
}
/* Автоповтор: пока очередь не пуста, каждые 5 секунд пробуем отправить её снова.
   Работает только когда есть что отправлять, вкладка видима и есть сеть —
   иначе не тратим заряд и трафик. Интерфейс перерисовывается только при
   смене состояния, чтобы не сбрасывать формы, которые пользователь заполняет. */
async function outboxTick(){
  if (!S.user || S.demo || flushing || !isOnline()) return;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!outboxAll().length) return;
  await flushOutbox();
  if (outboxAll().length) return;                 // всё ещё не ушло — попробуем через 5 секунд
  if (!cloudReady) await syncPull({ silent: true }); // до этого показывали офлайн-копию — обновляем с сервера
  render();                                        // очередь опустела: плашка исчезает, данные свежие
}
function startOutboxRetry(){
  if (outboxTimer) return;
  outboxTimer = setInterval(() => { outboxTick().catch(e => diagLog('outbox', e && e.message || e, 'retry-timer')); }, OUTBOX_RETRY_MS);
}
async function retrySync(){
  if (!S.user) return;
  await flushOutbox();
  await syncPull();
  render();
}

/* ---------------- живое обновление ---------------- */
const scheduleRemotePull = debounce(async () => {
  if (Date.now() - recentPushAt < 4000) return;
  const ok = await syncPull({ silent: true });
  if (ok){ render(); toast('Данные обновились — их изменил Telegram-бот или другое устройство'); }
}, 1500);
function attachRealtime(){
  if (!S.user || S.demo || !window.supabase) return;
  try {
    if (realtimeChannel) sbClient().removeChannel(realtimeChannel);
    realtimeChannel = sbClient().channel('ft-' + S.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_operations', filter: 'user_id=eq.' + S.user.id }, () => scheduleRemotePull())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_profiles', filter: 'user_id=eq.' + S.user.id }, () => scheduleRemotePull())
      .subscribe();
  } catch (e){ /* Realtime может быть отключён — приложение продолжит работать */ }
}
function watchConnectivity(){
  startOutboxRetry();
  window.addEventListener('online', () => { renderSync(); flushOutbox().then(() => syncPull({ silent: true })).then(render); });
  window.addEventListener('offline', renderSync);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !S.user || S.demo) return;
    if (outboxAll().length) outboxTick().catch(() => {});   // вернулись на вкладку — не ждём очередного тика
    else if (Date.now() - S.sync.lastSync > 60000) syncPull({ silent: true }).then(render);
  });
}

/* ---------------- вход/выход ---------------- */
async function logout(){
  await flushOutbox();
  try { await authSignOut(); } catch (e){}
  S = blankState();
  location.reload();
}
async function resetCloudData(){
  if (!S.user) return false;
  const res = await sbClient().from('finance_operations').delete().eq('user_id', S.user.id);
  if (res.error) throw res.error;
  const prof = await sbClient().from('finance_profiles').upsert({
    user_id: S.user.id, budgets: {}, goals: [], recurring: [], accounts: [], credits: [], credit_cards: [],
    categories: DEFAULT_CATEGORIES, rules: [], settings: defaultSettings(), updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (prof.error) throw prof.error;
  outboxSave([]);
  S.ops = []; S.budgets = {}; S.goals = []; S.recurring = []; S.accounts = []; S.credits = []; S.cards = [];
  S.rules = []; S.categorySets = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)); S.settings = defaultSettings();
  cacheSave();
  return true;
}
/* ---------- необязательные Edge Functions ---------- */
/* ai-parse: разбор текста моделью (ключ хранится в Supabase Secrets, не в клиенте).
   Если функция не развёрнута — приложение молча остаётся на словаре. */
async function aiParseRemote(text){
  const res = await sbClient().functions.invoke('ai-parse', {
    body: { text, categories: S.categorySets, rules: S.rules, currency: currencyCode(), today: today() }
  });
  if (res.error) throw res.error;
  const d = res.data || {};
  const amount = d.amount === null || d.amount === undefined ? null : round2(num(d.amount));
  const category = categoryOptions(d.type === 'income' ? 'income' : 'expense').includes(d.category) ? d.category : 'Другое';
  return {
    type: d.type === 'income' ? 'income' : 'expense', amount, category,
    date: isValidISO(d.date) ? String(d.date).slice(0, 10) : today(),
    note: String(d.note || text).slice(0, 140), why: 'LLM', confidence: clamp(num(d.confidence) || 0.8, 0, 1)
  };
}
/* Голосовое сообщение: расшифровка и разбор на сервере (Whisper + при желании LLM) */
async function aiParseVoiceRemote(audioBase64, mime){
  const res = await sbClient().functions.invoke('ai-parse', {
    body: { mode: 'voice', audio: { data: audioBase64, mime }, categories: S.categorySets, rules: S.rules, currency: currencyCode(), today: today(), language: 'ru' }
  });
  if (res.error) throw res.error;
  const d = res.data || {};
  if (!d.ok) throw new Error(d.reason || 'не удалось распознать речь');
  return {
    transcript: String(d.transcript || ''),
    type: d.type === 'income' ? 'income' : 'expense',
    amount: d.amount === null || d.amount === undefined ? null : round2(num(d.amount)),
    category: categoryOptions(d.type === 'income' ? 'income' : 'expense').includes(d.category) ? d.category : 'Другое',
    date: isValidISO(d.date) ? String(d.date).slice(0, 10) : today(),
    note: String(d.note || d.transcript || '').slice(0, 140),
    why: 'голос'
  };
}
/* Фото чека: сумма, дата и категория читаются моделью со зрением */
async function aiParsePhotoRemote(imageBase64, mime){
  const res = await sbClient().functions.invoke('ai-parse', {
    body: { mode: 'photo', image: { data: imageBase64, mime }, categories: S.categorySets, currency: currencyCode(), today: today() }
  });
  if (res.error) throw res.error;
  const d = res.data || {};
  if (!d.ok) throw new Error(d.reason || 'не удалось прочитать чек');
  return {
    type: d.type === 'income' ? 'income' : 'expense',
    amount: d.amount === null || d.amount === undefined ? null : round2(num(d.amount)),
    category: categoryOptions('expense').includes(d.category) ? d.category : 'Другое',
    date: isValidISO(d.date) ? String(d.date).slice(0, 10) : today(),
    note: String(d.note || 'чек').slice(0, 140),
    why: 'фото чека'
  };
}
/* delete-account: полностью удаляет пользователя и его данные (service_role внутри функции) */
async function deleteAccountRemote(){
  const res = await sbClient().functions.invoke('delete-account', { body: {} });
  if (res.error) throw res.error;
  return res.data || {};
}
async function telegramLinkCode(){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = new Uint8Array(8);
  crypto.getRandomValues(random);
  const code = Array.from(random, byte => alphabet[byte % alphabet.length]).join('');
  const res = await sbClient().from('telegram_link_codes').insert({ user_id: S.user.id, code, expires_at: new Date(Date.now() + 15 * 60000).toISOString() });
  if (res.error) throw res.error;
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) await sbClient().from('telegram_preferences').upsert({ user_id: S.user.id, timezone }, { onConflict: 'user_id' });
  } catch (e){ /* браузер может не сообщить системный часовой пояс */ }
  return code;
}
async function telegramBotInfo(){
  const res = await sbClient().functions.invoke('telegram-info', { body: {} });
  if (res.error) throw res.error;
  if (!res.data || !/^[A-Za-z0-9_]{5,32}$/.test(res.data.username || '')) throw new Error('Имя бота пока недоступно');
  return res.data;
}
async function telegramStatus(){
  const res = await sbClient().from('telegram_accounts').select('username,telegram_chat_id,created_at').eq('user_id', S.user.id).limit(1).maybeSingle();
  if (res.error) return { error: res.error.message };
  return { account: res.data || null };
}
async function telegramUnlink(){
  const res = await sbClient().from('telegram_accounts').delete().eq('user_id', S.user.id);
  if (res.error) throw res.error;
}
