/* ============================================================================
   app.js — запуск приложения: вход, восстановление пароля, демо-режим,
   обработчики ввода, сервис-воркер
   ========================================================================== */

/* ============================================================================
   Тема оформления: dark | light | auto.
   Значение хранится и в браузере (чтобы применилось до первой отрисовки),
   и в профиле, чтобы переключаться синхронно на всех устройствах.
   ========================================================================== */
const THEME_KEY = 'ft.v2.theme';
function applyTheme(mode, opts){
  const m = mode || lgGetTheme() || 'auto';
  const dark = m === 'dark' || (m === 'auto' && !(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches));
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(THEME_KEY, m); } catch (e){}
  if (S.settings) S.settings.theme = m;
  if (!(opts && opts.silent) && typeof render === 'function' && S.user) render();
}
function lgGetTheme(){ try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e){ return 'auto'; } }
function watchSystemTheme(){
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => { if ((S.settings.theme || 'auto') === 'auto') applyTheme('auto'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
}

/* ============================================================================
   Голос и фото: запись с микрофона и чтение чека.
   Работает только когда развёрнута функция ai-parse с ключом AI_API_KEY —
   иначе показываем понятную подсказку, а не молчим.
   ========================================================================== */
let recorder = null, recChunks = [], recStream = null, recTimer = 0;

function voiceSupported(){ return typeof navigator !== 'undefined' && !!navigator.mediaDevices && typeof window.MediaRecorder === 'function'; }

function setVoiceUI(recording){
  const btn = $('voiceBtn');
  if (!btn) return;
  btn.classList.toggle('recording', !!recording);
  btn.innerHTML = icon(recording ? 'stop' : 'mic');      // эмодзи заменены SVG: они одинаковы во всех системах
  btn.title = recording ? 'Остановить запись' : 'Записать голосом';
  btn.setAttribute('aria-label', btn.title);
}
function voiceHint(){
  return S.demo ? 'Голосовой ввод работает в аккаунте: функция ai-parse проверяет вход.'
    : 'Нужна развёрнутая функция ai-parse с ключом AI_API_KEY (см. supabase/functions/README.md).';
}
async function toggleVoiceRecording(){
  if (recorder && recorder.state === 'recording'){ recorder.stop(); return; }
  if (!voiceSupported()){ toast('Браузер не умеет записывать звук. Наберите текстом — разбор тот же.', { bad: true }); return; }
  try {
    recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    recorder = new MediaRecorder(recStream);
    recorder.ondataavailable = e => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      clearTimeout(recTimer);
      if (recStream) recStream.getTracks().forEach(t => t.stop());
      setVoiceUI(false);
      const blob = new Blob(recChunks, { type: (recorder && recorder.mimeType) || 'audio/webm' });
      recChunks = [];
      if (blob.size < 1500){ toast('Слишком короткая запись — скажите фразу целиком', { bad: true }); return; }
      toast('Распознаю запись…');
      try {
        const b64 = await blobToBase64(blob);
        const parsed = await aiParseVoiceRemote(b64, blob.type || 'audio/webm');
        const input = $('qadd');
        if (input){ input.value = parsed.transcript; }
        qaddPreview();
        toast('Услышал: «' + parsed.transcript + '»');
      } catch (e){
        const msg = String(e.message || e);
        toast(/ai-parse|Failed to send|404/.test(msg) ? voiceHint() : 'Не удалось распознать: ' + msg, { bad: true, timeout: 8000 });
      }
    };
    recorder.start();
    setVoiceUI(true);
    toast('Записываю… нажмите ⏹ чтобы закончить (максимум 30 секунд)');
    recTimer = setTimeout(() => { if (recorder && recorder.state === 'recording') recorder.stop(); }, 30000);
  } catch (e){
    setVoiceUI(false);
    toast('Нет доступа к микрофону: ' + (e.message || e), { bad: true });
  }
}

/* Фото чека: уменьшаем картинку в браузере, чтобы не гнать мегабайты в сеть. */
async function handlePhotoFile(file){
  if (!file) return;
  if (!/^image\//.test(file.type || '')){ toast('Нужен файл изображения', { bad: true }); return; }
  toast('Читаю чек…');
  try {
    const { base64, mime } = await shrinkImage(file, 1400, 0.82);
    const parsed = await aiParsePhotoRemote(base64, mime);
    if (!parsed.amount){ toast('Сумму на фото разобрать не удалось — заполните форму вручную', { bad: true }); }
    else toast('Распознано: ' + money(parsed.amount) + ' · ' + parsed.category);
    draft.op = { type: parsed.type, amount: parsed.amount || '', category: parsed.category, date: parsed.date, note: parsed.note || 'чек' };
    modalOp();
  } catch (e){
    const msg = String(e.message || e);
    toast(/ai-parse|Failed to send|404/.test(msg) ? voiceHint() : 'Не удалось прочитать чек: ' + msg, { bad: true, timeout: 8000 });
  }
}
function blobToBase64(blob){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
    r.onerror = () => reject(new Error('не удалось прочитать запись'));
    r.readAsDataURL(blob);
  });
}
function shrinkImage(file, maxSide, quality){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width || 1, img.height || 1));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round((img.width || 1) * scale));
        canvas.height = Math.max(1, Math.round((img.height || 1) * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ base64: dataUrl.split(',')[1] || '', mime: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('файл не похож на изображение'));
      img.src = String(r.result || '');
    };
    r.onerror = () => reject(new Error('не удалось прочитать файл'));
    r.readAsDataURL(file);
  });
}

/* ============================================================================
   Диагностика: последние ошибки приложения (для обращения в поддержку
   и для подключения Sentry — журнал можно приложить целиком).
   ========================================================================== */
const DIAG_KEY = 'ft.v2.diag';
function diagLog(kind, message, extra){
  try {
    const list = lsGet(DIAG_KEY, []);
    list.push({ at: new Date().toISOString(), kind, message: String(message).slice(0, 300), extra: extra ? String(extra).slice(0, 200) : '' });
    lsSet(DIAG_KEY, list.slice(-30));
  } catch (e){ /* журнал не критичен */ }
  // Если в template.html подключён Sentry (или его совместимый аналог),
  // ошибки уходят и туда — отдельный код для этого не нужен.
  try {
    const sentry = typeof window !== 'undefined' ? window.Sentry : null;
    if (sentry && typeof sentry.captureException === 'function'){
      const err = new Error(String(message));
      err.name = 'FinTrack:' + kind;
      sentry.captureException(err, { extra: extra ? { context: String(extra) } : undefined });
    }
  } catch (e){ /* мониторинг не должен мешать работе */ }
}
function diagList(){ return lsGet(DIAG_KEY, []); }
function diagClear(){ lsDel(DIAG_KEY); }
function diagText(){
  return diagList().map(e => `${e.at} [${e.kind}] ${e.message}${e.extra ? ' · ' + e.extra : ''}`).join('\n');
}
function installErrorHooks(){
  let notified = false;
  const notify = () => { if (notified) return; notified = true; try { toast('Произошла ошибка — подробности в «Настройки → Диагностика»', { bad: true, timeout: 7000 }); } catch (e){} };
  window.addEventListener('error', e => { diagLog('error', e.message || 'ошибка', (e.filename || '') + ':' + (e.lineno || '')); notify(); });
  window.addEventListener('unhandledrejection', e => { const r = e.reason; diagLog('promise', (r && (r.message || r)) || 'отклонённый промис'); notify(); });
}

function showApp(){
  $('authScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
}
function showAuth(){
  $('app').classList.add('hidden');
  $('authScreen').classList.remove('hidden');
}
function authMessage(text, kind){
  const el = $('authMsg'); if (!el) return;
  el.className = 'msg ' + (kind === 'ok' ? 'ok' : 'err');
  el.textContent = text;
  el.classList.remove('hidden');
}
function clearAuthMessage(){ const el = $('authMsg'); if (el){ el.classList.add('hidden'); el.textContent = ''; } }
function setAuthMode(mode){
  $('authMode').value = mode;
  $('authTabLogin').classList.toggle('active', mode === 'login');
  $('authTabSignup').classList.toggle('active', mode === 'signup');
  $('authTitle').textContent = mode === 'signup' ? 'Создать аккаунт' : 'Вход в аккаунт';
  $('authSubmit').textContent = mode === 'signup' ? 'Зарегистрироваться' : 'Войти';
  $('authPassword2').classList.toggle('hidden', mode !== 'signup');
  clearAuthMessage();
}

async function submitAuthForm(){
  clearAuthMessage();
  const email = fieldValue('authEmail'), password = fieldValue('authPassword'), mode = fieldValue('authMode') || 'login';
  if (!email || !password){ authMessage('Заполните почту и пароль'); return; }
  $('authSubmit').disabled = true;
  try {
    if (mode === 'signup'){
      if (password !== fieldValue('authPassword2')){ authMessage('Пароли не совпадают'); return; }
      if (password.length < 6){ authMessage('Пароль должен быть не короче 6 символов'); return; }
      const data = await authSignUp(email, password);
      if (!data.session){ authMessage('Аккаунт создан. Подтвердите почту по ссылке из письма, затем войдите.', 'ok'); setAuthMode('login'); return; }
      await enterApp(data.session.user);
    } else {
      const data = await authSignIn(email, password);
      await enterApp(data.user || (data.session && data.session.user));
    }
  } catch (e){
    authMessage(translateAuthError(e.message || String(e)));
  } finally {
    $('authSubmit').disabled = false;
  }
}
function translateAuthError(msg){
  const m = String(msg);
  if (/Invalid login credentials/i.test(m)) return 'Неверная почта или пароль.';
  if (/Email not confirmed/i.test(m)) return 'Почта ещё не подтверждена — проверьте письмо.';
  if (/User already registered/i.test(m)) return 'Такая почта уже зарегистрирована — войдите.';
  if (/Password should be at least/i.test(m)) return 'Пароль слишком короткий.';
  if (/rate limit|too many/i.test(m)) return 'Слишком много попыток — попробуйте позже.';
  if (/Invalid email/i.test(m)) return 'Проверьте адрес почты.';
  return m;
}
async function sendReset(){
  clearAuthMessage();
  const email = fieldValue('authEmail');
  if (!email){ authMessage('Сначала введите почту, на которую зарегистрированы'); return; }
  try { await authSendReset(email); authMessage('Письмо для смены пароля отправлено на ' + email + '. Откройте ссылку из письма — здесь появится окно нового пароля.', 'ok'); }
  catch (e){ authMessage(translateAuthError(e.message || String(e))); }
}
function openRecoverySheet(){
  openSheet({
    title: 'Новый пароль',
    subtitle: 'Ссылка из письма подтверждена — задайте новый пароль',
    html: `<div class="form-grid">
        <div><label class="label" for="recPass">Новый пароль</label><input id="recPass" type="password" class="field" autocomplete="new-password" placeholder="минимум 6 символов"></div>
        <div><label class="label" for="recPass2">Повторите пароль</label><input id="recPass2" type="password" class="field" autocomplete="new-password"></div>
      </div>
      <div class="row gap8 mt16" style="justify-content:flex-end">
        <button class="btn ghost" data-act="closeSheet">Позже</button>
        <button class="btn primary" data-act="auth-set-password">Сохранить пароль</button>
      </div>`
  });
}
Object.assign(ACTIONS, {
  'auth-login-mode': () => setAuthMode('login'),
  'auth-signup-mode': () => setAuthMode('signup'),
  'auth-submit': () => submitAuthForm(),
  'auth-forgot': () => sendReset(),
  'auth-set-password': async () => {
    const p1 = fieldValue('recPass'), p2 = fieldValue('recPass2');
    if (p1.length < 6) return toast('Пароль слишком короткий', { bad: true });
    if (p1 !== p2) return toast('Пароли не совпадают', { bad: true });
    try { await authUpdatePassword(p1); closeSheet(); toast('Пароль обновлён — теперь можно войти с новым паролем'); }
    catch (e){ toast('Не удалось сохранить пароль: ' + e.message, { bad: true }); }
  }
});

/* ---------- вход в приложение ---------- */
async function enterApp(user){
  const prevUser = S.user;
  if (!prevUser || prevUser.id !== user.id){
    S = blankState();
    S.user = user;
    const cached = cacheLoad(user.id);
    S.view.tab = (lsGet(LS.ui, {}) || {}).tab || 'overview';
    if (cached) S.sync.offlineSnapshotAt = cached.at;
  } else {
    S.user = user;
  }
  // тема, выбранная на другом устройстве, применяется после загрузки профиля
  if (S.settings.theme && S.settings.theme !== lgGetTheme()) applyTheme(S.settings.theme, { silent: true });
  showApp();
  render();
  S.sync.state = 'loading'; renderSync();
  const ok = await syncPull();
  render();
  if (ok) attachRealtime();
  watchConnectivity();
  const pending = outboxAll().length;
  if (ok && pending) flushOutbox().then(render);
}
function afterRenderTab(){
  if (S.view.tab === 'telegram' && !S.demo) loadTelegramStatus();
}

/* ---------- демо-режим ---------- */
function demoRandom(seed){ let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }
function startDemo(){
  S = blankState();
  S.demo = true;
  S.user = { id: 'demo', email: 'demo@fintrack.local' };
  const rnd = demoRandom(42);
  const shops = [['Пятёрочка', 'Продукты', 900, 4200], ['Biedronka', 'Продукты', 700, 3500], ['Такси', 'Транспорт', 300, 1600],
    ['Кофе', 'Кафе и рестораны', 120, 480], ['Аптека', 'Здоровье', 400, 2600], ['Билайн', 'Мобильный оператор', 900, 900],
    ['Ozon', 'Покупки', 500, 7000], ['Кино', 'Развлечения', 300, 1500], ['Аренда', 'Жильё', 2500, 2500], ['Бензин', 'Транспорт', 800, 2400]];
  const start = fromISO(today());
  for (let m = 11; m >= 0; m--){
    const base = new Date(start.getFullYear(), start.getMonth() - m, 1);
    const dim = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const monthOps = [];
    monthOps.push({ id: uid('d'), type: 'income', amount: round2(70000 + Math.round(rnd() * 20000)), category: 'Зарплата', note: 'Зарплата', date: toISO(new Date(base.getFullYear(), base.getMonth(), Math.min(10, dim))), source: 'demo' });
    if (rnd() > 0.5) monthOps.push({ id: uid('d'), type: 'income', amount: round2(3000 + Math.round(rnd() * 12000)), category: 'Подработка', note: 'Фриланс-заказ', date: toISO(new Date(base.getFullYear(), base.getMonth(), Math.min(20, dim))), source: 'demo' });
    for (let i = 0; i < 22; i++){
      const [name, cat, lo, hi] = shops[Math.floor(rnd() * shops.length)];
      monthOps.push({ id: uid('d'), type: 'expense', amount: round2(lo + rnd() * (hi - lo)), category: cat, note: name, date: toISO(new Date(base.getFullYear(), base.getMonth(), 1 + Math.floor(rnd() * dim))), source: 'demo' });
    }
    S.ops = S.ops.concat(monthOps);
  }
  S.ops = S.ops.filter(o => o.date <= today()).map(normalizeOperation).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  S.budgets = { 'Продукты': 45000, 'Транспорт': 12000, 'Кафе и рестораны': 6000, 'Жильё': 30000, 'Развлечения': 5000 };
  S.goals = [
    { id: uid('g'), name: 'Подушка безопасности', target: 300000, saved: 118000, date: addMonthsISO(today(), 8), contributions: [{ id: uid('c'), date: addMonthsISO(today(), -2), amount: 40000 }, { id: uid('c'), date: addMonthsISO(today(), -1), amount: 40000 }, { id: uid('c'), date: today(), amount: 38000 }] },
    { id: uid('g'), name: 'Отпуск летом', target: 120000, saved: 26000, date: addMonthsISO(today(), 10), contributions: [{ id: uid('c'), date: addMonthsISO(today(), -1), amount: 15000 }, { id: uid('c'), date: today(), amount: 11000 }] }
  ];
  S.recurring = [
    { id: uid('r'), name: 'Аренда квартиры', amount: 2500, period: 'monthly', next: addDaysISO(today(), 5), category: 'Жильё', type: 'expense', accountId: '' },
    { id: uid('r'), name: 'Мобильный оператор', amount: 900, period: 'monthly', next: addDaysISO(today(), 3), category: 'Мобильный оператор', type: 'expense', accountId: '' },
    { id: uid('r'), name: 'Подписка Spotify', amount: 60, period: 'monthly', next: addDaysISO(today(), 12), category: 'Подписки', type: 'expense', accountId: '' }
  ];
  S.accounts = [{ id: 'a1', name: 'Зарплатная карта', kind: 'card', initial: 15000 }, { id: 'a2', name: 'Наличные', kind: 'cash', initial: 2000 }];
  S.credits = [normalizeCredit({ id: 'cr1', bank: 'Сбербанк', purpose: 'Авто', principal: 480000, rate: 16.5, termMonths: 36, issueDate: addMonthsISO(today(), -10), createdAt: new Date().toISOString() })];
  // прошедшие платежи по кредиту считаем оплаченными и добавляем в историю операций
  S.credits.forEach(c => {
    (c.schedule || []).forEach(p => {
      if (p.date >= today()) return;
      p.paid = true; p.paidAt = new Date().toISOString();
      const op = normalizeOperation({ id: uid('d'), type: 'expense', amount: p.amount, category: 'Кредиты', note: 'Платёж по кредиту · ' + c.bank, date: p.date, source: 'credit' });
      p.operationId = op.id;
      S.ops.push(op);
    });
    const nxt = nextUnpaidPayment(c);
    if (nxt) c.paymentDate = nxt.date;
    c.paid = !nxt;
  });
  S.ops.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  S.cards = [normalizeCard({ id: 'cd1', bank: 'Тинькофф', name: 'Platinum', limit: 150000, used: 42000, rate: 24, graceDays: 120, minPaymentPercent: 5, issueDate: addMonthsISO(today(), -8), paymentDate: addDaysISO(today(), 9), statementDate: addDaysISO(today(), -4) })];
  S.rules = [{ id: uid('rl'), keyword: 'билайн', category: 'Мобильный оператор', type: 'expense' }, { id: uid('rl'), keyword: 'biedronka', category: 'Продукты', type: 'expense' }];
  S.sync.state = 'ok'; S.sync.lastSync = Date.now();
  showApp(); render();
  toast('Демо-режим: данные вымышленные, изменения не сохраняются', { timeout: 6000 });
}

/* ---------- запуск ---------- */
async function boot(){
  applyTheme(lgGetTheme(), { silent: true });
  watchSystemTheme();
  installErrorHooks();
  installGlobalEvents();
  installInputEvents();
  const savedUi = lsGet(LS.ui, {});
  if (savedUi && savedUi.tab) S.view.tab = savedUi.tab;

  const params = new URLSearchParams(location.search);
  const hash = String(location.hash || '');
  const isRecovery = /type=recovery/.test(hash) || /type=recovery/.test(params.get('type') || '');

  if (params.get('demo') === '1' || window.__FINTRACK_DEMO__ === true){ startDemo(); registerServiceWorker(); return; }
  const action = params.get('action');
  try { sbClient(); } catch (e){
    showAuth(); authMessage('Не удалось загрузить клиент Supabase. Проверьте интернет и обновите страницу.'); return;
  }
  const session = await authGetSession();
  if (session && !isRecovery){ await enterApp(session.user); }
  else {
    showAuth();
    if (isRecovery) openRecoverySheet();
  }
  if (action) applyStartAction(action);
  sbClient().auth.onAuthStateChange(async (event, s) => {
    if (event === 'PASSWORD_RECOVERY'){ showAuth(); openRecoverySheet(); return; }
    if (event === 'SIGNED_IN' && s && s.user && (!S.user || S.user.id !== s.user.id)){ await enterApp(s.user); }
    if (event === 'SIGNED_OUT'){ S = blankState(); showAuth(); }
  });
  registerServiceWorker();
}
function applyStartAction(action){
  if (action === 'operations' || action === 'telegram'){ S.view.tab = action; lsSet(LS.ui, { tab: action }); }
  if (action === 'new'){ setTimeout(() => { draft.op = null; modalOp(); }, 400); }
  if (action) history.replaceState(null, '', location.pathname);
}
function installInputEvents(){
  const handler = e => {
    const t = e.target.closest('[data-inp]');
    if (!t) return;
    const kind = t.dataset.inp;
    if (kind === 'qadd-preview') qaddPreview();
    else if (kind === 'op-filter'){
      S.view.opQuery = fieldValue('opQuery'); S.view.opType = fieldValue('opType');
      S.view.opCategory = fieldValue('opCategory'); S.view.opMonth = fieldValue('opMonth'); S.view.opLimit = 40;
      renderOpsResult();
    } else if (kind === 'analytics-month'){ S.view.analyticsMonth = fieldValue('anMonth'); renderView(); }
    else if (kind === 'credit-calc') updateCreditPreview();
    else if (kind === 'card-calc') updateCardPreview();
    else if (kind === 'import-map'){ readImportMapping(); renderImportBody(); }
    else if (kind === 'theme'){ applyTheme(fieldValue('setTheme')); saveProfileToCloud(); toast('Тема обновлена'); }
    else if (kind === 'ai-parse'){
      S.settings.aiParse = !!(t.checked);
      saveProfileToCloud();
      toast(S.settings.aiParse ? 'Текст будет разбираться моделью (если функция развёрнута)' : 'Вернулся к словарю синонимов');
    }
    else if (kind === 'photo-file'){ const f = t.files && t.files[0]; t.value = ''; handlePhotoFile(f); }
  };
  document.addEventListener('input', handler);
  document.addEventListener('change', e => {
    const t = e.target.closest('[data-inp="import-file"]');
    if (!t) return;
    const file = t.files && t.files[0];
    if (!file) return;
    readFileText(file).then(text => {
      const parsed = parseCSV(text);
      importDraft = { rows: parsed.rows, mapping: detectMapping(parsed.rows), delimiter: parsed.delim };
      importDraft.mapping.delimiter = parsed.delim;
      renderImportBody();
    }).catch(err => toast('Не удалось прочитать файл: ' + err.message, { bad: true }));
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderSync(); });
  window.addEventListener('beforeunload', () => { lsSet(LS.ui, { tab: S.view.tab }); if (S.user && !S.demo) cacheSave(); });
}
function registerServiceWorker(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
  navigator.serviceWorker.register('sw.js').catch(error => {
    console.warn('Service Worker registration failed:', error);
    if (typeof diagLog === 'function') diagLog('pwa', error && error.message || String(error), 'registerServiceWorker');
  });
}
document.addEventListener('DOMContentLoaded', boot)
