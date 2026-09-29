/* ============================================================================
   ui.js — модальные окна, тосты с отменой, делегирование событий
   Никаких onclick="..." в разметке: все действия идут через data-act,
   поэтому пользовательские данные больше не попадают в JS-строки.
   ========================================================================== */

/* ---------- иконки (SVG: одинаково выглядят в любой системе) ---------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/>',
  swap: '<path d="M4 8h13l-3.2-3.2M20 16H7l3.2 3.2"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16V11M12 16V8M16 16v-6"/>',
  budget: '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="M4 10h16M9 14h6"/>',
  goal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4"/>',
  repeat: '<path d="M4 9a8 8 0 0 1 13.6-5.6L20 5.6"/><path d="M20 15A8 8 0 0 1 6.4 20.6L4 18.4"/><path d="M20 3v4h-4M4 21v-4h4"/>',
  bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9h14v-9"/><path d="M9 19v-6M15 19v-6"/>',
  send: '<path d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z"/><path d="M10 13l4-4"/>',
  tools: '<path d="M12 3v3M12 18v3M4.2 7.2l2.1 2.1M17.7 14.7l2.1 2.1M3 12h3M18 12h3M4.2 16.8l2.1-2.1M17.7 9.3l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.7 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3.5v3M16 3.5v3"/>',
  wallet: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M3.5 10h17"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  coins: '<ellipse cx="12" cy="6.5" rx="7" ry="3"/><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/><path d="M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v3M8.5 21h7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  camera: '<path d="M4 8.5h2.5L8 6h8l1.5 2.5H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.5" r="3.4"/>',
  disk: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M7.5 4.5v5h8v-5"/><path d="M7.5 19.5v-5h9v5"/>'
};
function icon(name, cls){
  const p = ICONS[name];
  if (!p) return '';
  return `<svg class="${cls || 'ic'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

const $ = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------- тосты ---------- */
function toast(text, opts){
  const o = opts || {};
  const host = $('toasts');
  if (!host) return;
  const node = document.createElement('div');
  node.className = 'toast' + (o.bad ? ' bad' : '');
  node.innerHTML = `<span class="grow">${escapeHtml(text)}</span>`;
  if (o.action){
    const b = document.createElement('button');
    b.className = 'act'; b.textContent = o.action;
    b.addEventListener('click', () => { node.remove(); if (o.onAction) o.onAction(); });
    node.appendChild(b);
  }
  host.appendChild(node);
  while (host.children.length > 3) host.removeChild(host.firstChild);
  const ms = o.timeout || (o.action ? 8000 : 3800);
  setTimeout(() => node.remove(), ms);
}

/* ---------- модальные окна ---------- */
let lastFocused = null;
function openSheet(opts){
  const host = $('sheetHost');
  const wide = opts.wide ? ' wide' : '';
  host.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(opts.title || 'Окно')}">
      <div class="sheet${wide}">
        <div class="row between">
          <div><div class="section-title">${escapeHtml(opts.title || '')}</div>
            ${opts.subtitle ? `<div class="muted small mt4">${escapeHtml(opts.subtitle)}</div>` : ''}</div>
          <button class="btn icon ghost" data-act="closeSheet" aria-label="Закрыть">✕</button>
        </div>
        <div class="mt16">${opts.html || ''}</div>
      </div>
    </div>`;
  host.classList.remove('hidden');
  const sheet = host.querySelector('.sheet');
  sheet.setAttribute('tabindex', '-1');
  setTimeout(() => { const f = sheet.querySelector('input,select,textarea,button'); if (f) f.focus(); }, 30);
  lastFocused = document.activeElement;
  return sheet;
}
function closeSheet(){
  const host = $('sheetHost');
  host.innerHTML = '';
  host.classList.add('hidden');
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}
function sheetTrap(e){
  if (e.key === 'Escape'){ closeSheet(); return; }
  if (e.key !== 'Tab') return;
  const sheet = document.querySelector('#sheetHost .sheet');
  if (!sheet) return;
  const items = sheet.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])');
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
}
function confirmSheet(opts){
  return new Promise(resolve => {
    openSheet({
      title: opts.title || 'Подтвердите действие',
      subtitle: opts.subtitle || '',
      html: `<div class="${opts.danger ? 'bad' : 'muted'}">${opts.text || ''}</div>
        ${opts.confirmWord ? `<label class="label mt16">Введите «${escapeHtml(opts.confirmWord)}» для подтверждения</label><input id="cfmWord" class="field" autocomplete="off">` : ''}
        <div class="row mt16" style="justify-content:flex-end">
          <button class="btn ghost" data-act="confirm-no">Отмена</button>
          <button class="btn ${opts.danger ? 'danger' : 'primary'}" data-act="confirm-yes">${escapeHtml(opts.confirmText || 'Подтвердить')}</button>
        </div>`
    });
    const answer = v => { closeSheet(); resolve(v); };
    ACTIONS['confirm-yes'] = () => {
      if (opts.confirmWord){
        const v = ($('cfmWord').value || '').trim();
        if (v !== opts.confirmWord){ toast('Слово подтверждения введено неверно', { bad: true }); return; }
      }
      answer(true);
    };
    ACTIONS['confirm-no'] = () => answer(false);
  });
}
function inputs(ids){ const out = {}; ids.forEach(id => { const el = $(id); out[id] = el ? el.value : ''; }); return out; }
function fieldValue(id){ const el = $(id); return el ? String(el.value || '').trim() : ''; }
function setField(id, v){ const el = $(id); if (el) el.value = v === null || v === undefined ? '' : v; }

/* ---------- делегирование ---------- */
const ACTIONS = {};
function installGlobalEvents(){
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (typeof ACTIONS[act] === 'function'){ e.preventDefault(); ACTIONS[act](t, e); }
  });
  document.addEventListener('keydown', e => {
    if ($('sheetHost') && !$('sheetHost').classList.contains('hidden')){ sheetTrap(e); return; }
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) {
      if (e.key === 'Escape' && e.target.blur) e.target.blur();
      return;
    }
    if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т'){ e.preventDefault(); ACTIONS['op-new'] && ACTIONS['op-new'](); }
    else if (e.key === '/'){ e.preventDefault(); ACTIONS['goto-operations'] && ACTIONS['goto-operations'](); setTimeout(() => { const s = $('opQuery'); if (s) s.focus(); }, 60); }
    else if (e.key === '?'){ ACTIONS['show-shortcuts'] && ACTIONS['show-shortcuts'](); }
  });
  const sheetHost = $('sheetHost');
  if (sheetHost) sheetHost.addEventListener('mousedown', e => { if (e.target === sheetHost.querySelector('.modal')) closeSheet(); });
}

/* ---------- мелкие помощники разметки ---------- */
function empty(icon, title, text, actionHtml){
  return `<div class="empty"><span class="big">${icon}</span><div class="bold">${escapeHtml(title)}</div>
    ${text ? `<div class="small mt8">${escapeHtml(text)}</div>` : ''}${actionHtml ? `<div class="mt12">${actionHtml}</div>` : ''}</div>`;
}
function metric(label, value, sub, cls){
  return `<div class="metric"><div class="muted tiny">${escapeHtml(label)}</div>
    <div class="value${cls === 'sm' ? ' sm' : ''} ${cls && cls !== 'sm' ? cls : ''}">${value}</div>
    ${sub ? `<div class="small muted mt4">${sub}</div>` : ''}</div>`;
}
function progressBar(pct, cls, label){
  const p = clamp(pct, 0, 100);
  return `<div class="progress ${cls || ''}" role="progressbar" aria-valuenow="${p.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${p}%"></i></div>${label ? `<div class="tiny muted mt4">${label}</div>` : ''}`;
}
function opRow(o){
  const income = o.type === 'income';
  const acc = S.accounts.find(a => a.id === o.accountId);
  return `<div class="item">
    <div class="avatar">${income ? '↗' : '↘'}</div>
    <div class="grow">
      <div class="bold truncate">${escapeHtml(o.note || o.category)}</div>
      <div class="muted small truncate">${escapeHtml(o.category)} · ${escapeHtml(fmtDate(o.date))}${acc ? ' · ' + escapeHtml(acc.name) : ''}${o.source === 'csv' ? ' · импорт' : ''}</div>
    </div>
    <div class="amount ${income ? 'income' : 'expense'} mono">${income ? '+' : '−'}${money(o.amount).replace('−', '')}</div>
    <div class="row gap4">
      <button class="btn icon ghost" data-act="op-edit" data-id="${escapeAttr(o.id)}" title="Изменить" aria-label="Изменить операцию">✎</button>
      <button class="btn icon ghost" data-act="op-delete" data-id="${escapeAttr(o.id)}" title="Удалить" aria-label="Удалить операцию">✕</button>
    </div>
  </div>`;
}
function categoryChips(type, active, actName){
  return categoryOptions(type).map(c => `<button class="btn sm ${c === active ? 'primary' : ''}" data-act="${actName}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</button>`).join('');
}
function sourceBadge(src){
  const map = { csv: '<span class="tag">импорт</span>', credit: '<span class="tag blue">кредит</span>', card: '<span class="tag blue">кредитка</span>', demo: '<span class="tag warn">демо</span>' };
  return map[src] || '';
}
