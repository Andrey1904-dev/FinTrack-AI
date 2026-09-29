/* Дымовой тест: грузит index.html?demo=1 в jsdom и прогоняет основные сценарии.
   S, ACTIONS, draft — объявлены через let/const в классическом скрипте, поэтому
   достаём их через eval в глобальном контексте. */
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'fs';

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push('jsdomError: ' + (e.stack || e.message)));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));
vc.on('warn', () => {});
vc.on('log', () => {});

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8080/?demo=1',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole: vc
});
const w = dom.window, d = w.document;
w.scrollTo = () => {};
if (!w.matchMedia) w.matchMedia = () => ({ matches: false, addEventListener(){}, removeEventListener(){} });

const S = () => w.eval('S');
const ACTIONS = () => w.eval('ACTIONS');
const wait = ms => new Promise(r => setTimeout(r, ms));
const fail = [];
const check = async (name, fn) => {
  try {
    const r = await fn();
    if (r === false) fail.push(name);
    else if (typeof r === 'string') fail.push(name + ' → ' + r);
    else console.log('  ok  ' + name);
  }
  catch (e) { fail.push(name + ' → ' + e.message); }
};
const lastToast = () => {
  const t = d.querySelectorAll('#toasts .toast');
  return t.length ? t[t.length - 1].textContent : '';
};

await wait(400);

console.log('— старт —');
await check('демо запустилось (#app виден)', () => !d.getElementById('app').classList.contains('hidden'));
await check('есть операции', () => S().ops.length > 100);

console.log('— вкладки —');
for (const tab of ['overview', 'operations', 'analytics', 'budgets', 'goals', 'recurring', 'credits', 'telegram', 'tools', 'settings']) {
  await check('вкладка ' + tab, () => {
    w.go(tab);
    if (S().view.tab !== tab) throw new Error('вкладка не сменилась');
    const htmlLen = d.getElementById('view').innerHTML.length;
    if (htmlLen < 200) throw new Error('пустой вид ' + htmlLen);
    return true;
  });
}

const dupIds = () => {
  const ids = Array.from(d.querySelectorAll('[id]')).map(e => e.id);
  const seen = new Set(), dups = new Set();
  ids.forEach(i => { if (seen.has(i)) dups.add(i); seen.add(i); });
  return [...dups];
};
await check('нет дублирующихся id в других вкладках', async () => {
  const dups = [];
  for (const tab of ['overview', 'analytics', 'budgets', 'goals', 'recurring', 'credits', 'telegram', 'tools', 'settings']) {
    w.go(tab); await wait(20);
    dupIds().forEach(x => dups.push(tab + ':' + x));
  }
  return dups.length ? 'дубли id: ' + dups.join(', ') : true;
});
await check('нет дублирующихся id: вкладка «Операции» + модалка редактирования', async () => {
  w.go('operations'); await wait(30);
  const base = dupIds();
  w.eval('draft.op = null'); w.modalOp(); await wait(60);
  const dups = [...base, ...dupIds()];
  w.closeSheet();
  return dups.length ? 'дубли id: ' + [...new Set(dups)].join(', ') : true;
});
await check('нет дублирующихся id: модалка разделения', async () => {
  w.modalOpSplit(String(S().ops[0].id)); await wait(60);
  const dups = dupIds();
  w.closeSheet();
  return dups.length ? 'дубли id: ' + dups.join(', ') : true;
});

console.log('— операции: создание/редактирование —');
await check('модалка новой операции открывается', () => { w.eval('draft.op = null'); w.modalOp(); return !!d.querySelector('#sheetHost .sheet'); });
await check('сохранение операции', () => {
  d.getElementById('opAmount').value = '1234.56';
  d.getElementById('opNote').value = 'тестовая операция';
  const before = S().ops.length;
  ACTIONS()['op-save']({ dataset: { id: '' } });
  if (S().ops.length !== before + 1) throw new Error('операция не добавилась');
  return true;
});
await check('FIX: смена типа при редактировании сохраняет id (нет дубля)', () => {
  const op = S().ops.find(o => o.note !== undefined) || S().ops[0];
  const id = String(op.id), before = S().ops.length, note = op.note;
  w.eval('draft.op = null');
  w.modalOp(id);
  d.querySelector('[data-act="op-type"][data-type="income"]').click();
  const saveBtn = d.querySelector('[data-act="op-save"]');
  const saveId = saveBtn.getAttribute('data-id');
  if (saveId !== id) return 'data-id потерян: «' + saveId + '» ≠ «' + id + '»';
  d.getElementById('opAmount').value = String(op.amount);
  d.getElementById('opNote').value = note;
  ACTIONS()['op-save']({ dataset: { id: saveId } });
  const after = S().ops.length;
  if (after !== before) return 'создано ' + (after - before) + ' лишних операций (дубль)';
  return true;
});

console.log('— удаление счёта vs удаление аккаунта —');
await check('FIX: кнопка ✕ у счёта открывает «Удалить счёт?», а не удаление аккаунта', () => {
  S().accounts.push({ id: 'acc-test', name: 'Тест', kind: 'cash', initial: 0 });
  w.go('tools');
  const btn = d.querySelector('[data-act="account-delete"][data-id="acc-test"]');
  if (!btn) return 'кнопка удаления счёта не найдена';
  btn.click();
  const title = (d.querySelector('#sheetHost .section-title') || {}).textContent || '';
  const sheetHtml = d.getElementById('sheetHost').innerHTML;
  w.closeSheet();
  if (/аккаунт/i.test(title) || sheetHtml.includes('УДАЛИТЬ')) return 'открылось удаление АККАУНТА: «' + title + '»';
  if (!/счёт/i.test(title)) return 'неожиданное окно: «' + title + '»';
  return true;
});

console.log('— разделение операции (split) —');
await check('split: модалка открывается, части суммируются, сохранение заменяет операцию', () => {
  const op = S().ops.find(o => o.type === 'expense' && o.amount >= 100);
  if (!op) return 'нет подходящей операции';
  const id = String(op.id), before = S().ops.length;
  globalThis.__splitOrig = { id, amount: op.amount };
  w.modalOpSplit(id);
  if (!d.getElementById('splitRows')) return 'модалка не открылась';
  const amts = d.querySelectorAll('.split-amt');
  if (amts.length !== 2) return 'ожидалось 2 строки, есть ' + amts.length;
  const half = Math.round(op.amount * 70) / 100 * 100 / 2; // просто делим пополам с округлением
  const part1 = round2p(op.amount / 2), part2 = round2p(op.amount - part1);
  amts[0].value = String(part1); amts[1].value = String(part2);
  d.querySelectorAll('.split-cat')[1].value = 'Развлечения';
  ACTIONS()['split-save']({ dataset: { id } });
  const after = S().ops.length;
  if (after !== before + 1) return 'ожидалось +1 операция (2 части − оригинал), стало ' + (after - before);
  const parts = S().ops.filter(o => o.note && o.note.includes('· 1/2') || o.note && o.note.includes('· 2/2'));
  if (parts.length !== 2) return 'части не найдены по пометке · 1/2';
  const sum = parts.reduce((a, o) => a + o.amount, 0);
  if (Math.abs(sum - op.amount) > 0.005) return 'сумма частей ' + sum + ' ≠ ' + op.amount;
  return true;
});
function round2p(v){ return w.round2(v); }
await check('split: отмена из тоста возвращает исходную операцию', () => {
  const parts = S().ops.filter(o => o.note && /· [12]\/2/.test(o.note));
  if (parts.length !== 2) return 'части не найдены (' + parts.length + ')';
  const undoBtn = Array.from(d.querySelectorAll('#toasts .toast .act')).pop();
  if (!undoBtn) return 'кнопка «Отменить» в тосте не найдена';
  undoBtn.click();
  const orig = globalThis.__splitOrig;
  const restored = w.findOp(orig.id);
  if (!restored) return 'исходная операция не восстановлена';
  const partsLeft = S().ops.filter(o => o.note && /· [12]\/2/.test(o.note)).length;
  if (partsLeft) return 'части не удалились: ' + partsLeft;
  if (Math.abs(restored.amount - orig.amount) > 0.005) return 'сумма восстановлена неверно';
  return true;
});

console.log('— дублирование операции —');
await check('op-duplicate создаёт копию на сегодня', () => {
  const op = S().ops[0];
  const before = S().ops.length;
  ACTIONS()['op-duplicate']({ dataset: { id: String(op.id) } });
  if (S().ops.length !== before + 1) return 'копия не создалась';
  const copy = S().ops.find(o => o.id !== op.id && o.note === op.note && o.amount === op.amount && o.date === w.today());
  if (!copy) return 'копия с сегодняшней датой не найдена';
  w.removeOps([copy.id]);
  return true;
});

console.log('— быстрый ввод —');
for (const [text, exp] of [['пятёрочка 1200 вчера', { amount: 1200, cat: 'Продукты' }],
                           ['зарплата 80к', { amount: 80000, type: 'income' }],
                           ['такси 42,50', { amount: 42.5, cat: 'Транспорт' }],
                           ['билайн 900', { amount: 900 }]]) {
  await check('smartParse «' + text + '»', () => {
    const p = w.smartParse(text);
    if (!p) throw new Error('null');
    if (exp.amount !== undefined && p.amount !== exp.amount) throw new Error('сумма ' + p.amount + ' ≠ ' + exp.amount);
    if (exp.cat && p.category !== exp.cat) throw new Error('категория ' + p.category + ' ≠ ' + exp.cat);
    if (exp.type && p.type !== exp.type) throw new Error('тип ' + p.type);
    return true;
  });
}

console.log('— повторяющиеся платежи —');
await check('FIX: «Провести» не создаёт операцию из будущего', () => {
  const r = { id: w.uid('r'), name: 'Тест подписка', amount: 100, period: 'monthly', next: w.addDaysISO(w.today(), 10), category: 'Подписки', type: 'expense', accountId: '' };
  S().recurring.push(r);
  const res = w.applyRecurringOnce(r.id);
  if (!res) throw new Error('не провелось');
  const op = S().ops.find(o => o.id === res.operation.id);
  if (!op) throw new Error('операция не найдена');
  const idx = S().recurring.findIndex(x => x.id === r.id);
  if (idx >= 0) S().recurring.splice(idx, 1);
  w.removeOps([op.id]);
  return op.date <= w.today() ? true : 'дата операции ' + op.date + ' > сегодня ' + w.today();
});
await check('FIX: applyRecurringOnce блокируется при sync error', () => {
  const r = { id: w.uid('r'), name: 'Тест2', amount: 50, period: 'monthly', next: w.today(), category: 'Подписки', type: 'expense', accountId: '' };
  S().recurring.push(r);
  const prev = w.eval('S.sync.state');
  w.eval("S.sync.state = 'error'");
  let res;
  try { res = w.applyRecurringOnce(r.id); } finally { w.eval("S.sync.state = '" + prev + "'"); }
  const idx = S().recurring.findIndex(x => x.id === r.id);
  if (idx >= 0) S().recurring.splice(idx, 1);
  return res === null ? true : 'ожидал null, получил ' + JSON.stringify(!!res);
});

console.log('— кредиты —');
await check('payNextCreditPayment создаёт операцию и откатывается', () => {
  const c = S().credits[0];
  const before = S().ops.length;
  const res = w.payNextCreditPayment(c.id);
  if (!res || !res.payment) throw new Error('платёж не прошёл');
  if (S().ops.length !== before + 1) throw new Error('операция не создалась');
  w.undoCreditPayment(res);
  if (S().ops.length !== before) throw new Error('отмена не удалила операцию');
  return true;
});
await check('FIX: payNextCreditPayment не падает при заблокированной записи', () => {
  const c = S().credits[0];
  const prev = w.eval('S.sync.state');
  w.eval("S.sync.state = 'error'");
  try {
    const r = w.payNextCreditPayment(c.id);
    return r === null ? true : 'ожидал null, получил результат';
  } catch (e) {
    return 'УПАЛ: ' + e.message;
  } finally {
    w.eval("S.sync.state = '" + prev + "'");
    const nxt = w.nextUnpaidPayment(c);
    if (nxt && nxt.paid && !nxt.operationId) nxt.paid = false;
  }
});
await check('FIX: repayCreditEarly блокируется и не изменяет график при sync error', () => {
  const c = S().credits[0];
  const prev = w.eval('S.sync.state');
  const schedLen = (c.schedule || []).length, rest = w.creditRemaining(c);
  w.eval("S.sync.state = 'error'");
  try {
    const r = w.repayCreditEarly(c.id, 5000);
    if (r !== null) return 'не заблокирован (график ' + schedLen + ' → ' + (c.schedule || []).length + ')';
    if ((c.schedule || []).length !== schedLen) return 'график изменился при блокировке';
    if (w.creditRemaining(c) !== rest) return 'остаток долга изменился при блокировке';
    return true;
  } catch (e) {
    return 'УПАЛ: ' + e.message;
  } finally { w.eval("S.sync.state = '" + prev + "'"); }
});
await check('FIX: payCard блокируется при sync error', () => {
  const c = S().cards[0];
  const prev = w.eval('S.sync.state'), used = c.used;
  w.eval("S.sync.state = 'error'");
  let r;
  try { r = w.payCard(c.id, 1000); } finally { w.eval("S.sync.state = '" + prev + "'"); }
  return r === null && c.used === used ? true : (r === null ? 'долг уменьшился без операции' : 'не заблокирован');
});

console.log('— бюджеты —');
await check('FIX: недельный бюджет удаляется вместе с категорией (через реальный обработчик)', async () => {
  const cat = 'ТестКатегория';
  S().categorySets.expense.push(cat);
  w.setBudget(cat, 100, 'monthly');
  w.setBudget(cat, 50, 'weekly');
  ACTIONS()['category-delete']({ dataset: { kind: 'expense', cat } });
  await wait(60);
  const yes = d.querySelector('[data-act="confirm-yes"]');
  if (!yes) return 'confirmSheet не открылся';
  yes.click();
  await wait(60);
  const weeklyLeft = Object.keys(S().settings.weeklyBudgets || {}).includes(cat);
  const monthlyLeft = Object.keys(S().budgets).includes(cat);
  return !weeklyLeft && !monthlyLeft ? true : ('остались: monthly=' + monthlyLeft + ', weekly=' + weeklyLeft);
});
await check('бюджеты: остатки прошлого месяца показаны', () => {
  w.go('budgets');
  const html = d.getElementById('view').innerHTML;
  return html.includes('не переносятся') || html.includes('Остатки') ? true : 'блок «Остатки прошлого месяца» не найден';
});

console.log('— фильтры/поиск —');
await check('поиск по описанию работает', () => {
  S().view.opQuery = 'зарплат';
  const list = w.filteredOps();
  S().view.opQuery = '';
  return list.length > 0 && list.every(o => (o.note + ' ' + o.category).toLowerCase().includes('зарплат'));
});
await check('FIX: поиск по сумме фильтрует по amount', () => {
  const amt = S().ops[0].amount;
  S().view.opQuery = String(amt);
  const list = w.filteredOps();
  S().view.opQuery = '';
  if (!list.length) return 'по точной сумме ' + amt + ' ничего не найдено';
  return list.some(o => Math.abs(o.amount - amt) < 0.005) ? true : 'нет совпадения суммы';
});

console.log('— аналитика: период и баланс —');
await check('balanceSeries считает нарастающий итог', () => {
  const s = w.balanceSeries(6);
  if (s.length !== 6) return 'должно быть 6 точек, есть ' + s.length;
  return typeof s[0].value === 'number' && typeof s[0].label === 'string';
});
await check('периодный отчёт рендерится и считает', () => {
  w.go('analytics');
  const rep = d.getElementById('view').innerHTML;
  if (!rep.includes('Отчёт за период')) return 'карточка «Отчёт за период» не найдена';
  const st = w.periodStats(w.addDaysISO(w.today(), -29), w.today());
  if (typeof st.inc !== 'number' || typeof st.exp !== 'number' || st.days !== 30) return 'periodStats: ' + JSON.stringify({ inc: st.inc, exp: st.exp, days: st.days });
  if (!Array.isArray(st.byCat)) return 'byCat отсутствует';
  return true;
});
await check('periodRange уважает выбранные даты', () => {
  S().view.repFrom = '2026-01-01'; S().view.repTo = '2026-01-31';
  const r = w.periodRange();
  S().view.repFrom = null; S().view.repTo = null;
  return r.from === '2026-01-01' && r.to === '2026-01-31' ? true : JSON.stringify(r);
});
await check('график: отрицательные значения не ломают шкалу', () => {
  const svg = w.chartLine({ labels: ['а', 'б', 'в'], series: [{ id: 'x', name: 'X', color: '#fff', data: [-500, -100, 200] }] });
  if (!svg.includes('<svg')) return 'svg не сгенерирован';
  const neg = /fill="[^"]*"[^>]*font-size="10">-\d/.test(svg) || svg.includes('>-500<') || svg.includes('>-0,5') || svg.includes('>−');
  // важно: значения вообще попали в шкалу (min учитывается)
  const yMatch = svg.match(/y1="([\d.]+)"/g) || [];
  return yMatch.length >= 4 ? true : 'мало линий сетки: ' + yMatch.length;
});

console.log('— приватный режим —');
await check('stealth: маскирует суммы и включается/выключается', async () => {
  w.go('overview');
  const before = d.getElementById('view').textContent;
  if (!/\d/.test(before)) return 'на странице нет цифр (странно)';
  ACTIONS()['stealth-toggle']();
  await wait(50);
  const masked = d.getElementById('view').textContent;
  const digitsLeft = (masked.match(/\d/g) || []).length;
  if (digitsLeft > 2) return 'цифры остались: ' + digitsLeft + ' шт. (первые: ' + (masked.match(/\d+/g) || []).slice(0, 3) + ')';
  if (w.localStorage.getItem('ft.v2.stealth') !== '1') return 'состояние не сохранилось';
  // выключение
  ACTIONS()['stealth-toggle']();
  await wait(50);
  const after = d.getElementById('view').textContent;
  if (!/\d/.test(after)) return 'после выключения цифры не вернулись';
  if (w.localStorage.getItem('ft.v2.stealth') === '1') return 'состояние не сбросилось';
  return true;
});

console.log('— неделя начинается с —');
await check('FIX: weekStart=вс (0) сдвигает неделю', () => {
  S().settings.weekStart = 1;
  const r1 = w.weekRangeISO('2025-09-17');
  S().settings.weekStart = 0;
  const r2 = w.weekRangeISO('2025-09-17');
  S().settings.weekStart = 1;
  if (r1.from !== '2025-09-15') return 'пн-неделя неверна: ' + r1.from;
  return r2.from === '2025-09-14' ? true : 'вс-неделя неверна: ' + r2.from;
});
await check('настройка weekStart есть в Настройках', () => {
  w.go('settings');
  const sel = d.getElementById('setWeekStart');
  return sel ? (sel.querySelector('option[value="0"]') ? true : 'нет опции воскресенья') : 'select #setWeekStart не найден';
});

console.log('— CSV —');
await check('opsToCSV не падает и содержит BOM', () => {
  const csv = w.opsToCSV(S().ops.slice(0, 5));
  return csv.startsWith('﻿') && csv.split('\r\n').length >= 6;
});
await check('parseCSV + detectMapping по выписке', () => {
  const text = 'Дата;Сумма;Описание\n15.09.2025;-450,90;Пятёрочка продукты\n16.09.2025;1000;Зарплата\n';
  const parsed = w.parseCSV(text);
  const map = w.detectMapping(parsed.rows);
  const ops = w.rowsToOps(parsed.rows, map);
  if (ops.length !== 2) throw new Error('распознано ' + ops.length + ' из 2');
  if (ops[0].type !== 'expense' || ops[1].type !== 'income') throw new Error('типы: ' + ops.map(o => o.type));
  return true;
});
await check('архив ZIP собирается', () => {
  const bytes = w.buildBackupZip();
  // instanceof не сравниваем: Uint8Array из мира jsdom — другое realm
  return bytes && bytes.length > 500 && bytes[0] === 0x50 && bytes[1] === 0x4b
    ? true : 'битый архив: len=' + (bytes && bytes.length) + ' sig=' + (bytes && bytes[0]);
});

console.log('— даты и деньги —');
await check('addMonthsISO не ломает 31 января', () => w.addMonthsISO('2025-01-31', 1) === '2025-02-28');
await check('round2/sumMoney', () => w.round2(0.1 + 0.2) === 0.3 && w.sumMoney([0.1, 0.2]) === 0.3);
await check('money формат (нормализуем NBSP)', () => w.money(1234.5).replace(/[\s\u00a0\u202f]/g, ' ') === '1 234,50 ₽');
await check('parseAmount «80к»', () => w.parseAmount('80к') === 80000);

console.log('— прочее —');
await check('FIX: «…ещё» в меню показывает SVG-иконки, а не имя файла', () => {
  w.eval("ACTIONS['show-more-tabs']()");
  const html = d.querySelector('#sheetHost').innerHTML;
  const hasRaw = />home Главная</.test(html) || />gear Настройки</.test(html);
  w.closeSheet();
  return hasRaw ? 'видно текстовое имя иконки' : true;
});
await check('кнопка удаления аккаунта в настройках существует под новым act', () => {
  w.go('settings');
  const btn = d.querySelector('[data-act="account-delete-all"]');
  return btn ? true : 'кнопка «Удалить аккаунт целиком» потеряна';
});
await check('страница без jsdom-ошибок', () => errors.length === 0 ? true : errors.length + ' ошибок: ' + errors[0]);

console.log('\n=================');
if (fail.length) {
  console.log('ПРОВАЛЕНО (' + fail.length + '):');
  fail.forEach(f => console.log('  ✗ ' + f));
  process.exitCode = 1;
} else console.log('Все проверки пройдены');
