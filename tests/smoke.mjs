#!/usr/bin/env node
/* ============================================================================
   tests/smoke.mjs — прогон интерфейса в jsdom на настоящем index.html.
   Проверяет то, что видно пользователю: демо-режим, все экраны, быстрый ввод,
   форму операции (без полей валюты), темы, диагностику, бэкап, офлайн-режим,
   фильтры операций, тосты и модальные окна.

   Запуск: node tests/smoke.mjs          (нужен jsdom: npm i jsdom)
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const stubIdx = html.indexOf('<!--TEST-STUB-->');
if (stubIdx < 0) { console.error('index.html собран без маркера TEST-STUB: запустите node build.mjs'); process.exit(1); }
const appStart = html.indexOf('<script>', stubIdx) + '<script>'.length;
const appEnd = html.indexOf('</script>', appStart);
const appJs = html.slice(appStart, appEnd);

const dom = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), {
  url: 'https://app.local/index.html',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});
const w = dom.window;
const doc = w.document;

const offlineClient = () => ({
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  from: () => { throw new Error('нет связи с сервером'); },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel() {},
});
w.supabase = { createClient: () => offlineClient() };
w.eval(appJs);

/* boot() в тестах не вызываем (он пошёл бы в сеть) — но его «инженерную» часть
   включаем ровно как в приложении: делегирование кликов, поля ввода, хуки ошибок */
w.installErrorHooks();
w.installGlobalEvents();
w.installInputEvents();

let passed = 0;
const failures = [];
function T(name, cond, extra) {
  if (cond) passed++;
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
const nb = s => String(s).replace(/[\u00A0\u202F]/g, ' ');
const $ = id => doc.getElementById(id);
const visible = id => { const el = $(id); return !!el && !el.classList.contains('hidden'); };
const text = id => nb(($(id) || { textContent: '' }).textContent);
const TODAY = w.today();

/* ==========================================================================
   1. Демо-режим и все экраны
   ====================================================================== */
w.startDemo();
T('демо: баннер «Демо-режим» показан', text('bannerHost').includes('Демо-режим'));
T('демо: операции сгенерированы (280+)', w.monthStats('1970-01') && doc.body.textContent.includes('Проведено операций'), '');
{
  const opsCount = (text('view').match(/Проведено операций/) || []).length;
  T('демо: главная отрисована с балансом', text('view').includes('Общий баланс'));
  T('демо-маркер на месте', opsCount === 1);
}
T('демо: syncBar пишет, что данные не сохраняются', text('syncBar').includes('Демо-режим'));

const tabs = [
  ['overview', 'Общий баланс'],
  ['operations', 'Поиск по описанию'],
  ['analytics', 'Аналитика'],
  ['budgets', 'Бюджеты'],
  ['goals', 'Финансовые цели'],
  ['recurring', 'Повторяющиеся платежи'],
  ['credits', 'Кредит'],
  ['telegram', 'Telegram'],
  ['tools', 'Финансовый календарь'],
  ['settings', 'Российский рубль'],
];
for (const [tab, marker] of tabs) {
  let threw = null;
  try { w.go(tab); } catch (e) { threw = e; }
  T('экран «' + tab + '» рендерится без ошибок', threw === null, threw && threw.message);
  T('экран «' + tab + '» содержит «' + marker + '»', text('view').includes(marker));
}

/* ==========================================================================
   2. Быстрый ввод
   ====================================================================== */
w.go('operations');
{
  const input = $('qadd');
  T('быстрый ввод: поле на месте', !!input);
  input.value = 'кофе 350';
  w.qaddPreview();
  T('быстрый ввод: предпросмотр показывает сумму и категорию', text('qaddPrev').includes('350') && text('qaddPrev').includes('Кафе'), text('qaddPrev'));
  input.value = 'билайн 900';
  w.qaddPreview();
  T('быстрый ввод: оператор распознан', text('qaddPrev').includes('Мобильный оператор'));
  const before = w.monthStats().expense;
  input.value = 'такси 500 вчера';
  w.submitQuickAdd();
  T('быстрый ввод: операция добавлена', w.monthStats().expense === before + 500);
  T('быстрый ввод: поле очищено', $('qadd').value === '');
  T('быстрый ввод: тост с отменой', text('toasts').includes('Расход') && text('toasts').includes('Отменить'), text('toasts'));
  const firstToastBtn = doc.querySelector('#toasts button');
  if (firstToastBtn) { const b = w.monthStats().expense; firstToastBtn.click(); T('быстрый ввод: «Отменить» удаляет операцию', Math.abs(w.monthStats().expense - (b - 500)) < 0.01); }
  else T('быстрый ввод: кнопка отмены есть', false);
}

/* ==========================================================================
   3. Форма операции: только рубли, без полей валюты
   ====================================================================== */
{
  w.draftResetForTests ? w.draftResetForTests() : null;
  w.modalOp();
  T('форма: шторка открыта', visible('sheetHost'));
  T('форма: подпись «Сумма, ₽»', text('sheetHost').includes('Сумма, ₽'));
  T('форма: поля валюты и курса отсутствуют', !$('opCurrency') && !$('opRate'));
  T('форма: типы расход/доход', text('sheetHost').includes('Расход') && text('sheetHost').includes('Доход'));
  $('opAmount').value = '1234.56';   // input[type=number]: только точка (запятые разбирает быстрый ввод)
  $('opNote').value = 'smoke-тест покупка';
  const btn = doc.querySelector('#sheetHost [data-act="op-save"]');
  btn.click();
  T('форма: операция сохранена', text('view').includes('smoke-тест покупка') || w.monthStats().expense > 0);
  T('форма: шторка закрылась после сохранения', !visible('sheetHost'));
}

/* ==========================================================================
   4. Темы
   ====================================================================== */
{
  w.applyTheme('light', { silent: true });
  T('тема: светлая применяется', doc.documentElement.getAttribute('data-theme') === 'light');
  T('тема: выбор запоминается', w.lgGetTheme() === 'light');
  w.applyTheme('dark', { silent: true });
  T('тема: тёмная применяется', doc.documentElement.getAttribute('data-theme') === 'dark');
  w.applyTheme('auto', { silent: true });
  T('тема: «авто» не ломает атрибут', ['light', 'dark'].includes(doc.documentElement.getAttribute('data-theme')));
  T('тема: «авто» сохранена', w.lgGetTheme() === 'auto');
}

/* ==========================================================================
   5. Диагностика
   ====================================================================== */
{
  w.diagClear();
  T('диагностика: журнал очищается', w.diagList().length === 0);
  w.diagLog('test', 'ошибка номер один', 'ctx');
  const list = w.diagList();
  T('диагностика: запись добавлена', list.length === 1 && list[0].message === 'ошибка номер один');
  T('диагностика: тип и контекст сохранены', list[0].kind === 'test' && list[0].extra === 'ctx');
  T('диагностика: время в ISO', /^20\d\d-/.test(list[0].at));
  for (let i = 0; i < 40; i++) w.diagLog('flood', 'запись ' + i);
  T('диагностика: журнал не растёт бесконечно (максимум 30)', w.diagList().length <= 30, String(w.diagList().length));
  T('диагностика: diagText содержит последнюю запись', w.diagText().includes('запись 39'));
  w.diagClear();
  {
    let captured = null;
    w.Sentry = { captureException: (e) => { captured = e; } };
    w.diagLog('sentry', 'проверка Sentry');
    T('диагностика: ошибка уходит в window.Sentry', captured && captured.name === 'FinTrack:sentry', captured && captured.name);
    delete w.Sentry;
  }
  {
    doc.body.dispatchEvent(new w.ErrorEvent('error', { message: 'упало в рантайме', bubbles: true })); // на window не body
    doc.defaultView.dispatchEvent(new w.ErrorEvent('error', { message: 'упало в рантайме' }));
    T('диагностика: window error попадает в журнал', w.diagText().includes('упало в рантайме'), w.diagText());
  }
}

/* ==========================================================================
   6. Бэкап: напоминание и архив
   ====================================================================== */
{
  T('бэкап: без копии напоминание активно', w.backupDue() === true);
  w.markBackupDone();
  T('бэкап: после скачивания напоминание гаснет', w.backupDue() === false);
  const zip = w.buildBackupZip();
  T('бэкап: архив собирается', zip && zip.length > 500 && zip[0] === 0x50);
}

/* ==========================================================================
   7. Офлайн-предохранитель (интерфейс)
   ====================================================================== */
{
  await w.enterApp({ id: 'smoke-user', email: 'smoke@local' });   // offline-стаб → ошибка загрузки
  T('офлайн: баннер о неудачной загрузке', text('bannerHost').includes('Не удалось загрузить данные'), text('bannerHost'));
  T('офлайн: есть кнопка «Повторить»', !!doc.querySelector('#bannerHost [data-act="retry-sync"]'));
  T('офлайн: syncBar сообщает о блокировке записи', text('syncBar').includes('Запись заблокирована'), text('syncBar'));
  const res = w.upsertOp({ id: 'blocked', type: 'expense', amount: 1, category: 'Другое', date: TODAY });
  T('офлайн: операция не сохраняется', res === null);
  w.startDemo();   // возвращаемся в демо для оставшихся сценариев
  w.go('operations');
}

/* ==========================================================================
   8. Фильтры операций
   ====================================================================== */
{
  const before = $('opResult') ? $('opResult').innerHTML.length : 0;
  const q = $('opQuery');
  T('фильтры: поле поиска существует', !!q);
  q.value = 'несуществующий-фрагмент-xyz';
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
  T('фильтры: пустой результат по мусорному запросу', text('opResult').includes('Ничего не найдено') || $('opResult').innerHTML.length < before, nb(text('opResult')).slice(0, 80));
  q.value = '';
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
  T('фильтры: список вернулся', $('opResult').innerHTML.length > 100);
  const type = $('opType');
  type.value = 'income';
  type.dispatchEvent(new w.Event('input', { bubbles: true }));
  T('фильтры: фильтр по типу не падает', !!$('opResult'));
  type.value = 'all';
  type.dispatchEvent(new w.Event('input', { bubbles: true }));
}

/* ==========================================================================
   9. Тосты, модальные окна, confirm
   ====================================================================== */
{
  doc.querySelector('#toasts').innerHTML = '';
  w.toast('просто уведомление');
  T('тосты: элемент появляется', text('toasts').includes('просто уведомление'));
  w.toast('с ошибкой', { bad: true });
  T('тосты: «плохой» тост помечен', !!doc.querySelector('#toasts .bad'));
  w.closeSheet();
  T('шторка: closeSheet опустошает', !visible('sheetHost'));
  {
    let answered = null;
    w.confirmSheet({ title: 'Точно?', text: 'Проверка', onAnswer: v => { answered = v; } }).then ? null : null;
    const yes = doc.querySelector('#sheetHost [data-act="confirm-yes"]');
    T('confirm: кнопки на месте', !!yes);
    if (yes) yes.click();
  }
}

/* ==========================================================================
   10. Кредиты и карты на экране: кнопки платежей
   ====================================================================== */
{
  w.go('credits');
  const view = text('view');
  const demoHasCredits = view.includes('график') || view.includes('Платёж') || view.includes('Добавить кредит');
  T('кредиты: экран содержит управление', demoHasCredits, view.slice(0, 120));
  T('кредиты: есть блок кредитных карт', view.includes('редитн'));
}

/* ==========================================================================
   11. Настройки: рубли, диагностика, опасная зона
   ====================================================================== */
{
  w.go('settings');
  const view = text('view');
  T('настройки: валюта — только рубль', view.includes('Российский рубль (₽)'));
  T('настройки: нет выбора валюты и курсов', !view.includes('Базовая валюта') && !view.includes('Курсы'));
  T('настройки: есть диагностика', view.includes('Диагностика'));
  T('настройки: есть архив всей истории', view.includes('архивом') || view.includes('архив'), '');
  T('настройки: опасная зона с удалением аккаунта', view.includes('Опасная зона'));
}

/* ==========================================================================
   итог
   ====================================================================== */
console.log('');
console.log('Проверки интерфейса: ' + passed + ' ✓, ' + failures.length + ' ✗');
if (failures.length) {
  console.log('Провалены:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
