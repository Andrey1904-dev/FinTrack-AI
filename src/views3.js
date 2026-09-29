/* ============================================================================
   views3.js — настройки, модальные окна и все обработчики действий
   ========================================================================== */

/* ============================ НАСТРОЙКИ ============================ */
VIEWS.settings = function(){
  return `
  <section class="grid g-main">
    <div class="col gap16">
      <div class="card pad">
        <div class="section-title">Основное</div>
        <div class="form-grid mt12">
          <div><label class="label">Валюта</label>
            <div class="field" style="display:flex;align-items:center">Российский рубль (₽)</div>
            <div class="hint mt4">Приложение ведёт учёт только в рублях — так суммы и итоги не смешиваются.</div></div>
          <div><label class="label" for="setTheme">Тема оформления</label>
            <select id="setTheme" class="field" data-inp="theme">
              <option value="auto"${(S.settings.theme || 'auto') === 'auto' ? ' selected' : ''}>Как в системе</option>
              <option value="dark"${S.settings.theme === 'dark' ? ' selected' : ''}>Тёмная</option>
              <option value="light"${S.settings.theme === 'light' ? ' selected' : ''}>Светлая</option>
            </select></div>
          <div><label class="label">Аккаунт</label><div class="field" style="display:flex;align-items:center">${escapeHtml((S.user && S.user.email) || '—')}</div></div>
          <div><label class="label">Разбор текста</label>
            <label class="row gap8" style="min-height:44px"><input type="checkbox" id="setAi" data-inp="ai-parse"${S.settings.aiParse ? ' checked' : ''}>
              <span class="muted small">Улучшенный разбор через LLM (Edge Function <code>ai-parse</code>)</span></label></div>
        </div>
        <div class="row gap8 wrap mt12">
          <button class="btn ghost" data-act="logout">Выйти из аккаунта</button>
          <button class="btn ghost" data-act="show-shortcuts">Горячие клавиши</button>
        </div>
        <div class="hint mt8">Если функция <code>ai-parse</code> не развёрнута, приложение автоматически вернётся к словарю синонимов — ничего не сломается.</div>
      </div>

      <div class="card pad">
        <div class="row between"><div><div class="section-title">Категории</div>
          <div class="muted small mt4">Используются и на сайте, и в Telegram-боте.</div></div></div>
        <div class="grid g2 mt12">
          ${['expense', 'income'].map(kind => `<div>
            <div class="bold mb8">${kind === 'expense' ? 'Расходы' : 'Доходы'}</div>
            <div class="list">${S.categorySets[kind].map(c => `<div class="kv">
              <span class="truncate">${escapeHtml(c)}</span>
              <span class="row gap8"><span class="muted tiny">${S.ops.filter(o => o.category === c).length} оп.</span>
              <button class="btn sm ghost" data-act="category-delete" data-kind="${kind}" data-cat="${escapeAttr(c)}" title="Удалить">✕</button></span>
            </div>`).join('')}</div>
            <div class="row gap8 mt12">
              <input id="newCat_${kind}" class="field" placeholder="Новая категория" aria-label="Новая категория">
              <button class="btn primary" data-act="category-add" data-kind="${kind}">Добавить</button>
            </div>
          </div>`).join('')}
        </div>
      </div>

      <div class="card pad">
        <div class="section-title">Правила категоризации</div>
        <div class="muted small mt4">Если в описании есть слово — сразу подставляется категория. Учат и бот, и быстрое добавление на сайте.</div>
        <div class="list mt12">${S.rules.length ? S.rules.map(r => `<div class="kv">
          <span class="truncate"><code>${escapeHtml(r.keyword)}</code> → <b>${escapeHtml(r.category)}</b> <span class="muted tiny">(${r.type === 'income' ? 'доход' : 'расход'})</span></span>
          <button class="btn sm ghost" data-act="rule-delete" data-id="${escapeAttr(r.id)}">✕</button></div>`).join('')
          : '<div class="muted small">Правил пока нет. Пример: «пятёрочка» → Продукты.</div>'}</div>
        <div class="form-grid mt12">
          <div><label class="label" for="ruleWord">Ключевое слово</label><input id="ruleWord" class="field" placeholder="например: пятёрочка"></div>
          <div><label class="label" for="ruleCat">Категория</label><select id="ruleCat" class="field">
            <optgroup label="Расходы">${S.categorySets.expense.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</optgroup>
            <optgroup label="Доходы">${S.categorySets.income.map(c => `<option>${escapeHtml(c)}</option>`).join('')}</optgroup>
          </select></div>
        </div>
        <button class="btn primary mt12" data-act="rule-add">Добавить правило</button>
      </div>
    </div>

    <div class="col gap16">
      <div class="card pad">
        <div class="section-title">Данные</div>
        <div class="muted small mt4">Экспорт всегда под рукой: JSON — полная копия, CSV — таблица операций.</div>
        <div class="row gap8 wrap mt12">
          <button class="btn primary" data-act="export-zip">Скачать всё одном архивом (ZIP)</button>
          <button class="btn" data-act="export-json">Экспорт JSON</button>
          <button class="btn" data-act="export-csv">Экспорт CSV</button>
          <button class="btn" data-act="quick-import">Импорт CSV</button>
        </div>
        <div class="hint mt8">Последний архив: ${S.settings.lastBackupAt ? escapeHtml(fmtDate(S.settings.lastBackupAt)) : 'не делался'}. Внутри архива — operations.csv, operations.json, profile.json и инструкция по восстановлению.</div>
        <div class="divider"></div>
        <div class="bold bad">Опасная зона</div>
        <div class="muted small mt4">Удаление всех операций и настроек из облака. Экспорт перед этим — хорошая идея.</div>
        <div class="row gap8 wrap mt12">
          <button class="btn danger" data-act="cloud-reset">Удалить мои данные из облака</button>
          <button class="btn danger" data-act="account-delete">Удалить аккаунт целиком</button>
        </div>
        <div class="hint mt8">Полное удаление аккаунта выполняет Edge Function <code>delete-account</code> (внутри — service_role, поэтому только на сервере). Если она не развёрнута, приложение подскажет, что сделать.</div>
      </div>

      <div class="card pad">
        <div class="section-title">Синхронизация</div>
        <div class="kv mt12"><span class="muted">Состояние</span><b>${escapeHtml(S.sync.state === 'ok' ? 'синхронизировано' : S.sync.state)}</b></div>
        <div class="kv"><span class="muted">Последняя синхронизация</span><b>${S.sync.lastSync ? escapeHtml(new Date(S.sync.lastSync).toLocaleString('ru-RU')) : '—'}</b></div>
        <div class="kv"><span class="muted">Ждут отправки</span><b>${S.sync.pending}</b></div>
        <div class="kv"><span class="muted">Операций в базе</span><b>${S.ops.length}</b></div>
        <div class="row gap8 wrap mt12">
          <button class="btn" data-act="retry-sync">Синхронизировать сейчас</button>
          <button class="btn ghost" data-act="sw-update">Обновить приложение</button>
        </div>
      </div>

      <div class="card pad">
        <div class="row between"><div class="section-title">Диагностика</div>
          <div class="row gap8">
            <button class="btn sm ghost" data-act="diag-test">Проверить</button>
            <button class="btn sm ghost" data-act="diag-copy">Скопировать</button>
            <button class="btn sm ghost" data-act="diag-download">Скачать</button>
            <button class="btn sm ghost" data-act="diag-clear">Очистить</button>
          </div></div>
        <div class="muted small mt4">Последние ошибки приложения и сбои синхронизации. Кнопка «Проверить» записывает тестовую ошибку: если Sentry подключён, она сразу уйдёт туда — удобно убедиться, что мониторинг работает. Инструкция — в <code>template.html</code>.</div>
        <div class="log-box mt12">${escapeHtml(diagText() || 'Ошибок не зафиксировано.')}</div>
      </div>

      <div class="card pad">
        <div class="section-title">Как всё устроено</div>
        <div class="muted small mt4">Памятка, чтобы не было сюрпризов.</div>
        <ul class="steps mt12">
          <li>Данные хранятся в вашем аккаунте Supabase, ключ доступа — публичный, но строки защищены RLS: чужие данные прочитать нельзя.</li>
          <li>Изменения сохраняются точечно и встают в очередь, если интернета нет. Никакого «удалить всё и записать заново» — потерять историю из-за сбоя сети невозможно.</li>
          <li>Кэш последней загрузки лежит в браузере, чтобы приложение открывалось без интернета. Выйти из аккаунта = удалить кэш этого аккаунта с устройства.</li>
          <li>«AI» здесь — честное распознавание текста по словарю и вашим правилам, без внешних нейросетей.</li>
        </ul>
      </div>
    </div>
  </section>`;
};

/* ============================ МОДАЛЬНЫЕ ОКНА ============================ */
let draft = {};
function modalOp(id){
  const editing = id ? findOp(id) : null;
  const d = Object.assign({ type: 'expense', amount: '', category: 'Продукты', date: today(), note: '', accountId: '', learn: false }, draft.op || {}, editing || {});
  draft.op = d;
  openSheet({
    title: editing ? 'Изменить операцию' : 'Новая операция',
    subtitle: editing ? 'Изменения уйдут в облако точечно — только эта строка' : 'Можно пользоваться и быстрым вводом текстом: он в разделе «Операции»',
    html: `
      <div class="tabs2">
        <button class="${d.type === 'expense' ? 'active' : ''}" data-act="op-type" data-type="expense">Расход</button>
        <button class="${d.type === 'income' ? 'active' : ''}" data-act="op-type" data-type="income">Доход</button>
      </div>
      <div class="form-grid mt16">
        <div><label class="label" for="opAmount">Сумма, ₽</label><input id="opAmount" type="number" step="0.01" min="0" class="field" value="${escapeAttr(d.amount)}" placeholder="0"></div>
        <div><label class="label" for="opDate">Дата</label><input id="opDate" type="date" class="field" value="${escapeAttr(d.date)}"></div>
        <div><label class="label" for="opCategory">Категория</label><select id="opCategory" class="field">
          ${categoryOptions(d.type).map(c => `<option${c === d.category ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
        <div><label class="label" for="opAccount">Счёт</label><select id="opAccount" class="field">
          <option value="">— не указан —</option>
          ${S.accounts.map(a => `<option value="${escapeAttr(a.id)}"${a.id === d.accountId ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select></div>
        <div class="full"><label class="label" for="opNote">Описание</label><input id="opNote" class="field" value="${escapeAttr(d.note)}" placeholder="например: пятёрочка, продукты на неделю"></div>
      </div>
      ${!editing ? `<label class="row gap8 mt12"><input type="checkbox" id="opLearn"> <span class="muted small">Запомнить слово из описания как правило для этой категории</span></label>` : ''}
      <div class="row gap8 mt16" style="justify-content:flex-end">
        <button class="btn ghost" data-act="closeSheet">Отмена</button>
        <button class="btn primary" data-act="op-save" data-id="${escapeAttr(editing ? editing.id : '')}">${editing ? 'Сохранить' : 'Добавить'}</button>
      </div>`
  });
}
function readOpForm(){
  return {
    type: (draft.op && draft.op.type) || 'expense', amount: fieldValue('opAmount'), category: fieldValue('opCategory'),
    date: fieldValue('opDate') || today(), note: fieldValue('opNote'), accountId: fieldValue('opAccount'),
    learn: !!(($('opLearn') || {}).checked)
  };
}
function modalGoal(id){
  const g = id ? S.goals.find(x => String(x.id) === String(id)) : null;
  openSheet({
    title: g ? 'Изменить цель' : 'Новая цель',
    html: `<div class="form-grid">
      <div class="full"><label class="label" for="gName">Название</label><input id="gName" class="field" value="${escapeAttr(g ? g.name : '')}" placeholder="Подушка безопасности"></div>
      <div><label class="label" for="gTarget">Цель, сумма</label><input id="gTarget" type="number" min="0" step="100" class="field" value="${escapeAttr(g ? g.target : '')}"></div>
      <div><label class="label" for="gSaved">Уже накоплено</label><input id="gSaved" type="number" min="0" step="100" class="field" value="${escapeAttr(g ? g.saved : '')}"></div>
      <div><label class="label" for="gDate">Желаемый срок (необязательно)</label><input id="gDate" type="date" class="field" value="${escapeAttr(g ? g.date : '')}"></div>
    </div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="goal-save" data-id="${escapeAttr(g ? g.id : '')}">Сохранить</button>
    </div>`
  });
}
function modalContribution(id){
  const g = S.goals.find(x => String(x.id) === String(id));
  if (!g) return;
  openSheet({
    title: 'Отложить в цель',
    subtitle: g.name,
    html: `<div class="form-grid">
      <div><label class="label" for="cAmount">Сумма</label><input id="cAmount" type="number" min="0" step="10" class="field"></div>
      <div><label class="label" for="cDate">Дата</label><input id="cDate" type="date" class="field" value="${escapeAttr(today())}"></div>
    </div>
    <div class="muted small mt12">Взнос не уменьшает «доступные деньги» как расход — это перевод в накопления. Если хотите учесть его в расходах месяца, добавьте отдельную операцию.</div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="goal-contrib-save" data-id="${escapeAttr(g.id)}">Отложить</button>
    </div>`
  });
}
function modalRecurring(id){
  const r = id ? S.recurring.find(x => String(x.id) === String(id)) : null;
  openSheet({
    title: r ? 'Изменить платёж' : 'Новый повторяющийся платёж',
    html: `<div class="form-grid">
      <div class="full"><label class="label" for="rName">Название</label><input id="rName" class="field" value="${escapeAttr(r ? r.name : '')}" placeholder="Netflix, аренда, интернет"></div>
      <div><label class="label" for="rAmount">Сумма</label><input id="rAmount" type="number" min="0" step="0.01" class="field" value="${escapeAttr(r ? r.amount : '')}"></div>
      <div><label class="label" for="rPeriod">Периодичность</label><select id="rPeriod" class="field">
        ${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}"${r && r.period === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div><label class="label" for="rType">Тип</label><select id="rType" class="field">
        <option value="expense"${r && r.type === 'expense' ? ' selected' : ''}>Расход</option>
        <option value="income"${r && r.type === 'income' ? ' selected' : ''}>Доход</option></select></div>
      <div><label class="label" for="rCategory">Категория</label><select id="rCategory" class="field">
        ${categoriesFlat().map(c => `<option${r && r.category === c ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
      <div><label class="label" for="rNext">Следующая дата</label><input id="rNext" type="date" class="field" value="${escapeAttr(r ? r.next : addDaysISO(today(), 7))}"></div>
      <div><label class="label" for="rAccount">Счёт</label><select id="rAccount" class="field"><option value="">— не указан —</option>
        ${S.accounts.map(a => `<option value="${escapeAttr(a.id)}"${r && r.accountId === a.id ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select></div>
    </div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="rec-save" data-id="${escapeAttr(r ? r.id : '')}">Сохранить</button>
    </div>`
  });
}
function modalCredit(){
  openSheet({
    title: 'Новый кредит',
    subtitle: 'Сразу построю график платежей: сколько уходит на проценты, а сколько на долг',
    html: `<div class="form-grid">
      <div><label class="label" for="crBank">Банк</label><input id="crBank" class="field" placeholder="Сбер"></div>
      <div><label class="label" for="crPurpose">На что</label><input id="crPurpose" class="field" placeholder="Авто, ремонт…"></div>
      <div><label class="label" for="crPrincipal">Сумма кредита</label><input id="crPrincipal" type="number" min="0" step="1000" class="field" data-inp="credit-calc"></div>
      <div><label class="label" for="crRate">Ставка, % годовых</label><input id="crRate" type="number" min="0" step="0.1" class="field" value="18" data-inp="credit-calc"></div>
      <div><label class="label" for="crTerm">Срок, месяцев</label><input id="crTerm" type="number" min="1" step="1" class="field" value="36" data-inp="credit-calc"></div>
      <div><label class="label" for="crIssue">Дата выдачи</label><input id="crIssue" type="date" class="field" value="${escapeAttr(today())}" data-inp="credit-calc"></div>
      <div><label class="label" for="crFirst">Дата первого платежа</label><input id="crFirst" type="date" class="field" value="${escapeAttr(addMonthsISO(today(), 1))}"></div>
    </div>
    <div id="crPrev" class="chat-bubble mt12 small"></div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="credit-save">Добавить кредит</button>
    </div>`
  });
  updateCreditPreview();
}
function updateCreditPreview(){
  const host = $('crPrev'); if (!host) return;
  const p = num(fieldValue('crPrincipal')), rate = num(fieldValue('crRate')), n = num(fieldValue('crTerm'));
  if (!p || !n){ host.textContent = 'Введите сумму и срок — покажу платёж, переплату и первый график.'; return; }
  const pay = annuity(p, rate, n), total = round2(pay * n);
  host.innerHTML = `Платёж в месяц: <b>${money(pay)}</b><br>Всего выплат: ${money(total)} · переплата: <b>${money(total - p)}</b>
    <br><span class="muted tiny">Расчёт аннуитетный. После добавления можно отметить платежи — каждый создаст операцию-расход.</span>`;
}
function modalCard(){
  openSheet({
    title: 'Новая кредитная карта',
    html: `<div class="form-grid">
      <div><label class="label" for="cdBank">Банк</label><input id="cdBank" class="field" placeholder="Тинькофф"></div>
      <div><label class="label" for="cdName">Название карты</label><input id="cdName" class="field" placeholder="Platinum"></div>
      <div><label class="label" for="cdLimit">Лимит</label><input id="cdLimit" type="number" min="0" step="1000" class="field" data-inp="card-calc"></div>
      <div><label class="label" for="cdUsed">Текущая задолженность</label><input id="cdUsed" type="number" min="0" step="100" class="field" value="0" data-inp="card-calc"></div>
      <div><label class="label" for="cdRate">Ставка, % годовых</label><input id="cdRate" type="number" min="0" step="0.1" class="field" value="25" data-inp="card-calc"></div>
      <div><label class="label" for="cdGrace">Льготный период, дней</label><input id="cdGrace" type="number" min="0" step="1" class="field" value="120" data-inp="card-calc"></div>
      <div><label class="label" for="cdMin">Минимальный платёж, %</label><input id="cdMin" type="number" min="0" step="0.5" class="field" value="5" data-inp="card-calc"></div>
      <div><label class="label" for="cdPay">Дата ближайшего платежа</label><input id="cdPay" type="date" class="field" value="${escapeAttr(addDaysISO(today(), 20))}"></div>
      <div><label class="label" for="cdStatement">Дата выписки</label><input id="cdStatement" type="date" class="field" value="${escapeAttr(addDaysISO(today(), 5))}"></div>
    </div>
    <div id="cdPrev" class="chat-bubble mt12 small"></div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="card-save">Добавить карту</button>
    </div>`
  });
  updateCardPreview();
}
function updateCardPreview(){
  const host = $('cdPrev'); if (!host) return;
  const lim = num(fieldValue('cdLimit')), used = num(fieldValue('cdUsed')), pct = num(fieldValue('cdMin')), grace = num(fieldValue('cdGrace'));
  if (!lim){ host.textContent = 'Введите лимит — покажу загрузку и минимальный платёж.'; return; }
  const fake = { limit: lim, used, minPaymentPercent: pct, graceDays: grace };
  host.innerHTML = `Доступно: <b>${money(cardAvailable(fake))}</b> · загрузка лимита <b>${cardUtilization(fake).toFixed(0)}%</b>
    <br>Минимальный платёж: <b>${money(cardMinPayment(fake))}</b> · льготный период ${grace} дн.`;
}
function modalBudget(cat, period){
  const p = period || 'monthly';
  const limit = cat ? (p === 'weekly' ? (S.settings.weeklyBudgets[cat] || '') : (S.budgets[cat] || '')) : '';
  openSheet({
    title: cat ? 'Изменить лимит' : 'Новый лимит',
    html: `<div class="form-grid">
      <div><label class="label" for="bCat">Категория</label><select id="bCat" class="field"${cat ? ' disabled' : ''}>
        ${S.categorySets.expense.map(c => `<option${c === cat ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
      <div><label class="label" for="bPeriod">Период</label><select id="bPeriod" class="field">
        <option value="monthly"${p === 'monthly' ? ' selected' : ''}>В месяц</option>
        <option value="weekly"${p === 'weekly' ? ' selected' : ''}>В неделю (пн–вс)</option></select></div>
      <div class="full"><label class="label" for="bAmount">Лимит</label><input id="bAmount" type="number" min="0" step="100" class="field" value="${escapeAttr(limit)}"></div>
    </div>
    <div class="hint mt8">Недельный лимит хранится отдельно от месячного и не влияет на то, что видит Telegram-бот.</div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="budget-save" data-cat="${escapeAttr(cat || '')}">Сохранить</button>
    </div>`
  });
}
function modalAccount(){
  openSheet({
    title: 'Новый счёт',
    html: `<div class="form-grid">
      <div><label class="label" for="aName">Название</label><input id="aName" class="field" placeholder="Карта Сбербанк"></div>
      <div><label class="label" for="aKind">Тип</label><select id="aKind" class="field">
        <option value="card">Карта</option><option value="cash">Наличные</option><option value="savings">Накопления</option></select></div>
      <div><label class="label" for="aInit">Начальный остаток</label><input id="aInit" type="number" step="0.01" class="field" value="0"></div>
    </div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="account-save">Добавить</button>
    </div>`
  });
}
function modalShortcuts(){
  openSheet({
    title: 'Горячие клавиши',
    html: `<div class="list">
      <div class="kv"><span><span class="kbd">N</span> — новая операция</span><span class="muted small">работает из любого раздела</span></div>
      <div class="kv"><span><span class="kbd">/</span> — перейти к операциям и поиску</span><span class="muted small">фильтр по описанию</span></div>
      <div class="kv"><span><span class="kbd">Esc</span> — закрыть окно</span><span class="muted small">или снять фокус с поля</span></div>
      <div class="kv"><span><span class="kbd">?</span> — эта справка</span><span class="muted small"></span></div>
    </div>`
  });
}
function modalCreditSchedule(id){
  const c = S.credits.find(x => String(x.id) === String(id));
  if (!c) return;
  const rows = (c.schedule || []).map(p => `<tr><td>${p.n}</td><td>${escapeHtml(fmtDate(p.date))}</td><td class="mono">${money(p.amount)}</td>
    <td class="mono muted">${money(p.interest)}</td><td class="mono muted">${money(p.principal)}</td><td class="mono">${money(p.rest)}</td>
    <td>${p.paid ? '<span class="tag ok">оплачен</span>' : ''}</td></tr>`).join('');
  openSheet({
    wide: true,
    title: 'График платежей',
    subtitle: c.bank + (c.purpose ? ' · ' + c.purpose : '') + ' · всего ' + (c.schedule || []).length + ' платежей, переплата ' + money(creditOverpay(c)),
    html: `<div class="scroll-x"><table class="table">
      <thead><tr><th>№</th><th>Дата</th><th>Платёж</th><th>Проценты</th><th>Долг</th><th>Остаток</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`
  });
}
function modalEarlyRepay(id){
  const c = S.credits.find(x => String(x.id) === String(id));
  if (!c) return;
  openSheet({
    title: 'Досрочное погашение',
    subtitle: c.bank + ' · текущий остаток ' + money(creditRemaining(c)),
    html: `<div class="form-grid">
      <div><label class="label" for="erAmount">Сумма</label><input id="erAmount" type="number" min="0" step="100" class="field" value="${escapeAttr(creditRemaining(c))}"></div>
    </div>
    <div class="muted small mt12">Сумма уменьшит тело долга, остаток графика пересоберётся. Будет создана операция-расход.</div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="credit-early-save" data-id="${escapeAttr(c.id)}">Погасить досрочно</button>
    </div>`
  });
}
function modalCardPay(id){
  const c = S.cards.find(x => String(x.id) === String(id));
  if (!c) return;
  openSheet({
    title: 'Погашение кредитки',
    subtitle: c.bank + ' · задолженность ' + money(c.used),
    html: `<div class="form-grid">
      <div><label class="label" for="cpAmount">Сумма</label><input id="cpAmount" type="number" min="0" step="0.01" class="field" value="${escapeAttr(cardMinPayment(c))}"></div>
    </div>
    <div class="row gap8 wrap mt12">
      <button class="btn sm" data-act="card-pay-fill" data-id="${escapeAttr(c.id)}" data-val="${escapeAttr(cardMinPayment(c))}">Минимальный платёж</button>
      <button class="btn sm" data-act="card-pay-fill" data-id="${escapeAttr(c.id)}" data-val="${escapeAttr(c.used)}">Всю задолженность</button>
    </div>
    <div class="muted small mt12">Погашение создаст операцию-расход в категории «Кредиты» и уменьшит задолженность по карте.</div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="card-pay-save" data-id="${escapeAttr(c.id)}">Погасить</button>
    </div>`
  });
}

/* ---------- импорт CSV ---------- */
let importDraft = null;
function modalImport(){
  openSheet({
    wide: true,
    title: 'Импорт операций из CSV',
    subtitle: 'Подходит выписка любого банка: приложение само предложит, где дата, сумма и описание',
    html: `<input type="file" id="impFile" accept=".csv,text/csv" class="field" data-inp="import-file">
      <div id="impBody" class="mt16"><div class="muted small">Выберите файл — покажу первые строки и предложу сопоставление колонок.</div></div>`
  });
}
function renderImportBody(){
  const host = $('impBody'); if (!host || !importDraft) return;
  const { rows, mapping } = importDraft;
  const cols = (rows[0] || []).map((_, i) => i);
  const head = mapping.hasHeader ? rows[0] : cols.map(i => 'Колонка ' + (i + 1));
  const sample = rows.slice(0, 6);
  const opts = i => cols.map(c => `<option value="${c}"${c === i ? ' selected' : ''}>${escapeHtml(String(head[c] === undefined ? 'Колонка ' + (c + 1) : head[c]).slice(0, 28))}</option>`).join('');
  host.innerHTML = `
    <div class="form-grid">
      <div><label class="label" for="impDate">Колонка с датой</label><select id="impDate" class="field" data-inp="import-map">${opts(mapping.date)}</select></div>
      <div><label class="label" for="impAmount">Колонка с суммой</label><select id="impAmount" class="field" data-inp="import-map">${opts(mapping.amount)}</select></div>
      <div><label class="label" for="impDesc">Колонка с описанием</label><select id="impDesc" class="field" data-inp="import-map">${opts(mapping.desc)}</select></div>
      <div><label class="label" for="impType">Колонка с типом (если есть)</label><select id="impType" class="field" data-inp="import-map"><option value="-1"${mapping.type < 0 ? ' selected' : ''}>— нет —</option>${opts(mapping.type)}</select></div>
    </div>
    <div class="hint mt4">Учёт ведётся только в рублях: суммы переносятся как есть, а символы других валют (zł, €, $) из описания убираются.</div>
    ${foreignSeen().length ? `<div class="banner mt8"><span>ℹ️</span><div class="grow">В выписке встретились суммы в других валютах: <b>${escapeHtml(foreignSeen().join(', '))}</b>. Они будут записаны как рубли — если выписка не в рублях, импорт лучше отменить и пересчитать суммы.</div></div>` : ''}
    <label class="row gap8 mt12"><input type="checkbox" id="impNeg" data-inp="import-map"${mapping.negativeIsExpense ? ' checked' : ''}> <span class="muted small">Отрицательные суммы — расходы (обычно так в банковских выписках)</span></label>
    <label class="row gap8 mt8"><input type="checkbox" id="impSkipDup" checked> <span class="muted small">Пропускать дубликаты (совпадают дата, сумма и описание)</span></label>
    <div class="divider"></div>
    <div class="row between"><div class="bold">Предпросмотр</div><div class="muted small" id="impCount"></div></div>
    <div class="scroll-x mt8"><table class="table"><thead><tr><th>Дата</th><th>Тип</th><th>Категория</th><th>Сумма</th><th>Описание</th></tr></thead>
      <tbody>${sample.map((r, i) => {
        const op = previewOps()[i];
        return `<tr><td>${op ? escapeHtml(fmtDate(op.date)) : '<span class="muted">?</span>'}</td><td>${op ? (op.type === 'income' ? 'доход' : 'расход') : '—'}</td>
          <td>${op ? escapeHtml(op.category) : '—'}</td><td class="mono">${op ? escapeHtml(money(op.amount)) : '—'}</td>
          <td class="muted truncate" style="max-width:260px">${escapeHtml(String(r[mapping.desc] || '').slice(0, 80))}</td></tr>`;
      }).join('')}</tbody></table></div>
    <div class="row gap8 mt16" style="justify-content:flex-end">
      <button class="btn ghost" data-act="closeSheet">Отмена</button>
      <button class="btn primary" data-act="import-run">Импортировать</button>
    </div>`;
  const cnt = $('impCount');
  if (cnt) cnt.textContent = 'распознано ' + previewOps().length + ' из ' + Math.max(0, rows.length - (mapping.hasHeader ? 1 : 0)) + ' строк';
}
function previewOps(){ return importDraft ? rowsToOps(importDraft.rows, importDraft.mapping) : []; }
function readImportMapping(){
  if (!importDraft) return;
  importDraft.mapping.date = Number(fieldValue('impDate'));
  importDraft.mapping.amount = Number(fieldValue('impAmount'));
  importDraft.mapping.desc = Number(fieldValue('impDesc'));
  importDraft.mapping.type = Number(fieldValue('impType'));
  const neg = $('impNeg'); importDraft.mapping.negativeIsExpense = neg ? neg.checked : true;
}
async function runImport(){
  readImportMapping();
  let ops = previewOps();
  if (!ops.length){ toast('Не удалось распознать строки — проверьте сопоставление колонок', { bad: true }); return; }
  const skipDup = $('impSkipDup') ? $('impSkipDup').checked : true;
  if (skipDup){
    const keys = new Set(S.ops.map(o => o.date + '|' + o.amount + '|' + o.note));
    ops = ops.filter(o => !keys.has(o.date + '|' + o.amount + '|' + o.note));
  }
  if (!ops.length){ toast('Все строки уже есть в базе — импортировать нечего'); closeSheet(); return; }
  for (const o of ops) S.ops.push(o);
  S.ops.sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
  cacheSave();
  const CHUNK = 200;
  for (let i = 0; i < ops.length; i += CHUNK) outboxPush({ kind: 'ops-upsert', rows: ops.slice(i, i + CHUNK) });
  toast('Импортировано ' + ops.length + ' ' + plural(ops.length, 'операция', 'операции', 'операций'), { action: 'Отменить', onAction: () => { removeOps(ops.map(o => o.id)); render(); } });
  closeSheet(); render();
}

/* ============================ ДЕЙСТВИЯ ============================ */
Object.assign(ACTIONS, {
  'go': t => go(t.dataset.tab),
  'show-more-tabs': () => openSheet({ title: 'Все разделы', html: `<div class="col gap8">${TABS.map(x => `<button class="btn" data-act="go" data-tab="${x.id}">${x.icon} ${x.title}</button>`).join('')}</div>` }),
  'closeSheet': () => closeSheet(),
  'show-shortcuts': () => modalShortcuts(),
  'goto-operations': () => go('operations'),
  'retry-sync': () => retrySync(),
  'logout': async () => { if (await confirmSheet({ title: 'Выйти из аккаунта?', text: 'Кэш этого аккаунта будет удалён с устройства. Данные останутся в облаке.', confirmText: 'Выйти' })) logout(); },
  'logout-anyway': () => logout(),
  'exit-demo': () => { lsDel(LS.demo); location.href = location.pathname; },

  /* ---- операции ---- */
  'op-new': () => { draft.op = null; modalOp(); },
  'op-edit': t => { draft.op = null; modalOp(t.dataset.id); },
  'op-type': (t, e) => { draft.op = readOpForm(); draft.op.type = t.dataset.type; modalOp(draft.op.editingId || undefined); },
  'op-save': t => {
    const f = readOpForm(), amount = round2(parseAmount(f.amount));
    if (!amount){ toast('Укажите сумму', { bad: true }); return; }
    const id = t.dataset.id || uid('op');
    upsertOp({ id, type: f.type, amount, category: f.category, note: f.note || f.category, date: f.date, accountId: f.accountId });
    if (f.learn && f.note) { const kw = learnRuleFrom(f.note, f.category, f.type); if (kw) toast('Правило сохранено: «' + kw + '» → ' + f.category); }
    closeSheet(); draft.op = null; render();
    toast(t.dataset.id ? 'Операция обновлена' : 'Операция добавлена');
  },
  'op-delete': t => {
    const op = findOp(t.dataset.id); if (!op) return;
    const [removed] = removeOps([t.dataset.id]);
    if (S.view.tab === 'operations' && $('opResult')) renderOpsResult(); else render();
    toast('Операция удалена', { action: 'Отменить', onAction: () => { upsertOp(removed); render(); } });
  },
  'op-more': () => { S.view.opLimit += 40; renderOpsResult(); },
  'op-reset-filters': () => { Object.assign(S.view, { opQuery: '', opType: 'all', opCategory: 'all', opMonth: 'all', opLimit: 40 }); renderView(); },
  'qadd-submit': () => submitQuickAdd(),
  'qadd-rule': t => {
    const text = fieldValue('qadd');
    const kw = learnRuleFrom(text, t.dataset.cat, t.dataset.type || 'expense');
    toast(kw ? 'Правило сохранено: «' + kw + '» → ' + t.dataset.cat : 'Не нашёл подходящее слово для правила', { bad: !kw });
  },

  /* ---- экспорт/импорт ---- */
  'export-csv': () => { downloadText('fintrack-operations.csv', opsToCSV(S.ops), 'text/csv'); toast('CSV сохранён'); },
  'export-zip': () => {
    try {
      const bytes = buildBackupZip();
      downloadBytes('fintrack-backup-' + today() + '.zip', bytes);
      markBackupDone(); saveProfileToCloud(); render();
      toast('Архив готов: ' + S.ops.length + ' операций, ' + Math.round(bytes.length / 1024) + ' КБ');
    } catch (e){ toast('Не удалось собрать архив: ' + (e.message || e), { bad: true }); }
  },
  'voice-record': () => toggleVoiceRecording(),
  'photo-pick': () => { const f = $('photoInput'); if (f) f.click(); else toast('Поле выбора файла не найдено', { bad: true }); },
  'export-json': () => { downloadText('fintrack-backup-' + today() + '.json', JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data: snapshotState() }, null, 2), 'application/json'); toast('Резервная копия сохранена'); },
  'quick-import': () => { importDraft = null; modalImport(); },
  'import-run': () => runImport(),

  /* ---- бюджеты ---- */
  'budget-new': () => modalBudget(),
  'budget-edit': t => modalBudget(t.dataset.cat, t.dataset.period),
  'budget-delete': async t => {
    const period = t.dataset.period || 'monthly';
    const ok = await confirmSheet({ title: 'Удалить лимит?', text: 'Категория ' + escapeHtml(t.dataset.cat) + (period === 'weekly' ? ' (недельный)' : ''), confirmText: 'Удалить', danger: true });
    if (!ok) return;
    setBudget(t.dataset.cat, 0, period); saveProfileToCloud(); render(); toast('Лимит удалён');
  },
  'budget-save': t => {
    const cat = t.dataset.cat || fieldValue('bCat'), amount = round2(fieldValue('bAmount')), period = fieldValue('bPeriod') || 'monthly';
    if (!cat || amount <= 0){ toast('Укажите лимит больше нуля', { bad: true }); return; }
    setBudget(cat, amount, period); saveProfileToCloud(); closeSheet(); render();
    toast('Лимит сохранён: ' + money(amount) + (period === 'weekly' ? ' в неделю' : ' в месяц'));
  },
  'budget-from-prev': () => {
    const prev = monthKey(addMonthsISO(today(), -1));
    const prevSpend = spendByCategory(prev, 'expense');
    if (!prevSpend.length){ toast('В прошлом месяце расходов нет', { bad: true }); return; }
    prevSpend.slice(0, 8).forEach(c => { S.budgets[c.category] = round2(Math.ceil(c.value / 100) * 100); });
    saveProfileToCloud(); render();
    toast('Лимиты взяты по расходам ' + fmtMonth(prev));
  },

  /* ---- цели ---- */
  'goal-new': () => modalGoal(),
  'goal-edit': t => modalGoal(t.dataset.id),
  'goal-delete': async t => { if (await confirmSheet({ title: 'Удалить цель?', confirmText: 'Удалить', danger: true })){ S.goals = S.goals.filter(g => String(g.id) !== String(t.dataset.id)); saveProfileToCloud(); render(); toast('Цель удалена'); } },
  'goal-save': t => {
    const name = fieldValue('gName'), target = round2(fieldValue('gTarget')), saved = round2(fieldValue('gSaved'));
    if (!name || target <= 0){ toast('Укажите название и сумму цели', { bad: true }); return; }
    const id = t.dataset.id || uid('g'), date = fieldValue('gDate');
    const existing = S.goals.find(g => String(g.id) === String(id));
    if (existing) Object.assign(existing, { name, target, saved, date });
    else S.goals.push({ id, name, target, saved, date, contributions: [] });
    saveProfileToCloud(); closeSheet(); render(); toast('Цель сохранена');
  },
  'goal-add-money': t => modalContribution(t.dataset.id),
  'goal-contrib-save': t => {
    const g = S.goals.find(x => String(x.id) === String(t.dataset.id));
    const amount = round2(fieldValue('cAmount'));
    if (!g || amount <= 0){ toast('Укажите сумму взноса', { bad: true }); return; }
    const date = fieldValue('cDate') || today();
    g.saved = round2(num(g.saved) + amount);
    g.contributions = (g.contributions || []).concat([{ id: uid('c'), date, amount }]);
    saveProfileToCloud(); closeSheet(); render(); toast('Отложено ' + money(amount) + ' в «' + g.name + '»');
  },

  /* ---- повторяющиеся ---- */
  'rec-new': () => modalRecurring(),
  'rec-edit': t => modalRecurring(t.dataset.id),
  'rec-delete': async t => { if (await confirmSheet({ title: 'Удалить платёж?', confirmText: 'Удалить', danger: true })){ S.recurring = S.recurring.filter(r => String(r.id) !== String(t.dataset.id)); saveProfileToCloud(); render(); toast('Платёж удалён'); } },
  'rec-save': t => {
    const name = fieldValue('rName'), amount = round2(fieldValue('rAmount'));
    if (!name || amount <= 0){ toast('Укажите название и сумму', { bad: true }); return; }
    const rec = { id: t.dataset.id || uid('r'), name, amount, period: fieldValue('rPeriod'), type: fieldValue('rType'), category: fieldValue('rCategory'), next: fieldValue('rNext') || today(), accountId: fieldValue('rAccount') };
    const i = S.recurring.findIndex(r => String(r.id) === String(rec.id));
    if (i >= 0) S.recurring[i] = rec; else S.recurring.push(rec);
    saveProfileToCloud(); closeSheet(); render(); toast('Платёж сохранён');
  },
  'rec-apply': t => { const r = applyRecurringOnce(t.dataset.id); render(); if (r) toast('Операция создана: ' + r.name + ' ' + money(r.amount)); },
  'rec-apply-overdue': () => {
    const overdue = S.recurring.filter(r => (daysUntil(r.next) || 0) < 0);
    let n = 0; overdue.forEach(r => { while ((daysUntil(r.next) || 0) < 0){ applyRecurringOnce(r.id); n++; if (n > 50) break; } });
    saveProfileToCloud(); render(); toast('Проведено платежей: ' + n);
  },

  /* ---- кредиты ---- */
  'credit-new': () => modalCredit(),
  'credit-save': () => {
    const bank = fieldValue('crBank'), purpose = fieldValue('crPurpose');
    const principal = round2(fieldValue('crPrincipal')), rate = num(fieldValue('crRate')), termMonths = Math.round(num(fieldValue('crTerm')));
    const issueDate = fieldValue('crIssue'), firstPay = fieldValue('crFirst');
    if (!bank || principal <= 0 || termMonths < 1){ toast('Заполните банк, сумму и срок', { bad: true }); return; }
    const credit = normalizeCredit({ id: uid('cr'), bank, purpose, principal, rate, termMonths, issueDate, paymentDate: firstPay, createdAt: new Date().toISOString() });
    credit.paymentDate = firstPay || (credit.schedule[0] || {}).date || today();
    if (credit.schedule[0]) credit.schedule[0].date = credit.paymentDate;
    S.credits.unshift(credit);
    saveProfileToCloud(); closeSheet(); render();
    toast('Кредит добавлен: платёж ' + money(credit.monthlyPayment) + ' в месяц');
  },
  'credit-delete': async t => {
    const c = S.credits.find(x => String(x.id) === String(t.dataset.id)); if (!c) return;
    const paidOps = (c.schedule || []).filter(p => p.operationId).map(p => p.operationId);
    const ok = await confirmSheet({ title: 'Удалить кредит?', text: 'Записи о платежах (и созданные ими операции) останутся в истории. Отменить это действие нельзя.', confirmText: 'Удалить', danger: true });
    if (!ok) return;
    S.credits = S.credits.filter(x => String(x.id) !== String(c.id));
    saveProfileToCloud(); render(); toast('Кредит удалён' + (paidOps.length ? ' (операции по платежам сохранены)' : ''));
  },
  'credit-pay': async t => {
    const res = payNextCreditPayment(t.dataset.id);
    render();
    if (!res) return toast('Не нашёл кредит', { bad: true });
    if (res.nothing) return toast('Все платежи уже отмечены');
    toast('Платёж ' + money(res.payment.amount) + ' отмечен, создана операция-расход', { action: 'Отменить', onAction: () => { undoCreditPayment(res); render(); } });
  },
  'credit-schedule': t => modalCreditSchedule(t.dataset.id),
  'credit-early': t => modalEarlyRepay(t.dataset.id),
  'credit-early-save': t => {
    const amount = round2(fieldValue('erAmount'));
    const res = repayCreditEarly(t.dataset.id, amount);
    if (!res){ toast('Укажите сумму', { bad: true }); return; }
    closeSheet(); render();
    toast('Досрочно погашено ' + money(res.payNow) + '. Остаток долга ' + money(res.restAfter));
  },

  /* ---- кредитные карты ---- */
  'card-new': () => modalCard(),
  'card-save': () => {
    const bank = fieldValue('cdBank'), name = fieldValue('cdName'), limit = round2(fieldValue('cdLimit')), used = round2(fieldValue('cdUsed'));
    if (!bank || limit <= 0){ toast('Укажите банк и лимит', { bad: true }); return; }
    if (used > limit){ toast('Задолженность не может быть больше лимита', { bad: true }); return; }
    S.cards.unshift(normalizeCard({ id: uid('cd'), bank, name: name || 'Карта', limit, used, rate: fieldValue('cdRate'), graceDays: fieldValue('cdGrace'), minPaymentPercent: fieldValue('cdMin'), paymentDate: fieldValue('cdPay'), statementDate: fieldValue('cdStatement'), issueDate: today() }));
    saveProfileToCloud(); closeSheet(); render(); toast('Карта добавлена');
  },
  'card-delete': async t => { if (await confirmSheet({ title: 'Удалить карту?', confirmText: 'Удалить', danger: true })){ S.cards = S.cards.filter(c => String(c.id) !== String(t.dataset.id)); saveProfileToCloud(); render(); toast('Карта удалена'); } },
  'card-pay': t => modalCardPay(t.dataset.id),
  'card-pay-fill': t => setField('cpAmount', t.dataset.val),
  'card-pay-save': t => {
    const amount = round2(fieldValue('cpAmount'));
    const res = payCard(t.dataset.id, amount);
    if (!res){ toast('Укажите сумму больше нуля', { bad: true }); return; }
    closeSheet(); render();
    toast('Погашено ' + money(res.pay) + ', задолженность ' + money(res.card.used), { action: 'Отменить', onAction: () => { undoCardPayment(res); render(); } });
  },

  /* ---- Telegram ---- */
  'tg-code': async () => {
    try {
      const code = await telegramLinkCode();
      const el = $('tgCode'); if (el) el.textContent = code;
      toast('Код создан: отправьте боту /link ' + code);
    } catch (e){ toast('Не удалось создать код: ' + e.message, { bad: true }); }
  },
  'tg-refresh': () => loadTelegramStatus(),
  'tg-unlink': async () => {
    if (!await confirmSheet({ title: 'Отвязать Telegram?', text: 'Бот перестанет видеть ваш аккаунт, пока не привяжете заново.', confirmText: 'Отвязать', danger: true })) return;
    try { await telegramUnlink(); toast('Telegram отвязан'); loadTelegramStatus(); }
    catch (e){ toast('Не удалось отвязать: ' + e.message, { bad: true }); }
  },
  'tg-demo': () => {
    const p = smartParse(fieldValue('tgDemo'));
    const out = $('tgDemoOut'); if (!out) return;
    out.innerHTML = p ? `Тип: <b>${p.type === 'income' ? 'доход' : 'расход'}</b> · Сумма: <b>${p.amount === null ? '—' : money(p.amount)}</b> · Категория: <b>${escapeHtml(p.category)}</b> · Дата: ${escapeHtml(fmtDate(p.date))}
      <div class="muted tiny mt4">уверенность ${(p.confidence * 100).toFixed(0)}%${p.why ? ' · ' + escapeHtml(p.why) : ''}</div>`
      : 'Введите текст.';
  },

  /* ---- функции ---- */
  'cal-prev': () => { S.view.calMonth = monthKey(addMonthsISO((S.view.calMonth || thisMonthKey()) + '-01', -1)); renderView(); },
  'cal-next': () => { S.view.calMonth = monthKey(addMonthsISO((S.view.calMonth || thisMonthKey()) + '-01', 1)); renderView(); },
  'runway-calc': () => {
    const date = fieldValue('runDate'), reserve = round2(fieldValue('runReserve'));
    S.view.runway = { date, reserve };
    const out = $('runwayOut'); if (out) out.innerHTML = runwayHtml(date, reserve);
  },
  'account-new': () => modalAccount(),
  'account-save': () => {
    const name = fieldValue('aName');
    if (!name){ toast('Укажите название счёта', { bad: true }); return; }
    S.accounts.push({ id: uid('a'), name, kind: fieldValue('aKind'), initial: round2(fieldValue('aInit')) });
    saveProfileToCloud(); closeSheet(); render(); toast('Счёт добавлен');
  },
  'account-delete': async t => { if (await confirmSheet({ title: 'Удалить счёт?', text: 'Операции останутся, но перестанут быть привязаны к счёту.', confirmText: 'Удалить', danger: true })){ S.accounts = S.accounts.filter(a => String(a.id) !== String(t.dataset.id)); saveProfileToCloud(); render(); } },

  /* ---- настройки ---- */
  'category-add': t => {
    const kind = t.dataset.kind, name = fieldValue('newCat_' + kind).trim();
    if (!name) return toast('Введите название категории', { bad: true });
    if (S.categorySets[kind].includes(name)) return toast('Такая категория уже есть', { bad: true });
    S.categorySets[kind].push(name); saveProfileToCloud(); render(); toast('Категория добавлена');
  },
  'category-delete': async t => {
    const { kind, cat } = t.dataset;
    const used = S.ops.filter(o => o.category === cat).length;
    if (S.categorySets[kind].length <= 1) return toast('Нельзя удалить последнюю категорию', { bad: true });
    const ok = await confirmSheet({ title: 'Удалить категорию?', text: used ? `В ней ${used} операций — они останутся, но категория исчезнет из списков.` : 'Категория пустая.', confirmText: 'Удалить', danger: true });
    if (!ok) return;
    S.categorySets[kind] = S.categorySets[kind].filter(c => c !== cat);
    delete S.budgets[cat];
    S.rules = S.rules.filter(r => r.category !== cat);
    saveProfileToCloud(); render(); toast('Категория удалена');
  },
  'rule-add': () => {
    const word = fieldValue('ruleWord').toLowerCase().trim(), cat = fieldValue('ruleCat');
    if (!word || !cat){ toast('Укажите слово и категорию', { bad: true }); return; }
    if (S.rules.find(r => r.keyword === word)){ toast('Такое правило уже есть', { bad: true }); return; }
    S.rules.push({ id: uid('rl'), keyword: word, category: cat, type: categoryOf(cat) });
    saveProfileToCloud(); render(); toast('Правило добавлено');
  },
  'rule-delete': t => { S.rules = S.rules.filter(r => String(r.id) !== String(t.dataset.id)); saveProfileToCloud(); render(); toast('Правило удалено'); },
  'cloud-reset': async () => {
    const ok = await confirmSheet({
      title: 'Удалить все данные из облака?',
      text: 'Будут удалены все операции, бюджеты, цели, платежи, кредиты и настройки. Сначала сделайте экспорт — отменить нельзя.',
      confirmText: 'Удалить навсегда', danger: true, confirmWord: 'УДАЛИТЬ'
    });
    if (!ok) return;
    try { await resetCloudData(); render(); toast('Данные удалены из облака'); }
    catch (e){ toast('Ошибка: ' + e.message, { bad: true }); }
  },
  'sw-update': async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg){ await reg.update(); toast('Проверил обновление. Если есть новая версия — обновите страницу.'); }
      else toast('Приложение работает без сервис-воркера', { bad: true });
    } catch (e){ toast('Не удалось обновить: ' + e.message, { bad: true }); }
  },
  'account-delete': async () => {
    if (S.demo){ toast('В демо-режиме аккаунт удалить нельзя', { bad: true }); return; }
    const ok = await confirmSheet({
      title: 'Удалить аккаунт навсегда?',
      text: 'Будут удалены аккаунт, операции, бюджеты, цели, кредиты и все настройки. Восстановить не получится — сначала сделайте экспорт JSON.',
      confirmText: 'Удалить аккаунт', danger: true, confirmWord: 'УДАЛИТЬ'
    });
    if (!ok) return;
    try {
      await deleteAccountRemote();
      lsDel(LS.cache(S.user.id)); lsDel(LS.outbox(S.user.id));
      toast('Аккаунт удалён. Спасибо, что пользовались FinTrack!', { timeout: 6000 });
      setTimeout(() => { S = blankState(); location.reload(); }, 1500);
    } catch (e){
      const msg = String(e.message || e);
      if (/404|not found|Failed to send|relay/i.test(msg))
        toast('Функция delete-account не развёрнута. Инструкция — в supabase/functions/README.md', { bad: true, timeout: 9000 });
      else toast('Не удалось удалить аккаунт: ' + msg, { bad: true });
    }
  },
  'diag-test': () => {
    const sentryOn = typeof window !== 'undefined' && window.Sentry && typeof window.Sentry.captureException === 'function';
    // diagLog сам передаёт ошибку в Sentry, если он подключён, — здесь только пишем
    diagLog('test', 'Тестовая ошибка из настроек (проверка журнала и Sentry)', 'diag-test');
    toast(sentryOn
      ? 'Ошибка записана в журнал и отправлена в Sentry'
      : 'Ошибка записана в журнал. Sentry не подключён — инструкция в template.html');
    render();
  },
  'diag-copy': () => {
    const text = diagText() || 'Ошибок не зафиксировано.';
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => toast('Журнал скопирован'),
      () => toast('Браузер запретил доступ к буферу обмена', { bad: true }));
  },
  'diag-download': () => { downloadText('fintrack-diagnostics-' + today() + '.txt', diagText() || 'Ошибок не зафиксировано.', 'text/plain'); toast('Журнал сохранён'); },
  'diag-clear': () => { diagClear(); render(); toast('Журнал очищен'); },
  'analytics-report': () => {
    const key = S.view.analyticsMonth || thisMonthKey(), st = monthStats(key), byCat = spendByCategory(key, 'expense');
    const text = `FinTrack AI · отчёт за ${fmtMonth(key)}\nДоходы: ${money(st.income)}\nРасходы: ${money(st.expense)}\nИтог: ${money(st.balance)}\n\nПо категориям:\n` +
      byCat.map(c => `  ${c.category}: ${money(c.value)} (${percent(c.value, st.expense)})`).join('\n');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
      () => toast('Отчёт скопирован в буфер обмена'),
      () => toast('Не удалось скопировать — браузер запретил доступ к буферу', { bad: true }));
  }
});

/* ---- быстрый ввод ---- */
function qaddPreview(){
  const host = $('qaddPrev'); if (!host) return;
  const text = fieldValue('qadd');
  if (!text){ host.innerHTML = 'Введите текст — покажу, что распознал.'; return; }
  const p = smartParse(text);
  if (!p){ host.textContent = 'Не разобрал. Попробуйте: «такси 450».'; return; }
  const known = p.why && p.why.indexOf('правило') === 0;
  host.innerHTML = `<div class="row gap8 wrap">
      <span class="tag ${p.type === 'income' ? 'ok' : ''}">${p.type === 'income' ? 'доход' : 'расход'}</span>
      <b>${p.amount === null ? 'сумма не найдена' : money(p.amount)}</b>
      <span>· ${escapeHtml(p.category)}</span><span class="muted">· ${escapeHtml(fmtDate(p.date))}</span>
      <span class="tag">${(p.confidence * 100).toFixed(0)}%</span>
      ${p.why ? `<span class="muted tiny">${escapeHtml(p.why)}</span>` : ''}
      ${(!known && p.category !== 'Другое') ? `<button class="btn sm ghost" data-act="qadd-rule" data-cat="${escapeAttr(p.category)}" data-type="${p.type}">Запомнить правило</button>` : ''}
    </div>`;
}
async function submitQuickAdd(){
  const input = $('qadd'), text = fieldValue('qadd');
  if (!text){ toast('Введите текст операции', { bad: true }); return; }
  let p = smartParse(text);
  if (S.settings.aiParse && !S.demo && isOnline()){
    try { const remote = await aiParseRemote(text); if (remote && remote.amount !== null){ p = remote; toast('Разобрано моделью: ' + remote.category); } }
    catch (e){ /* функция не развёрнута или модель недоступна — остаёмся на словаре */ }
  }
  if (!p || p.amount === null){ draft.op = { type: p ? p.type : 'expense', category: p ? p.category : 'Другое', note: text, date: p ? p.date : today() }; modalOp(); return; }
  const op = upsertOp({ id: uid('op'), type: p.type, amount: p.amount, category: p.category, note: p.note, date: p.date });
  if (input) input.value = '';
  qaddPreview();
  if (S.view.tab === 'operations' && $('opResult')) renderOpsResult(); else renderView();
  toast((p.type === 'income' ? 'Доход ' : 'Расход ') + money(p.amount) + ' · ' + p.category, { action: 'Отменить', onAction: () => { removeOps([op.id]); render(); } });
}
function applyRecurringOnce(id){
  const r = S.recurring.find(x => String(x.id) === String(id));
  if (!r) return null;
  const op = upsertOp({ id: uid('op'), type: r.type, amount: r.amount, category: r.category, note: r.name, date: r.next, accountId: r.accountId, source: 'recurring' });
  const step = r.period === 'weekly' ? 7 : r.period === 'yearly' ? 365 : 0;
  let next = step ? addDaysISO(r.next, step) : addMonthsISO(r.next, 1);
  let guard = 0;
  while (daysUntil(next) < 0 && guard++ < 60) next = step ? addDaysISO(next, step) : addMonthsISO(next, 1);
  r.next = next;
  saveProfileToCloud();
  return { name: r.name, amount: r.amount, operation: op };
}
function undoCreditPayment(res){
  const c = res.credit, p = res.payment;
  p.paid = false; p.paidAt = null; p.operationId = null;
  removeOps([res.operation.id]);
  const nxt = nextUnpaidPayment(c);
  c.paymentDate = nxt ? nxt.date : p.date;
  c.paid = false;
  saveProfileToCloud();
}
function undoCardPayment(res){
  const c = res.card;
  c.used = round2(num(c.used) + res.pay);
  c.lastPaymentAmount = 0; c.lastPaymentAt = null;
  removeOps([res.operation.id]);
  saveProfileToCloud();
}
async function loadTelegramStatus(){
  const host = $('tgStatus'); if (!host) return;
  if (S.demo){ host.innerHTML = 'В демо-режиме привязка недоступна.'; return; }
  host.textContent = 'Проверяю…';
  try {
    const st = await telegramStatus();
    if (st.error){ host.innerHTML = `<span class="bad">Не удалось проверить: ${escapeHtml(st.error)}</span>`; return; }
    host.innerHTML = st.account
      ? `✅ Привязан${st.account.username ? ' как @' + escapeHtml(st.account.username) : ''} · с ${escapeHtml(fmtDate(String(st.account.created_at || '').slice(0, 10)))}.
         <button class="btn sm danger mt8" data-act="tg-unlink">Отвязать</button>`
      : 'Пока не привязан. Создайте код и отправьте его боту командой /link.';
  } catch (e){ host.innerHTML = `<span class="bad">${escapeHtml(e.message)}</span>`; }
}
function renderViewKeepingFocus(){
  const active = document.activeElement, id = active && active.id, pos = active && active.selectionStart;
  renderView();
  if (id){ const el = $(id); if (el){ el.focus(); if (pos !== null && pos !== undefined && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch (e){} } }
}
