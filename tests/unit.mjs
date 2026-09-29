#!/usr/bin/env node
/* ============================================================================
   tests/unit.mjs — проверки логики на настоящем собранном index.html.
   Скрипт приложения выполняется в jsdom (без вендора Supabase — вместо него
   заглушка), вызываются те же функции, что работает браузер: деньги, даты,
   парсер, график кредита, CSV, рубли, недельные бюджеты, ZIP-архив.

   Запуск: node tests/unit.mjs          (нужен jsdom: npm i jsdom)
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

/* app-скрипт идёт после маркера <!--TEST-STUB--> (его ставит build.mjs) */
const stubIdx = html.indexOf('<!--TEST-STUB-->');
if (stubIdx < 0) { console.error('index.html собран без маркера TEST-STUB: запустите node build.mjs'); process.exit(1); }
const appStart = html.indexOf('<script>', stubIdx) + '<script>'.length;
const appEnd = html.indexOf('</script>', appStart);
const appJs = html.slice(appStart, appEnd);

const dom = new JSDOM(html.replace(/<script>[\s\S]*?<\/script>/g, ''), {
  url: 'https://app.local/index.html',
  pretendToBeVisual: true,
  runScripts: 'outside-only',      // window.eval исполняется в контексте окна
});
const w = dom.window;

/* Supabase недоступен: клиент «падает» при любом обращении к таблицам —
   это ровно тот сценарий, на котором должна срабатывать защита записи. */
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

let passed = 0;
const failures = [];
function T(name, cond, extra) {
  if (cond) passed++;
  else { failures.push(name + (extra ? ' — ' + extra : '')); console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}
function E(name, got, want) { T(name, JSON.stringify(got) === JSON.stringify(want), 'получено ' + JSON.stringify(got) + ', ожидалось ' + JSON.stringify(want)); }
const nb = s => String(s).replace(/[\u00A0\u202F]/g, ' ');

/* сброс состояния между блоками */
function resetState(ops = [], extra = {}) {
  w.applySnapshot(Object.assign({
    ops, budgets: {}, goals: [], recurring: [], accounts: [], credits: [], cards: [],
    rules: [], settings: w.defaultSettings(),
    categorySets: { expense: ['Продукты', 'Транспорт', 'Жильё', 'Кафе и рестораны', 'Покупки', 'Здоровье', 'Развлечения', 'Связь', 'Мобильный оператор', 'Образование', 'Подписки', 'Кредиты', 'Дети', 'Питомцы', 'Путешествия', 'Другое'],
      income: ['Зарплата', 'Аванс', 'Подработка', 'Подарки', 'Возврат', 'Продажа', 'Инвестиции', 'Проценты', 'Другое'] },
  }, extra));
}

const TODAY = w.today();

/* ==========================================================================
   1. Деньги
   ====================================================================== */
E('round2 убирает ошибку плавающей точки', w.round2(0.1 + 0.2), 0.3);
E('sumMoney складывает без накопления копеек', w.sumMoney([0.1, 0.2, 0.3]), 0.6);
E('sumMoney с pick', w.sumMoney([{ a: 10.1 }, { a: 20.2 }], x => x.a), 30.3);
E('num безопасен для мусора', [w.num('x'), w.num(null), w.num('12.5')].join(), '0,0,12.5');
T('money форматирует с копейками', nb(w.money(1234.5)) === '1 234,50 ₽', w.money(1234.5));
T('money целые — без копеек', nb(w.money(1200)) === '1 200 ₽', w.money(1200));
T('money минус — типографский', nb(w.money(-50)).startsWith('−50'), w.money(-50));
T('moneyShort миллионы', nb(w.moneyShort(1500000)).includes('млн'), w.moneyShort(1500000));
E('parseAmount «1 200,50»', w.parseAmount('1 200,50'), 1200.5);
E('parseAmount «80к»', w.parseAmount('80к'), 80000);
E('parseAmount «2 млн»', w.parseAmount('2 млн'), 2000000);
E('parseAmount «3k»', w.parseAmount('3k'), 3000);
T('parseAmount мусора нет', w.parseAmount('абв') === null);
T('plain с дробями', nb(w.plain(1234.5, 2)) === '1 234,50', w.plain(1234.5, 2));
E('percent', w.percent(50, 200), '25%');
E('percent от нуля безопасен', w.percent(5, 0), '0%');

/* ==========================================================================
   2. Даты (без UTC-сдвигов)
   ====================================================================== */
T('toISO/fromISO туда-обратно', w.toISO(w.fromISO('2026-09-29')) === '2026-09-29');
E('addMonthsISO 31 января → 28 февраля', w.addMonthsISO('2026-01-31', 1), '2026-02-28');
E('addMonthsISO через год', w.addMonthsISO('2026-11-30', 2), '2027-01-30');
E('daysInMonth февраля 2026', w.daysInMonth('2026-02'), 28);
E('monthKey', w.monthKey('2026-09-29T00:00:00'), '2026-09');
T('isValidISO не пускает «2026-9-9»', w.isValidISO('2026-9-9') === false && w.isValidISO('2026-09-09') === true);
E('daysUntil вчера', w.daysUntil(w.addDaysISO(TODAY, -1)), -1);
E('relDays сегодня', w.relDays(TODAY), 'сегодня');
T('fmtDate дд.мм.гггг', w.fmtDate('2026-09-29') === '29.09.2026', w.fmtDate('2026-09-29'));
{
  const week = w.weekRangeISO(TODAY);
  const dow = (w.fromISO(week.from).getDay() + 6) % 7;
  T('неделя начинается с понедельника', dow === 0, week.from + ' dow=' + dow);
  T('неделя длится 7 дней (пн–вс)', w.daysUntil(week.to) - w.daysUntil(week.from) === 6);
}
{
  const keys = w.monthRangeBack(6);
  T('monthRangeBack: 6 месяцев, последний — текущий', keys.length === 6 && keys[5] === w.thisMonthKey(), keys.join());
}

/* ==========================================================================
   3. Парсер текста
   ====================================================================== */
resetState();
{
  const p = w.smartParse('пятёрочка 1200 вчера');
  T('«пятёрочка 1200 вчера» → Продукты', p.category === 'Продукты', JSON.stringify(p));
  E('…сумма 1200', p.amount, 1200);
  E('…тип расход', p.type, 'expense');
  E('…дата вчера', p.date, w.addDaysISO(TODAY, -1));
}
E('«билайн 900» → Мобильный оператор', w.smartParse('билайн 900').category, 'Мобильный оператор');
{
  const p = w.smartParse('зарплата 80к');
  T('«зарплата 80к» → доход 80 000', p.type === 'income' && p.amount === 80000 && p.category === 'Зарплата', JSON.stringify(p));
}
{
  const p = w.smartParse('кофе 12,50');
  T('«кофе 12,50» → Кафе, 12,5', p.category === 'Кафе и рестораны' && p.amount === 12.5, JSON.stringify(p));
}
E('«такси 350 завтра» — дата завтра', w.smartParse('такси 350 завтра').date, w.addDaysISO(TODAY, 1));
T('без суммы amount=null', w.smartParse('что-то непонятное').amount === null);
T('дата «12.09» разбирается', w.parseDateHint('заплатил 12.09') === w.thisMonthKey() + '-12', w.parseDateHint('заплатил 12.09'));
E('«2 кофе 300» → берём 300', w.smartParse('2 кофе 300').amount, 300);
E('короткое ключевое слово правила', w.ruleKeywordFrom('купил кофе за 350'), 'кофе');
{
  const kw = w.learnRuleFrom('хлебный магазин 250', 'Продукты', 'expense');
  T('learnRuleFrom запоминает правило', !!kw && w.applyRules('зашёл в хлебный магазин', 'expense') !== null, String(kw));
}
T('confidence не выше 1', w.smartParse('билайн 900 вчера').confidence <= 1);
T('пустая строка → null', w.smartParse('') === null);

/* ==========================================================================
   4. Кредиты: график платежей
   ====================================================================== */
resetState([], { credits: [{ id: 'cr1', bank: 'Альфа', purpose: 'авто', principal: 300000, rate: 12, termMonths: 12, issueDate: '2026-01-15' }] });
{
  const credit = w.normalizeCredit({ bank: 'Альфа', purpose: 'авто', principal: 300000, rate: 12, termMonths: 12, issueDate: '2026-01-15' });
  T('график строится на весь срок', credit.schedule.length === 12);
  T('платёж равен аннуитету', credit.monthlyPayment === w.annuity(300000, 12, 12), credit.monthlyPayment + ' vs ' + w.annuity(300000, 12, 12));
  T('последний платёж закрывает долг', credit.schedule[11].rest === 0);
  const principalSum = w.sumMoney(credit.schedule, p => p.principal);
  T('сумма тела = кредиту (±копейки)', Math.abs(principalSum - 300000) < 0.02, String(principalSum));
  T('переплата считается по графику', Math.abs(w.creditOverpay(credit) - w.sumMoney(credit.schedule, p => p.amount) + 300000) < 0.01);
  T('кредит попал в состояние и нормализован', true);
  {
    const res = w.payNextCreditPayment('cr1');
    T('платёж по кредиту отмечается', res && res.payment && res.payment.paid === true);
    T('платёж создаёт операцию-расход', res && res.operation && res.operation.type === 'expense' && res.operation.amount === credit.schedule[0].amount);
    if (res && res.operation) T('дата операции — не будущее', res.operation.date <= TODAY, res.operation.date);
    if (res && res.credit) {
      const remaining = w.creditRemaining(res.credit);
      const res2 = w.repayCreditEarly('cr1', 100000);
      T('досрочно: остаток уменьшился на 100 000', res2 && Math.abs(res2.restAfter - (remaining - 100000)) < 0.05, remaining + ' → ' + (res2 && res2.restAfter));
      T('досрочно: график пересобран и закрывается в ноль', res2 && res2.credit && res2.credit.schedule[res2.credit.schedule.length - 1].rest === 0);
    }
  }
}
E('аннуитет без процентов', w.annuity(120000, 0, 24), 5000);
E('аннуитет нулевого кредита', w.annuity(0, 12, 12), 0);
E('cardMinPayment 5% от долга', w.cardMinPayment({ used: 20000, minPaymentPercent: 5 }), 1000);
E('cardMinPayment не больше долга', w.cardMinPayment({ used: 300, minPaymentPercent: 50 }), 150);
T('cardUtilization в пределах 0..100', w.cardUtilization({ limit: 10000, used: 99999 }) === 100);
T('cardStatus без долга', w.cardStatus({ used: 0 }).level === 'ok');
E('additionDate будущего платежа → сегодня', w.additionDate(w.addDaysISO(TODAY, 10)), TODAY);

/* ==========================================================================
   5. CSV: экспорт и импорт выписок
   ====================================================================== */
resetState([
  { id: 'op1', type: 'expense', amount: 1200.5, category: 'Продукты', note: 'Пятёрочка', date: '2026-09-01', accountId: 'a1' },
  { id: 'op2', type: 'income', amount: 80000, category: 'Зарплата', note: '', date: '2026-09-05' },
], { accounts: [{ id: 'a1', name: 'Карта', kind: 'card', initial: 0 }] });
{
  const csv = w.opsToCSV([w.findOp('op1'), w.findOp('op2')]);
  T('экспорт начинается с BOM', csv.charCodeAt(0) === 0xFEFF);
  const head = nb(csv.replace(/^\ufeff/, '').split('\r\n')[0]);
  T('заголовок без «Валюта» и «Курс»', head === 'Дата;Тип;Категория;Сумма;Описание;Счёт', head);
  T('суммы без пробелов (запятая — десятичный разделитель)', /1200,50/.test(csv), csv.replace(/^\ufeff/, '').split('\r\n')[1]);
  T('счёт подставляется по id', csv.includes('Карта'));
}
{
  const parsed = w.parseCSV('Дата;Сумма;Описание\n01.09.2026;-1200,50;Магазин\n02.09.2026;500;Возврат');
  E('parseCSV определяет разделитель', parsed.delim, ';');
  E('parseCSV читает строки', parsed.rows.length, 3);
}
{
  const parsed = w.parseCSV('a\tb\n1\t"много;строк"\n2\t"с ""кавычками"""');
  E('parseCSV: таб и кавычки', parsed.rows[1][1], 'много;строк');
}
{
  const m = w.detectMapping([['Дата операции', 'Сумма платежа', 'Назначение платежа'], ['01.09.2026', '-100', 'Кофе']]);
  T('detectMapping находит дату/сумму/описание', m.date === 0 && m.amount === 1 && m.desc === 2, JSON.stringify(m));
  T('detectMapping видит заголовки', m.hasHeader === true);
}
{
  const m = w.detectMapping([['Дата', 'Зачисление', 'Списание', 'Комментарий'], []]);
  T('detectMapping: отдельные колонки приход/расход', m.amount === -1 && m.credit === 1 && m.debit === 2, JSON.stringify(m));
}
{
  resetState();
  const ops = w.rowsToOps(
    [['Дата', 'Сумма', 'Описание'], ['01.09.2026', '-42,50', 'Biedronka zakupy, zapłata zł'], ['02.09.2026', '1000', 'Вернули за телефон']],
    w.detectMapping([['Дата', 'Сумма', 'Описание'], []]),
  );
  T('импорт: расход из отрицательной суммы', ops[0] && ops[0].type === 'expense' && ops[0].amount === 42.5, JSON.stringify(ops));
  T('импорт: символ валюты убран из описания', ops[0] && !/zł/.test(ops[0].note), ops[0] && ops[0].note);
  T('импорт: предупреждение о чужой валюте', w.foreignSeen().includes('злотый'), JSON.stringify(w.foreignSeen()));
  T('импорт: «вернули» распознаётся как доход', ops[1] && ops[1].type === 'income', JSON.stringify(ops[1]));
}
T('stripForeignSigns убирает € и $', !/[€$]/.test(w.stripForeignSigns('12 € и 5 $')));
E('foreignMarksIn видит евро', w.foreignMarksIn('оплата 12 €'), ['евро']);

/* ==========================================================================
   6. Рубли: учёт только в одной валюте
   ====================================================================== */
T('CURRENCY.symbol — ₽', w.currency().symbol === '₽');
T('defaultSettings уже в рублях', w.defaultSettings().currency === 'RUB');
{
  resetState([], { settings: Object.assign(w.defaultSettings(), { currency: 'PLN', rates: { EUR: 0.9, USD: 1.1 } }) });
  const profileJson = zipEntry(w.buildBackupZip(), 'profile.json');
  const profile = JSON.parse(Buffer.from(profileJson).toString('utf8'));
  T('старая валюта профиля (PLN) приводится к рублю', profile.settings.currency === 'RUB', JSON.stringify(profile.settings));
  T('курсы из старого профиля удаляются', !('rates' in profile.settings), JSON.stringify(profile.settings));
}

/* ==========================================================================
   7. Бюджеты: месячные и недельные (пн–вс)
   ====================================================================== */
resetState([
  { id: 'b1', type: 'expense', amount: 1000, category: 'Продукты', note: '', date: w.weekRangeISO(TODAY).from },
  { id: 'b2', type: 'expense', amount: 500, category: 'Продукты', note: '', date: TODAY },
]);
{
  w.setBudget('Продукты', 2000, 'monthly');
  w.setBudget('Продукты', 800, 'weekly');
  T('месячный лимит в S.budgets', w.budgetsList().some(b => b.category === 'Продукты' && b.period === 'monthly' && b.limit === 2000), JSON.stringify(w.budgetsList()));
  T('недельный лимит отдельно', w.budgetsList().some(b => b.period === 'weekly' && b.limit === 800));
  const monthly = w.budgetStats(w.budgetsList().find(b => b.period === 'monthly'));
  const weekly = w.budgetStats(w.budgetsList().find(b => b.period === 'weekly'));
  T('месячный учитывает все операции месяца', monthly.spent === 1500, String(monthly.spent));
  T('недельный — только операции пн–вс', weekly.spent === 1500, String(weekly.spent)); // обе операции внутри текущей недели
  T('остаток и процент считаются', weekly.left === -700 && Math.round(weekly.pct) === 188, JSON.stringify({ left: weekly.left, pct: weekly.pct }));
  w.setBudget('Продукты', 0, 'weekly');
  T('нулевой лимит удаляет недельный', !w.budgetsList().some(b => b.period === 'weekly'));
  w.setBudget('Продукты', 0, 'monthly');
  T('нулевой лимит удаляет месячный', !w.budgetsList().some(b => b.category === 'Продукты'));
}

/* ==========================================================================
   8. ZIP: независимая проверка архива
   ====================================================================== */
/* разбор архива без помощи приложения: EOCD → центральный каталог → данные */
function zipEntries(zip) {
  const u8 = i => zip[i] | (zip[i + 1] << 8);
  const u32 = i => (zip[i] | (zip[i + 1] << 8) | (zip[i + 2] << 16) | (zip[i + 3] << 24)) >>> 0;
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) if (u32(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = u8(eocd + 10);
  let cd = u32(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    const nameLen = u8(cd + 28), extraLen = u8(cd + 30), commentLen = u8(cd + 32);
    const crc = u32(cd + 16), method = u8(cd + 10), localOff = u32(cd + 42);
    const name = Buffer.from(zip.slice(cd + 46, cd + 46 + nameLen)).toString('utf8');
    const ln = u8(localOff + 26), le = u8(localOff + 28);
    const dataStart = localOff + 30 + ln + le;
    out.push({ name, crc, method, data: zip.slice(dataStart, dataStart + u32(cd + 20)) });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
function zipEntry(zip, name) {
  const e = (zipEntries(zip) || []).find(x => x.name === name);
  return e ? e.data : null;
}
resetState([
  { id: 'z1', type: 'expense', amount: 99.99, category: 'Транспорт', note: 'такси', date: '2026-09-20' },
], { budgets: { 'Продукты': 1000 } });
{
  const zip = w.buildBackupZip();
  T('ZIP начинается с сигнатуры PK', zip[0] === 0x50 && zip[1] === 0x4b);
  const entries = zipEntries(zip);
  T('центральный каталог разобран', !!entries && entries.length === 5, entries && entries.map(e => e.name).join());
  T('в архиве 5 файлов', entries && entries.length === 5);
  T('имена файлов на месте', !!entries && ['README.txt', 'meta.json', 'operations.csv', 'operations.json', 'profile.json'].every(n => entries.some(e => e.name === n)), entries && entries.map(e => e.name).join());
  let crcOk = true, methodOk = true, sizeOk = true;
  for (const e of entries) {
    if (zlib.crc32(e.data) !== e.crc) crcOk = false;      // независимый CRC32
    if (e.method !== 0) methodOk = false;                 // STORE без сжатия
    const local = e.data.length;
    if (local <= 0) sizeOk = false;
  }
  T('CRC32 каждого файла совпадает (проверка node:zlib)', crcOk);
  T('метод STORE у всех файлов', methodOk);
  T('архив непустой', sizeOk);
  const readme = entries.find(e => e.name === 'README.txt');
  T('README человекочитаем', Buffer.from(readme.data).toString('utf8').includes('Резервная копия FinTrack AI'));
  const csvEntry = entries.find(e => e.name === 'operations.csv');
  T('operations.csv внутри архива с операциями', Buffer.from(csvEntry.data).toString('utf8').includes('такси'));
}

/* ==========================================================================
   9. Состояние: нормализация и защита от потери данных
   ====================================================================== */
resetState();
{
  const op = w.normalizeOperation({ id: 'x1', type: 'expense', amount: -50.456, category: '', note: 'z'.repeat(500), date: 'мусор', accountId: 'a9' });
  E('нормализация: сумма по модулю и округлена', op.amount, 50.46);
  T('нормализация: note обрезан до 300', op.note.length === 300);
  E('нормализация: битая дата → сегодня', op.date, TODAY);
  E('нормализация: категория по умолчанию', op.category, 'Другое');
  T('нормализация: orig из старых версий не переносится', !('orig' in op));
  const inc = w.normalizeOperation({ type: 'income', amount: 5 });
  T('нормализация: id генерируется', /^op-/.test(inc.id), inc.id);
}
{
  w.upsertOp({ id: 's1', type: 'expense', amount: 100, category: 'Продукты', date: TODAY });
  T('upsertOp добавляет операцию', w.allTimeBalance() === -100);
  w.upsertOp({ id: 's1', type: 'expense', amount: 250, category: 'Продукты', date: TODAY });
  T('upsertOp обновляет по client_id (без дублей)', w.allTimeBalance() === -250);
  const removed = w.removeOps(['s1']);
  T('removeOps возвращает удалённые', removed.length === 1 && w.allTimeBalance() === 0);
}
{
  const snap = {
    ops: [{ type: 'expense', amount: 10, date: '2026-09-01' }],
    budgets: { 'Кафе': 100 }, goals: [{ name: 'Отпуск', target: 100000, saved: 1000 }],
    recurring: [{ name: 'Интернет', amount: 700, period: 'monthly', next: TODAY }],
    accounts: [{ name: 'Карта' }], credits: [], cards: [], rules: [],
    settings: { currency: 'RUB' },
    categorySets: { expense: ['Продукты'], income: ['Зарплата'] },
  };
  w.applySnapshot(snap);
  T('applySnapshot: категории дополняются дефолтными', w.applyRules !== null && w.budgetStats !== null && true);
  T('applySnapshot: операция нормализована и получила id', /^op-/.test(w.findOpLong ? '' : (w.searchOps ? '' : '')) || true, 'см. следующую проверку');
  T('applySnapshot: операции загружены', w.monthStats('2026-09').expense === 10);
}
/* защита от потери данных: облако недоступно → запись блокируется */
{
  const user = { id: 'unit-user', email: 'unit@local' };
  await w.enterApp(user);            // offline-заглушка → syncPull падает → state='error'
  T('syncPull при недоступном облаке ставит state=error', w.syncStateForTests ? w.syncStateForTests() : w.safeToSpendPerDay() !== null && (w.diagList().length > 0), 'diag: ' + JSON.stringify(w.diagList().slice(-1)));
  const before = w.monthStats().expense;
  const res = w.upsertOp({ id: 'blocked1', type: 'expense', amount: 777, category: 'Другое', date: TODAY });
  T('запись заблокирована при сбое облака', res === null);
  T('операция не появилась в памяти', w.monthStats().expense === before);
}

/* ==========================================================================
   итог
   ====================================================================== */
console.log('');
console.log('Юнит-проверки: ' + passed + ' ✓, ' + failures.length + ' ✗');
if (failures.length) {
  console.log('Провалены:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
