/* ============================================================================
   views2.js — бюджеты, цели, повторяющиеся платежи, кредиты, Telegram, функции
   ========================================================================== */

/* ============================ БЮДЖЕТЫ ============================ */
VIEWS.budgets = function(){
  const items = budgetsList().map(budgetStats);
  const totalLimit = sumMoney(items, b => b.limit), totalSpent = sumMoney(items, b => b.spent);
  const over = items.filter(b => b.spent > b.limit);
  const near = items.filter(b => b.spent <= b.limit && b.spent >= b.limit * 0.9);
  const prevKey = monthKey(addMonthsISO(today(), -1));
  const weekly = items.filter(b => b.period === 'weekly');
  return `
  <div class="card pad">
    <div class="row between wrap gap8">
      <div><div class="section-title">Бюджеты</div>
        <div class="muted small mt4">Месячные лимиты считаются за текущий месяц, недельные — за текущую неделю (${escapeHtml(weekRangeISO().label)}). Оба вида можно задать для одной категории.</div></div>
      <div class="row gap8">
        <button class="btn sm" data-act="budget-from-prev">Взять лимиты из ${escapeHtml(fmtMonth(prevKey))}</button>
        <button class="btn sm primary" data-act="budget-new">＋ Лимит</button>
      </div>
    </div>
    <div class="grid g4 mt16">
      ${metric('Лимитов задано', String(items.length), items.length ? 'на сумму ' + money(totalLimit) + (weekly.length ? ' · недельных: ' + weekly.length : '') : 'добавьте первый')}
      ${metric('Потрачено по лимитам', money(totalSpent), 'из ' + money(totalLimit))}
      ${metric('Осталось', money(round2(totalLimit - totalSpent)), totalSpent > totalLimit ? 'превышено на ' + money(totalSpent - totalLimit) : 'можно тратить')}
      ${metric('Проблемных категорий', String(over.length), over.length ? over.map(b => b.category).slice(0, 3).join(', ') : 'всё в пределах лимитов')}
    </div>
    ${(over.length || near.length) ? `<div class="banner mt16">${over.length ? '🔴 Превышены лимиты: ' + over.map(b => escapeHtml(b.category)).join(', ') + '. ' : ''}${near.length ? '🟡 Близко к лимиту: ' + near.map(b => escapeHtml(b.category)).join(', ') + '.' : ''}</div>` : ''}
  </div>
  <div class="card pad mt24">
    <div class="section-title">Лимиты по категориям</div>
    <div class="mt12">${items.length ? items.map(b => {
      const cls = b.pct > 100 ? 'bad' : b.pct > 90 ? 'warn' : '';
      const period = b.period === 'weekly' ? 'неделя' : 'месяц';
      return `<div class="mb16">
        <div class="row between wrap gap8">
          <div class="row gap8"><b>${escapeHtml(b.category)}</b>
            <span class="tag">${period}</span>
            ${cls === 'bad' ? '<span class="tag bad">перерасход</span>' : cls === 'warn' ? '<span class="tag warn">почти лимит</span>' : ''}</div>
          <div class="row gap8">
            <span class="mono">${money(b.spent)} / ${money(b.limit)}</span>
            <button class="btn sm ghost" data-act="budget-edit" data-cat="${escapeAttr(b.category)}" data-period="${b.period}" title="Изменить лимит">✎</button>
            <button class="btn sm ghost" data-act="budget-delete" data-cat="${escapeAttr(b.category)}" data-period="${b.period}" title="Удалить лимит">✕</button>
          </div>
        </div>
        <div class="mt8">${progressBar(b.pct, cls, (b.left >= 0 ? 'осталось ' + money(b.left) : 'перерасход ' + money(-b.left)) + ' · ' + b.pct.toFixed(0) + '% · ' + escapeHtml(b.range.label))}</div>
      </div>`;
    }).join('') : empty('◫', 'Лимитов пока нет', 'Добавьте лимит на категорию — приложение покажет, сколько осталось и предупредит о перерасходе.')}</div>
  </div>`;
};

/* ============================ ЦЕЛИ ============================ */
VIEWS.goals = function(){
  const totalTarget = sumMoney(S.goals, g => g.target), totalSaved = sumMoney(S.goals, g => g.saved);
  return `
  <div class="card pad">
    <div class="row between wrap gap8">
      <div><div class="section-title">Финансовые цели</div><div class="muted small mt4">Накоплено ${money(totalSaved)} из ${money(totalTarget)} по всем целям</div></div>
      <button class="btn primary" data-act="goal-new">＋ Новая цель</button>
    </div>
    <div class="mt16">${progressBar(totalTarget ? totalSaved / totalTarget * 100 : 0, '', 'общий прогресс')}</div>
  </div>
  <div class="grid g2 mt24">
    ${S.goals.length ? S.goals.map(g => {
      const pct = g.target ? g.saved / g.target * 100 : 0;
      const need = round2(Math.max(0, g.target - g.saved));
      const monthly = goalMonthlyPace(g);
      const eta = monthly > 0 && need > 0 ? Math.ceil(need / monthly) : 0;
      return `<div class="card pad">
        <div class="row gap16">
          <div class="ring" style="background:conic-gradient(#37e0a4 ${clamp(pct, 0, 100)}%, rgba(255,255,255,.08) 0)"><span>${pct.toFixed(0)}%</span></div>
          <div class="grow">
            <div class="bold" style="font-size:17px">${escapeHtml(g.name)}</div>
            <div class="muted small mt4">${money(g.saved)} из ${money(g.target)}</div>
            ${g.date ? `<div class="muted tiny mt4">срок: ${escapeHtml(fmtDate(g.date))} (${escapeHtml(relDays(g.date))})</div>` : ''}
            ${need > 0 ? `<div class="muted tiny mt4">не хватает ${money(need)}${monthly > 0 ? ` · при темпе ${money(monthly)}/мес — примерно ${eta} ${plural(eta, 'месяц', 'месяца', 'месяцев')}` : ''}</div>`
              : '<div class="ok small mt4">Цель достигнута 🎉</div>'}
          </div>
        </div>
        <div class="mt12">${progressBar(pct)}</div>
        <div class="row gap8 wrap mt12">
          <button class="btn sm primary" data-act="goal-add-money" data-id="${escapeAttr(g.id)}">Отложить</button>
          <button class="btn sm" data-act="goal-edit" data-id="${escapeAttr(g.id)}">Изменить</button>
          <button class="btn sm ghost" data-act="goal-delete" data-id="${escapeAttr(g.id)}">Удалить</button>
        </div>
        ${g.contributions && g.contributions.length ? `<div class="muted tiny mt12">ПОСЛЕДНИЕ ВЗНОСЫ</div>
          <div class="list">${g.contributions.slice(-4).reverse().map(c => `<div class="kv"><span>${escapeHtml(fmtDate(c.date))}</span><b class="mono ok">+${money(c.amount)}</b></div>`).join('')}</div>` : ''}
      </div>`;
    }).join('') : empty('◎', 'Целей пока нет', 'Например: «Подушка безопасности 3 оклада» или «Отпуск».')}
  </div>`;
};
function goalMonthlyPace(g){
  const list = (g.contributions || []).slice(-6);
  if (!list.length) return 0;
  return round2(sumMoney(list, c => c.amount) / list.length);
}

/* ============================ ПОВТОРЯЮЩИЕСЯ ПЛАТЕЖИ ============================ */
VIEWS.recurring = function(){
  const daily = upcomingRecurring(31);
  const monthly = sumMoney(S.recurring.filter(r => r.period === 'monthly'), r => r.amount)
    + sumMoney(S.recurring.filter(r => r.period === 'weekly'), r => num(r.amount) * 4.33)
    + sumMoney(S.recurring.filter(r => r.period === 'yearly'), r => num(r.amount) / 12);
  const overdue = S.recurring.filter(r => (daysUntil(r.next) || 0) < 0);
  return `
  <div class="card pad">
    <div class="row between wrap gap8">
      <div><div class="section-title">Повторяющиеся платежи</div>
        <div class="muted small mt4">Подписки и обязательные платежи. Их можно проводить одной кнопкой — операция создастся в выбранной категории.</div></div>
      <div class="row gap8">
        ${overdue.length ? `<button class="btn primary" data-act="rec-apply-overdue">Провести просроченные (${overdue.length})</button>` : ''}
        <button class="btn" data-act="rec-new">＋ Платёж</button>
      </div>
    </div>
    <div class="grid g3 mt16">
      ${metric('Платежей в списке', String(S.recurring.length))}
      ${metric('Нагрузка в месяц', money(monthly), 'по всем периодам')}
      ${metric('В ближайшие 31 день', String(daily.length), daily.length ? 'на ' + money(sumMoney(daily, r => r.amount)) : 'ничего не ожидается')}
    </div>
  </div>
  <div class="card pad mt24">
    <div class="section-title">Список</div>
    <div class="list mt8">${S.recurring.length ? S.recurring.slice().sort((a, b) => String(a.next).localeCompare(String(b.next))).map(r => {
      const d = daysUntil(r.next), late = d !== null && d < 0;
      return `<div class="item">
        <div class="avatar">${icon(r.type === 'income' ? 'coins' : 'repeat')}</div>
        <div class="grow"><div class="bold truncate">${escapeHtml(r.name)}</div>
          <div class="muted small">${escapeHtml(r.category)} · ${escapeHtml(PERIODS[r.period])} · следующий ${escapeHtml(fmtDate(r.next))} (${escapeHtml(relDays(r.next))})</div></div>
        <div class="amount ${r.type === 'income' ? 'income' : 'expense'} mono">${money(r.amount)}</div>
        <div class="row gap4">
          ${late ? '<span class="tag bad">просрочен</span>' : ''}
          <button class="btn sm primary" data-act="rec-apply" data-id="${escapeAttr(r.id)}">Провести</button>
          <button class="btn sm ghost" data-act="rec-edit" data-id="${escapeAttr(r.id)}">✎</button>
          <button class="btn sm ghost" data-act="rec-delete" data-id="${escapeAttr(r.id)}">✕</button>
        </div></div>`;
    }).join('') : empty('↻', 'Пока нет повторяющихся платежей', 'Добавьте подписки и обязательные платежи — они попадут в «скоро списания» и в расчёт «можно тратить в день».')}</div>
  </div>`;
};

/* ============================ КРЕДИТЫ ============================ */
VIEWS.credits = function(){
  const totalDebt = sumMoney(S.credits, c => creditRemaining(c)) + sumMoney(S.cards, c => num(c.used));
  const monthlyLoad = sumMoney(S.credits, c => { const p = nextUnpaidPayment(c); return p ? p.amount : 0; }) + sumMoney(S.cards.filter(c => num(c.used)), c => cardMinPayment(c));
  return `
  <div class="card pad">
    <div class="row between wrap gap8">
      <div><div class="section-title">Кредиты и кредитные карты</div>
        <div class="muted small mt4">Платежи строятся по графику. Когда вы отмечаете платёж, создаётся операция-расход — аналитика и бюджеты видят реальную картину.</div></div>
      <div class="row gap8">
        <button class="btn" data-act="card-new">＋ Кредитка</button>
        <button class="btn primary" data-act="credit-new">＋ Кредит</button>
      </div>
    </div>
    <div class="grid g3 mt16">
      ${metric('Общий долг', money(totalDebt), 'кредиты + карты')}
      ${metric('Платёж в месяц', money(monthlyLoad), 'по графикам и минимальным платежам')}
      ${metric('Кредитов / карт', S.credits.length + ' / ' + S.cards.length, 'активных записей')}
    </div>
  </div>

  <div class="card pad mt24">
    <div class="section-title">Кредиты</div>
    <div class="list mt8">${S.credits.length ? S.credits.map(c => {
      const rem = creditRemaining(c), nxt = nextUnpaidPayment(c), done = !nxt || c.paid;
      const totalPay = sumMoney(c.schedule || [], p => p.amount), paidPay = sumMoney(creditPaidPayments(c), p => p.amount);
      return `<div class="item" style="align-items:flex-start">
        <div class="avatar">${icon('bank')}</div>
        <div class="grow">
          <div class="row between wrap gap8"><div>
            <div class="bold">${escapeHtml(c.bank)}${c.purpose ? ' · ' + escapeHtml(c.purpose) : ''}</div>
            <div class="muted small mt4">${money(c.monthlyPayment)}/мес · ${escapeHtml(String(c.rate))}% годовых · ${c.termMonths} ${plural(c.termMonths, 'месяц', 'месяца', 'месяцев')}</div>
          </div>
          <div class="right">${done ? '<span class="tag ok">Оплачен</span>' : `<span class="tag ${daysUntil(nxt.date) <= 3 ? 'bad' : ''}">${escapeHtml(nxt ? fmtDate(nxt.date) + ' · ' + relDays(nxt.date) : '—')}</span>`}</div></div>
          <div class="grid g3 mt12">
            ${metric('Остаток долга', money(rem), 'кроме уже оплаченных платежей')}
            ${metric('Выплачено', money(paidPay), 'из ' + money(totalPay))}
            ${metric('Переплата', money(creditOverpay(c)), 'проценты за весь срок')}
          </div>
          <div class="mt12">${progressBar(creditProgress(c) * 100, '', creditPaidPayments(c).length + ' из ' + (c.schedule || []).length + ' платежей')}</div>
          <div class="row gap8 wrap mt12">
            ${done ? '' : `<button class="btn sm primary" data-act="credit-pay" data-id="${escapeAttr(c.id)}">Отметить платёж ${money(nxt ? nxt.amount : 0)}</button>`}
            <button class="btn sm" data-act="credit-schedule" data-id="${escapeAttr(c.id)}">График платежей</button>
            <button class="btn sm" data-act="credit-early" data-id="${escapeAttr(c.id)}">Досрочное погашение</button>
            <button class="btn sm ghost" data-act="credit-delete" data-id="${escapeAttr(c.id)}">Удалить</button>
          </div>
        </div></div>`;
    }).join('') : empty('🏦', 'Кредитов нет', 'Добавьте кредит — построю график платежей с процентами и остатком долга.')}</div>
  </div>

  <div class="card pad mt24">
    <div class="section-title">Кредитные карты</div>
    <div class="list mt8">${S.cards.length ? S.cards.map(c => {
      const util = cardUtilization(c), st = cardStatus(c);
      const grace = cardGraceLeft(c);
      return `<div class="item" style="align-items:flex-start">
        <div class="avatar">${icon('wallet')}</div>
        <div class="grow">
          <div class="row between wrap gap8"><div>
            <div class="bold">${escapeHtml(c.bank)} · ${escapeHtml(c.name)}</div>
            <div class="muted small mt4">Лимит ${money(c.limit)} · ставка ${escapeHtml(String(c.rate))}% · льготный период ${c.graceDays} дн. · мин. платёж ${escapeHtml(String(c.minPaymentPercent))}%</div>
          </div>
          <div class="right"><span class="tag ${st.level === 'bad' ? 'bad' : st.level === 'warn' ? 'warn' : 'ok'}">${escapeHtml(st.text)}</span></div></div>
          <div class="grid g3 mt12">
            ${metric('Задолженность', money(c.used), 'доступно ' + money(cardAvailable(c)))}
            ${metric('Минимальный платёж', money(cardMinPayment(c)), c.lastPaymentAt ? 'последний платёж ' + escapeHtml(fmtDate(String(c.lastPaymentAt).slice(0, 10))) : 'ещё не платили')}
            ${metric('Льготный период', grace === null ? '—' : grace + ' дн.', 'выписка ' + escapeHtml(fmtDate(c.statementDate)))}
          </div>
          <div class="mt12">${progressBar(util, util >= 80 ? 'bad' : util >= 50 ? 'warn' : '', 'загрузка лимита ' + util.toFixed(0) + '%')}</div>
          <div class="row gap8 wrap mt12">
            <button class="btn sm primary" data-act="card-pay" data-id="${escapeAttr(c.id)}">Погасить</button>
            <button class="btn sm ghost" data-act="card-delete" data-id="${escapeAttr(c.id)}">Удалить</button>
          </div>
        </div></div>`;
    }).join('') : empty('💳', 'Кредитных карт нет', 'Добавьте карту — покажу загрузку лимита, минимальный платёж и льготный период.')}</div>
  </div>`;
};

/* ============================ TELEGRAM ============================ */
VIEWS.telegram = function(){
  return `
  <section class="grid g-main">
    <div class="card pad">
      <div class="row between"><div class="section-title">Telegram-бот</div><span class="tag ok">тот же аккаунт</span></div>
      <div class="chat-bubble mt12">
        <div class="bold">Как подключить</div>
        <ol class="steps mt8">
          <li>Нажмите «Получить код привязки» — код действует 15 минут.</li>
          <li>Откройте бота в Telegram и отправьте <code>/link ВАШКОД</code>.</li>
          <li>Бот ответит подтверждением — после этого операции из Telegram сразу видны на сайте (и наоборот).</li>
        </ol>
        <div class="row gap8 wrap mt16">
          <button class="btn primary" data-act="tg-code">Получить код привязки</button>
          <span id="tgCode" class="tag">Код не создан</span>
          <a id="tgOpen" class="btn sm ghost hidden" href="#" target="_blank" rel="noopener noreferrer">Открыть бота ↗</a>
        </div>
      </div>
      <div class="card pad-sm mt16" style="background:rgba(255,255,255,.03)">
        <div class="row between"><div class="bold">Статус привязки</div><button class="btn sm ghost" data-act="tg-refresh">Проверить</button></div>
        <div id="tgStatus" class="muted small mt8">Проверяю…</div>
      </div>
      <div class="chat-bubble mt16"><b>Уведомления и контроль</b><div class="small mt4">Платежи по кредитам и кредиткам: за 3 дня, за день и в дату платежа. Также бот предупредит о регулярном списании и достижении 80%/100% бюджета, а по воскресеньям пришлёт сводку. Время — по часовому поясу устройства при создании кода.</div><div class="small mt8">В Telegram команда <code>/notifications</code> включает нужные типы, <code>/timezone</code> меняет часовой пояс. Операции бот сначала показывает на подтверждение; ошибочную можно отменить командой <code>/undo</code> в течение 24 часов.</div></div>
      <div class="muted small mt12">Бот принимает свободный текст: «пятёрочка 1200», «билайн 900», «такси 42,50 вчера», «зарплата 80к». Категории и правила, заданные здесь, бот тоже использует.</div>
    </div>
    <div class="card pad">
      <div class="section-title">Команды бота</div>
      <table class="table mt12">
        <tbody>
          ${[['/start, /menu', 'главное меню с кнопками'], ['/today', 'итоги за сегодня'], ['/month или /report', 'отчёт за месяц'],
             ['/balance', 'баланс за всё время'], ['/credits или /debts', 'кредиты, карты и даты платежей'], ['/upcoming', 'платежи на 14 дней'],
             ['/budget', 'лимиты и потрачено'], ['/budget set …', 'создать или изменить лимит'], ['/goals', 'прогресс по целям'],
             ['/notifications', 'включить/выключить типы уведомлений'], ['/timezone', 'местное время напоминаний'], ['/undo', 'отменить операцию из Telegram (24 ч.)'],
             ['/unlink', 'безопасно отключить бота'], ['/link КОД', 'привязать аккаунт'], ['/help', 'помощь и примеры']]
            .map(([c, d]) => `<tr><td><code>${escapeHtml(c)}</code></td><td class="muted">${escapeHtml(d)}</td></tr>`).join('')}
        </tbody>
      </table>
      <div class="divider"></div>
      <div class="bold">Проверить распознавание текста</div>
      <div class="muted small mt4">Тот же алгоритм, что в боте — можно посмотреть, как разберётся фраза.</div>
      <div class="row gap8 mt12" style="align-items:flex-start">
        <input id="tgDemo" class="field grow" placeholder="например: билайн 900" aria-label="Проверка распознавания">
        <button class="btn" data-act="tg-demo">Разобрать</button>
      </div>
      <div id="tgDemoOut" class="chat-bubble mt12 muted small">Здесь появится разбор.</div>
    </div>
  </section>`;
};

/* ============================ ФУНКЦИИ (календарь, до зарплаты, счета) ============================ */
VIEWS.tools = function(){
  const cur = S.view.calMonth || thisMonthKey();
  const d = fromISO(cur + '-01');
  const first = new Date(d.getFullYear(), d.getMonth(), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const startDow = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= last.getDate(); day++) cells.push(cur + '-' + pad2(day));
  const accounts = accountsWithBalance();
  const runway = S.view.runway || { date: addDaysISO(today(), 14), reserve: 0 };
  const accountsTotal = sumMoney(accounts, a => a.balance);
  return `
  <section class="grid g-main">
    <div class="card pad">
      <div class="row between">
        <div class="section-title">Финансовый календарь</div>
        <div class="row gap8">
          <button class="btn sm ghost" data-act="cal-prev">←</button>
          <span class="bold">${escapeHtml(fmtMonth(cur))}</span>
          <button class="btn sm ghost" data-act="cal-next">→</button>
        </div>
      </div>
      <div class="cal mt16">
        ${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<div class="dow">${x}</div>`).join('')}
        ${cells.map(date => {
          if (!date) return '<div></div>';
          let inc = 0, exp = 0;
          for (const o of S.ops){ if (o.date !== date) continue; if (o.type === 'income') inc += num(o.amount); else exp += num(o.amount); }
          const chips = [];
          upcomingCreditPayments(400).filter(p => p.date === date).forEach(p => chips.push(`<span class="chip ${p.kind === 'card' ? 'card' : 'pay'}" title="${escapeAttr(p.title)}">${p.kind === 'card' ? '💳' : '🏦'} ${escapeHtml(moneyShort(p.amount))}</span>`));
          S.recurring.filter(r => r.next === date).forEach(r => chips.push(`<span class="chip rec" title="${escapeAttr(r.name)}">↻ ${escapeHtml(moneyShort(r.amount))}</span>`));
          S.goals.filter(g => g.date === date).forEach(g => chips.push(`<span class="chip goal" title="${escapeAttr(g.name)}">◎ ${escapeHtml(g.name.slice(0, 12))}</span>`));
          return `<div class="day ${date === today() ? 'today' : ''}">
            <div class="row between"><span class="n">${Number(date.slice(-2))}</span>${inc ? `<span class="ok tiny">+${escapeHtml(moneyShort(inc))}</span>` : exp ? `<span class="bad tiny">−${escapeHtml(moneyShort(exp))}</span>` : ''}</div>
            ${chips.join('')}</div>`;
        }).join('')}
      </div>
      <div class="muted tiny mt12">🏦 платёж по кредиту · 💳 платёж по кредитке · ↻ повторяющийся платёж · ◎ цель</div>
    </div>

    <div class="col gap16">
      <div class="card pad">
        <div class="section-title">Режим «до зарплаты»</div>
        <div class="muted small mt4">Сколько можно тратить в день, если отложить резерв и учесть платежи до зарплаты.</div>
        <div class="form-grid mt12">
          <div><label class="label" for="runDate">Дата зарплаты</label><input id="runDate" type="date" class="field" value="${escapeAttr(runway.date)}"></div>
          <div><label class="label" for="runReserve">Резерв</label><input id="runReserve" type="number" min="0" step="100" class="field" value="${escapeAttr(runway.reserve)}"></div>
        </div>
        <button class="btn primary mt12" data-act="runway-calc">Рассчитать</button>
        <div id="runwayOut" class="chat-bubble mt12 small">${runwayHtml(runway.date, num(runway.reserve))}</div>
      </div>

      <div class="card pad">
        <div class="row between"><div class="section-title">Счета и кошельки</div>
          <button class="btn sm" data-act="account-new">＋ Счёт</button></div>
        <div class="muted small mt4">Баланс счёта = начальный остаток + доходы − расходы по операциям, привязанным к счёту.</div>
        <div class="list mt12">${accounts.length ? accounts.map(a => `<div class="item">
            <div class="avatar">${icon(a.kind === 'cash' ? 'coins' : a.kind === 'savings' ? 'bank' : 'wallet')}</div>
            <div class="grow"><div class="bold">${escapeHtml(a.name)}</div><div class="muted small">начальный остаток ${money(a.initial)}</div></div>
            <div class="amount mono">${money(a.balance)}</div>
            <button class="btn sm ghost" data-act="account-delete" data-id="${escapeAttr(a.id)}">✕</button></div>`).join('')
          : '<div class="muted small">Счетов пока нет. Добавьте хотя бы один и привязывайте операции — увидите остатки.</div>'}</div>
        ${accounts.length ? `<div class="divider"></div><div class="row between"><span class="muted">Всего по счетам</span><b>${money(accountsTotal)}</b></div>` : ''}
      </div>
    </div>
  </section>`;
};
function runwayHtml(dateISO, reserve){
  const days = Math.max(1, daysUntil(dateISO) || 1);
  const acc = allTimeBalance();
  const obligations = upcomingCreditPayments(days).reduce((a, x) => a + num(x.amount), 0) + upcomingRecurring(days).reduce((a, x) => a + num(x.amount), 0);
  const free = round2(acc - reserve - obligations);
  const perDay = round2(free / days);
  return `<div class="bold" style="font-size:18px">${money(Math.max(0, perDay))} в день</div>
    <div class="muted small mt4">${days} ${plural(days, 'день', 'дня', 'дней')} до зарплаты · свободно ${money(free)}</div>
    <div class="muted tiny mt4">баланс ${money(acc)} − резерв ${money(reserve)} − обязательства ${money(obligations)}</div>`;
}
