/* ============================================================================
   views.js — каркас интерфейса, главная, операции, аналитика
   ========================================================================== */

const TABS = [
  { id: 'overview', icon: 'home', title: 'Главная' },
  { id: 'operations', icon: 'swap', title: 'Операции' },
  { id: 'analytics', icon: 'chart', title: 'Аналитика' },
  { id: 'budgets', icon: 'budget', title: 'Бюджеты' },
  { id: 'goals', icon: 'goal', title: 'Цели' },
  { id: 'recurring', icon: 'repeat', title: 'Платежи' },
  { id: 'credits', icon: 'bank', title: 'Кредиты' },
  { id: 'telegram', icon: 'send', title: 'Telegram AI' },
  { id: 'tools', icon: 'tools', title: 'Функции' },
  { id: 'settings', icon: 'gear', title: 'Настройки' }
];
const VIEWS = {};

function render(){
  if (!S.user && !S.demo) return;
  renderNav(); renderTopbar(); renderBanner(); renderSync(); renderView();
}
function renderNav(){
  const btns = TABS.map(t => `<button data-act="go" data-tab="${t.id}" class="${S.view.tab === t.id ? 'active' : ''}" aria-label="${escapeAttr(t.title)}" title="${escapeAttr(t.title)}" aria-current="${S.view.tab === t.id ? 'page' : 'false'}"><i aria-hidden="true">${icon(t.icon)}</i><span>${t.title}</span></button>`).join('');
  const side = $('navSide'); if (side) side.innerHTML = btns;
  const mob = $('navMobile');
  if (mob) mob.innerHTML = TABS.slice(0, 6).map(t => `<button class="btn sm ${S.view.tab === t.id ? 'primary' : ''}" data-act="go" data-tab="${t.id}" aria-current="${S.view.tab === t.id ? 'page' : 'false'}">${t.title}</button>`).join('')
    + `<button class="btn sm" data-act="show-more-tabs" aria-label="Показать остальные разделы">… ещё</button>`;
}
function renderTopbar(){
  const headings = {
    overview: ['Финансы под контролем', 'Ваши деньги, цели и планы — в одном месте'],
    operations: ['Операции', 'Все доходы и расходы в одном удобном списке'],
    analytics: ['Аналитика', 'Понимайте, куда движутся ваши деньги'],
    budgets: ['Бюджеты', 'Лимиты и расходы без неприятных сюрпризов'],
    goals: ['Финансовые цели', 'Отмечайте прогресс на пути к важному'],
    recurring: ['Регулярные платежи', 'Подписки, счета и ближайшие списания'],
    credits: ['Кредиты и карты', 'Платежи, остатки и графики в одном месте'],
    telegram: ['Telegram AI', 'Финансовый помощник в вашем мессенджере'],
    tools: ['Инструменты', 'Импорт, экспорт и полезные финансовые расчёты'],
    settings: ['Настройки', 'Управляйте аккаунтом и параметрами приложения']
  };
  const [title, subtitle] = headings[S.view.tab] || headings.overview;
  const titleEl = $('pageTitle'); if (titleEl) titleEl.textContent = title;
  const subtitleEl = $('pageSubtitle'); if (subtitleEl) subtitleEl.textContent = subtitle;
  document.title = `${title} — FinTrack AI`;
  const el = $('accountLine');
  if (el) el.textContent = S.demo ? 'Демо-режим' : ((S.user && S.user.email) || '');
  const ml = $('monthLabel'); if (ml) ml.textContent = fmtMonth(thisMonthKey());
  const tl = $('todayLabel'); if (tl) tl.textContent = fromISO(today()).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
}
function renderBanner(){
  const host = $('bannerHost'); if (!host) return;
  const parts = [];
  if (S.demo) parts.push(`<div class="banner">◉ Демо-режим: данные вымышленные и не сохраняются. <button class="btn sm primary" data-act="exit-demo" style="margin-left:auto">Создать аккаунт</button></div>`);
  if (S.sync.state === 'error') parts.push(`<div class="banner bad">⚠ Не удалось загрузить данные: ${escapeHtml(S.sync.message)}.
    <button class="btn sm" data-act="retry-sync" style="margin-left:auto">Повторить</button>
    <button class="btn sm ghost" data-act="logout-anyway">Выйти</button></div>`);
  else if (S.sync.state === 'offline') parts.push(`<div class="banner">📴 Нет связи с сервером — показываю сохранённую копию от ${escapeHtml(new Date(S.sync.offlineSnapshotAt || Date.now()).toLocaleString('ru-RU'))}.
    Изменения сохранятся и уйдут в облако автоматически. <button class="btn sm" data-act="retry-sync" style="margin-left:auto">Повторить</button></div>`);
  else if (S.sync.pending) parts.push(`<div class="banner">⏳ ${S.sync.pending} ${plural(S.sync.pending, 'изменение ждёт', 'изменения ждут', 'изменений ждут')} отправки в облако. Повторяю каждые 5 секунд${S.sync.state === 'pending' && S.sync.message ? ` · причина: ${escapeHtml(S.sync.message)}` : ''}.
    <button class="btn sm" data-act="retry-sync" style="margin-left:auto">Отправить сейчас</button></div>`);
  host.innerHTML = parts.join('');
}
function renderSync(){
  const host = $('syncBar'); if (!host) return;
  if (S.demo){ host.className = 'sync-bar warn'; host.innerHTML = 'Демо-режим: данные не сохраняются'; return; }
  const map = {
    idle: ['', 'Готово'],
    loading: ['', 'Загружаю данные…'],
    ok: ['', 'Синхронизировано ' + (S.sync.lastSync ? new Date(S.sync.lastSync).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '')],
    pending: ['warn', 'Ждут отправки: ' + S.sync.pending],
    offline: ['warn', 'Офлайн-копия'],
    error: ['bad', 'Нет данных из облака']
  };
  let [cls, text] = map[S.sync.state] || ['', ''];
  // показываем очередь даже когда синхронизация в порядке — иначе непонятно, что изменения ещё не улетели
  if (S.sync.pending && S.sync.state === 'ok'){ cls = 'warn'; text = 'Ждут отправки: ' + S.sync.pending; }
  host.innerHTML = `<div class="row between"><span>${escapeHtml(text)}</span>
    <button class="btn sm ghost" data-act="retry-sync" title="Синхронизировать">⟳</button></div>
    ${S.sync.state === 'error' ? '<div class="mt8">Запись заблокирована, чтобы не потерять данные. Проверьте интернет и нажмите ⟳</div>' : ''}
    ${S.sync.offlineSnapshotAt && S.sync.state === 'offline' ? `<div class="mt8">Копия от ${escapeHtml(new Date(S.sync.offlineSnapshotAt).toLocaleString('ru-RU'))}</div>` : ''}`;
}
function renderView(){
  const host = $('view'); if (!host) return;
  const fn = VIEWS[S.view.tab] || VIEWS.overview;
  host.innerHTML = fn();
  if (typeof afterRenderTab === 'function') afterRenderTab();
}
function go(tab){ S.view.tab = tab; closeSheet(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }

/* ============================ ГЛАВНАЯ ============================ */
VIEWS.overview = function(){
  const st = monthStats(), prev = monthStats(monthKey(addMonthsISO(today(), -1)));
  const safe = safeToSpendPerDay();
  const series = monthSeries(6);
  const byCat = spendByCategory(thisMonthKey(), 'expense').slice(0, 7);
  const recent = S.ops.slice(0, 6);
  const upcoming = upcomingCreditPayments(10).concat(upcomingRecurring(10).map(r => ({ kind: 'rec', id: r.id, title: r.name, date: r.next, amount: r.amount, days: daysUntil(r.next) })))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  const deltaExp = prev.expense ? Math.round((st.expense - prev.expense) / prev.expense * 100) : null;
  const deltaInc = prev.income ? Math.round((st.income - prev.income) / prev.income * 100) : null;
  const topGrowth = topGrowingCategories(thisMonthKey());
  const insight = buildInsight(st, prev, byCat, topGrowth, safe);
  return `
  <section class="grid dashboard-top">
    <div class="card pad dashboard-balance">
      <div class="row between wrap balance-heading">
        <div>
          <div class="eyebrow">Общий баланс · за всё время</div>
          <div class="row gap12 mt8"><div class="balance-number">${money(allTimeBalance())}</div></div>
          <div class="row gap8 wrap mt8">
            <span class="tag ${st.balance >= 0 ? 'ok' : 'bad'}">${st.balance >= 0 ? '↗' : '↘'} ${escapeHtml(fmtMonth(thisMonthKey()))}: ${money(st.balance)}</span>
            ${deltaInc === null ? '' : `<span class="tag ${deltaInc >= 0 ? 'ok' : 'bad'}">доходы ${deltaInc >= 0 ? '+' : ''}${deltaInc}% к прошлому месяцу</span>`}
            ${deltaExp === null ? '' : `<span class="tag ${deltaExp <= 0 ? 'ok' : 'bad'}">расходы ${deltaExp >= 0 ? '+' : ''}${deltaExp}%</span>`}
          </div>
        </div>
        <div class="right">
          <div class="eyebrow">Проведено операций</div>
          <div class="bold" style="font-size:22px">${S.ops.length}</div>
          <div class="muted small">в базе, ${S.ops.filter(o => monthKey(o.date) === thisMonthKey()).length} за месяц</div>
        </div>
      </div>
      <div class="grid g3 mt24 balance-metrics">
        ${metric('Доходы за месяц', money(st.income), deltaInc === null ? 'нет прошлого месяца' : (deltaInc >= 0 ? '+' : '') + deltaInc + '% к прошлому', 'income')}
        ${metric('Расходы за месяц', money(st.expense), deltaExp === null ? 'нет прошлого месяца' : (deltaExp >= 0 ? '+' : '') + deltaExp + '% к прошлому', 'expense')}
        ${metric('Можно тратить в день', money(safe.perDay), `осталось ${safe.left} дн. · обязательства ${money(safe.obligations)}`)}
      </div>
      ${backupDue() ? `<div class="banner mt16">
        <span class="banner-ic">${icon('disk')}</span>
        <div class="grow"><b>Давно не делали резервную копию.</b> История живёт в вашем Supabase, но архив с операциями, бюджетами и настройками не помешает.</div>
        <button class="btn sm primary" data-act="export-zip">Скачать архив</button>
      </div>` : ''}
      <div class="row gap8 wrap mt16">
        <button class="btn primary" data-act="op-new">＋ Новая операция <span class="kbd">N</span></button>
        <button class="btn" data-act="goto-operations">Все операции</button>
        <button class="btn" data-act="quick-import">Импорт выписки</button>
      </div>
    </div>
    <div class="card pad dashboard-quick">
      <div class="quick-title-row"><div><div class="eyebrow">Быстрый старт</div><div class="section-title mt4">Добавить операцию</div></div><span class="quick-spark" aria-hidden="true">✦</span></div>
      <div class="muted small mt8">Напишите как обычно: «кофе 250» или «зарплата 80к» — я заполню форму за вас.</div>
      <div class="row gap8 mt12" style="align-items:flex-start">
        <input id="qadd" class="field grow" placeholder="например: такси 42,50" data-inp="qadd-preview" aria-label="Быстрый ввод операции">
        <button class="btn icon-btn" data-act="voice-record" id="voiceBtn" title="Записать голосом" aria-label="Записать голосом">${icon('mic')}</button>
        <button class="btn icon-btn" data-act="photo-pick" title="Фото чека" aria-label="Прочитать чек с фото">${icon('camera')}</button>
        <button class="btn primary" data-act="qadd-submit">Добавить</button>
      </div>
      <input type="file" id="photoInput" accept="image/*" capture="environment" class="hidden" data-inp="photo-file">
      <div id="qaddPrev" class="mt12 small muted">Введите текст — покажу, что распознал.</div>
      <div class="divider"></div>
      <div class="row between"><div class="section-title">Скоро списания</div><span class="tag">10 дней</span></div>
      <div class="list mt8">${upcoming.length ? upcoming.map(u => `<div class="item">
          <div class="avatar">${u.kind === 'card' ? '💳' : u.kind === 'credit' ? '🏦' : '↻'}</div>
          <div class="grow"><div class="bold truncate">${escapeHtml(u.title)}</div>
            <div class="muted small">${escapeHtml(fmtDate(u.date))} · ${escapeHtml(relDays(u.date))}</div></div>
          <div class="amount expense mono">${money(u.amount)}</div>
        </div>`).join('') : '<div class="muted small">В ближайшие 10 дней обязательных платежей нет.</div>'}</div>
    </div>
  </section>
  <section class="grid dashboard-insights mt24">
    <div class="card pad chart-card">
      <div class="row between"><div><div class="section-title">Динамика за 6 месяцев</div><div class="muted small mt4">Доходы и расходы по месяцам</div></div>
        <div class="row gap8"><span class="pill" style="color:#7dffcf">● доходы</span><span class="pill" style="color:#ff9db6">● расходы</span></div></div>
      <div class="mt12">${chartLine({ labels: series.map(s => s.label), height: 250, series: [
        { id: 'inc', name: 'Доходы', color: '#37e0a4', data: series.map(s => s.income) },
        { id: 'exp', name: 'Расходы', color: '#ff719f', data: series.map(s => s.expense) }] })}</div>
    </div>
    <div class="card pad">
      <div class="row between"><div><div class="section-title">Куда уходят деньги</div><div class="muted small mt4">${escapeHtml(fmtMonth(thisMonthKey()))}</div></div>
        <button class="btn sm ghost" data-act="go" data-tab="analytics">Подробнее →</button></div>
      <div class="mt12">${chartDonut({ items: byCat.map((c, i) => ({ label: c.category, value: c.value, color: PALETTE[i % PALETTE.length] })), title: 'расходы месяца' })}</div>
      <div class="mt12">${byCat.length ? chartLegend(byCat.map((c, i) => ({ label: c.category, value: c.value, color: PALETTE[i % PALETTE.length] })), st.expense) : ''}</div>
    </div>
  </section>
  <section class="grid dashboard-bottom mt24">
    <div class="card pad recent-card">
      <div class="row between"><div class="section-title">Последние операции</div>
        <button class="btn sm ghost" data-act="go" data-tab="operations">Все →</button></div>
      <div class="list mt8">${recent.length ? recent.map(opRow).join('') : empty('💸', 'Пока пусто', 'Добавьте первую операцию — вручную или текстом в быстром вводе.')}</div>
    </div>
    <div class="card pad">
      <div class="row between"><div class="section-title">Что говорят цифры</div><span class="tag blue">без магии: по вашим данным</span></div>
      <div class="chat-bubble mt12">${insight}</div>
      ${topGrowth.length ? `<div class="mt16"><div class="muted tiny">РОСТ РАСХОДОВ К ПРОШЛОМУ МЕСЯЦУ</div>
        <div class="list mt8">${topGrowth.slice(0, 4).map(g => `<div class="kv"><span>${escapeHtml(g.category)}</span>
          <span class="row gap8"><b class="mono">${money(g.now)}</b><span class="tag bad">+${g.delta}%</span></span></div>`).join('')}</div></div>` : ''}
    </div>
  </section>`;
};
function topGrowingCategories(key){
  const now = spendByCategory(key, 'expense'), prev = spendByCategory(monthKey(addMonthsISO(key + '-01', -1)), 'expense');
  const prevMap = new Map(prev.map(c => [c.category, c.value]));
  return now.map(c => {
    const was = prevMap.get(c.category) || 0;
    return { category: c.category, now: c.value, was, delta: was ? Math.round((c.value - was) / was * 100) : (c.value > 0 ? 100 : 0) };
  }).filter(c => c.now > 0 && c.delta > 5 && (c.was > 0 || c.now > 1000)).sort((a, b) => b.delta - a.delta);
}
function buildInsight(st, prev, byCat, topGrowth, safe){
  const bits = [];
  bits.push(st.balance >= 0
    ? `В ${escapeHtml(fmtMonth(thisMonthKey()))} доходы больше расходов на <b>${money(st.balance)}</b>.`
    : `Расходы превышают доходы на <b>${money(Math.abs(st.balance))}</b> — стоит посмотреть крупные категории.`);
  if (byCat[0]) bits.push(`Больше всего ушло на «${escapeHtml(byCat[0].category)}» — <b>${money(byCat[0].value)}</b> (${percent(byCat[0].value, st.expense)} расходов).`);
  if (prev.expense && st.expense > prev.expense * 1.15) bits.push(`Расходы выросли на ${Math.round((st.expense - prev.expense) / prev.expense * 100)}% к прошлому месяцу.`);
  if (topGrowth[0]) bits.push(`Сильнее всего выросла категория «${escapeHtml(topGrowth[0].category)}» (+${topGrowth[0].delta}%).`);
  if (safe.obligations > 0) bits.push(`До конца месяца ещё <b>${money(safe.obligations)}</b> обязательных платежей — свободно ${money(safe.free)}, это ${money(safe.perDay)} в день.`);
  if (!S.ops.length) bits.push('Как только появятся операции, здесь будет анализ именно по вашим цифрам.');
  return bits.map(b => `<div class="mt8">• ${b}</div>`).join('');
}

/* ============================ ОПЕРАЦИИ ============================ */
VIEWS.operations = function(){
  const f = S.view;
  const months = [...new Set(S.ops.map(o => monthKey(o.date)))].sort().reverse().slice(0, 24);
  const list = filteredOps();
  const shown = list.slice(0, f.opLimit);
  const sumInc = sumMoney(list.filter(o => o.type === 'income'), o => o.amount);
  const sumExp = sumMoney(list.filter(o => o.type === 'expense'), o => o.amount);
  return `
  <div class="card pad">
    <div class="row gap8 wrap" style="align-items:flex-start">
      <input id="qadd" class="field grow" placeholder="Быстрый ввод: «магнит 2450 вчера», «зарплата 80к»" data-inp="qadd-preview" aria-label="Быстрый ввод">
      <button class="btn icon-btn" data-act="voice-record" id="voiceBtn" title="Записать голосом" aria-label="Записать голосом">${icon('mic')}</button>
      <button class="btn icon-btn" data-act="photo-pick" title="Фото чека" aria-label="Прочитать чек с фото">${icon('camera')}</button>
      <button class="btn primary" data-act="qadd-submit">Добавить</button>
      <button class="btn" data-act="op-new">Расширенная форма</button>
    </div>
    <input type="file" id="photoInput" accept="image/*" capture="environment" class="hidden" data-inp="photo-file">
    <div id="qaddPrev" class="mt12 small muted">Распознаю сумму, дату, категорию. Правило «ключевое слово → категория» можно сохранить в один клик.</div>
  </div>

  <div class="card pad mt24">
    <div class="row between wrap gap8">
      <div class="section-title">Фильтры</div>
      <div class="row gap8 wrap">
        <button class="btn sm" data-act="export-csv">Экспорт CSV</button>
        <button class="btn sm" data-act="export-json">Экспорт JSON</button>
        <button class="btn sm primary" data-act="quick-import">Импорт выписки</button>
      </div>
    </div>
    <div class="form-grid mt12">
      <div><label class="label" for="opQuery">Поиск по описанию</label><input id="opQuery" class="field" value="${escapeAttr(f.opQuery)}" data-inp="op-filter" placeholder="пятёрочка, такси…"></div>
      <div><label class="label" for="opType">Тип</label><select id="opType" class="field" data-inp="op-filter">
        <option value="all"${f.opType === 'all' ? ' selected' : ''}>Все</option>
        <option value="expense"${f.opType === 'expense' ? ' selected' : ''}>Расходы</option>
        <option value="income"${f.opType === 'income' ? ' selected' : ''}>Доходы</option></select></div>
      <div><label class="label" for="opCategory">Категория</label><select id="opCategory" class="field" data-inp="op-filter">
        <option value="all">Все</option>
        ${categoriesFlat().map(c => `<option value="${escapeAttr(c)}"${f.opCategory === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
      <div><label class="label" for="opMonth">Месяц</label><select id="opMonth" class="field" data-inp="op-filter">
        <option value="all">За всё время</option>
        ${months.map(m => `<option value="${m}"${f.opMonth === m ? ' selected' : ''}>${escapeHtml(fmtMonth(m))}</option>`).join('')}</select></div>
    </div>
  </div>

  <div id="opResult">${opsResultHtml()}</div>`;
};
/* Результат фильтрации в отдельном контейнере: обновляем только его,
   поэтому поле поиска сохраняет фокус и ввод не сбивается. */
function opsResultHtml(){
  const f = S.view, list = filteredOps(), shown = list.slice(0, f.opLimit);
  const sumInc = sumMoney(list.filter(o => o.type === 'income'), o => o.amount);
  const sumExp = sumMoney(list.filter(o => o.type === 'expense'), o => o.amount);
  return `
  <div class="card pad mt24">
    <div class="row between wrap gap8">
      <div class="muted small">Найдено ${list.length} ${plural(list.length, 'операция', 'операции', 'операций')}: доходы <b class="ok">${money(sumInc)}</b>, расходы <b class="bad">${money(sumExp)}</b>, итог <b>${money(round2(sumInc - sumExp))}</b></div>
      <button class="btn sm ghost" data-act="op-reset-filters">Сбросить фильтры</button>
    </div>
    <div class="list mt12">${shown.length ? shown.map(opRow).join('') : empty('🔍', 'Ничего не найдено', 'Измените фильтры или добавьте операцию.')}</div>
    ${list.length > shown.length ? `<div class="row center mt16"><button class="btn" data-act="op-more">Показать ещё ${Math.min(40, list.length - shown.length)}</button></div>` : ''}
  </div>`;
}
function renderOpsResult(){ const host = $('opResult'); if (host) host.innerHTML = opsResultHtml(); }
function filteredOps(){
  const f = S.view, q = (f.opQuery || '').toLowerCase().trim();
  return S.ops.filter(o =>
    (f.opType === 'all' || o.type === f.opType) &&
    (f.opCategory === 'all' || o.category === f.opCategory) &&
    (f.opMonth === 'all' || monthKey(o.date) === f.opMonth) &&
    (!q || (o.note + ' ' + o.category).toLowerCase().includes(q))
  );
}

/* ============================ АНАЛИТИКА ============================ */
VIEWS.analytics = function(){
  const key = S.view.analyticsMonth || thisMonthKey();
  const prevKey = monthKey(addMonthsISO(key + '-01', -1));
  const st = monthStats(key), prev = monthStats(prevKey);
  const byCat = spendByCategory(key, 'expense');
  const byIncome = spendByCategory(key, 'income');
  const days = [...Array(daysInMonth(key))].map((_, i) => {
    const date = key + '-' + pad2(i + 1);
    let v = 0; for (const o of S.ops) if (o.date === date && o.type === 'expense') v += num(o.amount);
    return { label: String(i + 1), value: round2(v) };
  }).filter(d => d.value > 0);
  const topOps = S.ops.filter(o => monthKey(o.date) === key && o.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5);
  const growth = topGrowingCategories(key);
  const dailyAvg = st.expense / Math.max(1, Math.min(fromISO(key + '-01').getMonth() === new Date().getMonth() ? fromISO(today()).getDate() : 30, daysInMonth(key)));
  const dExp = prev.expense ? Math.round((st.expense - prev.expense) / prev.expense * 100) : null;
  const dInc = prev.income ? Math.round((st.income - prev.income) / prev.income * 100) : null;
  const months = [...new Set([thisMonthKey(), ...S.ops.map(o => monthKey(o.date))])].sort().reverse();
  return `
  <div class="card pad">
    <div class="row between wrap gap8">
      <div><div class="section-title">Аналитика</div><div class="muted small mt4">Все расчёты по вашим операциям, без «демо-цифр»</div></div>
      <div class="row gap8">
        <select id="anMonth" class="field" data-inp="analytics-month" style="width:auto">${months.map(m => `<option value="${m}"${m === key ? ' selected' : ''}>${escapeHtml(fmtMonth(m))}</option>`).join('')}</select>
        <button class="btn sm" data-act="analytics-report">Скопировать отчёт</button>
      </div>
    </div>
    <div class="grid g4 mt16">
      ${metric('Доходы', money(st.income), dInc === null ? 'нет данных за прошлый месяц' : (dInc >= 0 ? '+' : '') + dInc + '% к ' + escapeHtml(fmtMonth(prevKey)))}
      ${metric('Расходы', money(st.expense), dExp === null ? 'нет данных за прошлый месяц' : (dExp >= 0 ? '+' : '') + dExp + '% к ' + escapeHtml(fmtMonth(prevKey)))}
      ${metric('Баланс месяца', money(st.balance), st.balance >= 0 ? 'в плюсе' : 'в минусе')}
      ${metric('В среднем в день', money(dailyAvg), 'по расходам месяца')}
    </div>
  </div>

  <div class="grid g-side mt24">
    <div class="card pad">
      <div class="section-title">Расходы по категориям</div>
      <div class="mt12">${chartDonut({ items: byCat.slice(0, 8).map((c, i) => ({ label: c.category, value: c.value, color: PALETTE[i % PALETTE.length] })), size: 230, title: 'расходы' })}</div>
    </div>
    <div class="card pad">
      <div class="section-title">Детализация</div>
      ${byCat.length ? `<table class="table mt12"><thead><tr><th>Категория</th><th>Сумма</th><th>Доля</th><th>Операций</th></tr></thead><tbody>
        ${byCat.map(c => { const cnt = S.ops.filter(o => o.type === 'expense' && o.category === c.category && monthKey(o.date) === key).length;
          return `<tr><td>${escapeHtml(c.category)}</td><td class="mono">${money(c.value)}</td><td class="mono">${percent(c.value, st.expense)}</td><td class="muted">${cnt}</td></tr>`; }).join('')}
        </tbody></table>` : empty('📊', 'Нет расходов за этот месяц', 'Выберите другой месяц или добавьте операции.')}
      ${byIncome.length ? `<div class="divider"></div><div class="muted tiny">ДОХОДЫ</div>
        <div class="list mt8">${byIncome.map(c => `<div class="kv"><span>${escapeHtml(c.category)}</span><b class="mono ok">${money(c.value)}</b></div>`).join('')}</div>` : ''}
    </div>
  </div>

  <div class="grid g-main mt24">
    <div class="card pad">
      <div class="section-title">Расходы по дням</div>
      <div class="muted small mt4">${escapeHtml(fmtMonth(key))}</div>
      <div class="mt12">${days.length ? chartBars({ items: days, height: 180 }) : empty('🗓', 'Нет расходов в этом месяце', '')}</div>
    </div>
    <div class="card pad">
      <div class="section-title">Топ-5 расходов месяца</div>
      <div class="list mt8">${topOps.length ? topOps.map(o => `<div class="item">
          <div class="avatar">${escapeHtml((o.category || '?').slice(0, 1))}</div>
          <div class="grow"><div class="bold truncate">${escapeHtml(o.note || o.category)}</div>
            <div class="muted small">${escapeHtml(o.category)} · ${escapeHtml(fmtDate(o.date))}</div></div>
          <div class="amount expense mono">${money(o.amount)}</div></div>`).join('') : '<div class="muted small">Нет расходов за месяц.</div>'}</div>
    </div>
  </div>

  ${growth.length ? `<div class="card pad mt24"><div class="section-title">Что выросло к прошлому месяцу</div>
    <div class="list mt8">${growth.slice(0, 6).map(g => `<div class="item">
      <div class="grow"><div class="bold">${escapeHtml(g.category)}</div><div class="muted small">было ${money(g.was)} → стало ${money(g.now)}</div></div>
      <span class="tag bad">+${g.delta}%</span><span class="amount mono">${money(g.now - g.was)}</span></div>`).join('')}</div></div>` : ''}`;
};
