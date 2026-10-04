import assert from 'node:assert/strict';
import { parseAmount, parseTransaction, formatRUB, daysBetweenISO } from '../supabase/functions/_shared/parser.js';
import { constantTimeEqual, escapeHtml } from '../supabase/functions/_shared/telegram.js';

const profile = {
  categories: {
    expense: ['Продукты', 'Транспорт', 'Кафе и рестораны', 'Другое'],
    income: ['Зарплата', 'Другое']
  },
  rules: [
    { keyword: 'любимый магазин', category: 'Зарплата', type: 'income' },
    { keyword: 'любимый магазин', category: 'Продукты', type: 'expense' }
  ]
};
const options = { today: '2026-09-29', profile };

assert.deepEqual(parseTransaction('кофе 250 вчера', options), {
  type: 'expense', amount: 250, date: '2026-09-28', category: 'Кафе и рестораны', note: 'кофе'
});
assert.deepEqual(parseTransaction('зарплата 80к', options), {
  type: 'income', amount: 80000, date: '2026-09-29', category: 'Зарплата', note: 'Зарплата'
});
assert.equal(parseTransaction('такси 1 250,50 28.09.2026', options).amount, 1250.5);
assert.equal(parseTransaction('такси 1 250,50 28.09.2026', options).date, '2026-09-28');
assert.equal(parseTransaction('покупка 12.500', options).amount, 12500);
assert.equal(parseAmount('80к'), 80000);
assert.equal(parseAmount('0'), 0);
assert.equal(parseTransaction('кофе 0', options), null);
assert.equal(parseTransaction('перевод другу', options), null);
assert.equal(parseTransaction('любимый магазин 420', options).category, 'Продукты');
assert.equal(formatRUB(1250), '1 250 ₽');
assert.equal(daysBetweenISO('2026-09-29', '2026-10-02'), 3);
assert.equal(escapeHtml('<b>магазин & сын</b>'), '&lt;b&gt;магазин &amp; сын&lt;/b&gt;');
assert.equal(constantTimeEqual('valid_secret_01', 'valid_secret_01'), true);
assert.equal(constantTimeEqual('valid_secret_01', 'valid_secret_02'), false);

/* ---------- оформление сообщений ---------- */
import * as Render from '../supabase/functions/_shared/render.js';
// Intl подставляет неразрывные пробелы в суммах — для читаемости проверок приводим их к обычным
const plain = value => typeof value === 'string' ? value.replace(/[\u00a0\u202f]/gu, ' ') : value;
const R = Object.fromEntries(Object.entries(Render).map(([key, fn]) => [key, typeof fn === 'function' ? (...args) => plain(fn(...args)) : fn]));
const {
  bar, percent, plural, statusIcon, categoryIcon, signed, relativeDay, totalsOf, renderReport, renderBudgets, renderGoals,
  renderCredits, renderUpcoming, renderOperationCard, renderBudgetImpact, renderMenu, renderBudgetAlert, renderWeeklyDigest, renderCreditAlert,
  renderSalarySummary, renderHourCard
} = R;

assert.equal(bar(0.5), '▰▰▰▰▰▱▱▱▱▱');
assert.equal(bar(0), '▱▱▱▱▱▱▱▱▱▱');
assert.equal(bar(0.01), '▰▱▱▱▱▱▱▱▱▱', 'small non-zero share is still visible');
assert.equal(bar(3), '▰▰▰▰▰▰▰▰▰▰', 'overspend is clamped to a full bar');
assert.equal(bar(NaN), '▱▱▱▱▱▱▱▱▱▱');
assert.equal(percent(25, 100), 25);
assert.equal(percent(5, 0), 0);
assert.deepEqual([1, 2, 5, 11, 21, 22, 25].map(n => plural(n, 'день', 'дня', 'дней')), ['день', 'дня', 'дней', 'дней', 'день', 'дня', 'дней']);
assert.deepEqual([50, 80, 99, 100, 140].map(statusIcon), ['🟢', '🟡', '🟡', '🔴', '🔴']);
assert.equal(categoryIcon('Кафе и рестораны'), '☕');
assert.equal(categoryIcon('Что-то своё'), '🔹');
assert.equal(signed(-1250), '−1 250 ₽');
assert.equal(signed(1250), '+1 250 ₽');
assert.equal(relativeDay(-2), 'просрочен на 2 дня');
assert.equal(relativeDay(0), 'сегодня');
assert.equal(relativeDay(1), 'завтра');
assert.equal(relativeDay(5), 'через 5 дней');

const rows = [
  { type: 'income', amount: 100000, category: 'Зарплата', note: 'аванс', date: '2026-09-10' },
  { type: 'expense', amount: 30000, category: 'Продукты', note: 'магнит', date: '2026-09-11' },
  { type: 'expense', amount: 10000, category: 'Кафе и рестораны', note: '<b>кофе</b>', date: '2026-09-12' }
];
assert.deepEqual(totalsOf(rows), { income: 100000, expense: 40000, balance: 60000 });
const report = renderReport({ title: 'Сентябрь 2026', icon: '📆', rows, previous: { income: 0, expense: 50000, balance: 0 }, previousLabel: 'в прошлом месяце', days: 20, showRecent: 5 });
assert.match(report, /Сентябрь 2026/);
assert.match(report, /Сберегли <b>60%<\/b>/u);
assert.match(report, /Расходы на 20% ниже/u, 'trend versus previous period is shown');
assert.match(report, /🛒 Продукты — <b>30 000 ₽<\/b> · 75%/u);
assert.match(report, /в день/u);
assert.ok(!report.includes('<b>кофе</b>'), 'user text is HTML-escaped');
assert.match(report, /&lt;b&gt;кофе&lt;\/b&gt;/u);
assert.match(renderReport({ title: 'Сегодня', rows: [] }), /Операций пока нет/u);

const budgets = renderBudgets({ monthly: [{ category: 'Продукты', spent: 26000, limit: 30000 }, { category: 'Транспорт', spent: 12000, limit: 10000 }], weekly: [] });
assert.ok(budgets.indexOf('Транспорт') < budgets.indexOf('Продукты'), 'most stressed budget goes first');
assert.match(budgets, /🔴[^\n]*Транспорт[^\n]*120%/u);
assert.match(budgets, /перерасход 2 000 ₽/u);
assert.match(budgets, /🟡[^\n]*Продукты[^\n]*87%/u);
assert.match(renderBudgetImpact({ category: 'Кофе', spent: 500, limit: 1000, period: 'месяц' }), /50%/);
assert.equal(renderBudgetImpact({ category: 'Кофе', spent: 500, limit: 0 }), '');

const goals = renderGoals([{ name: 'Отпуск', saved: 50000, target: 100000 }, { name: 'Ноутбук', saved: 120000, target: 100000 }]);
assert.match(goals, /Отпуск<\/b> — 50%/u);
assert.match(goals, /Ноутбук<\/b> — 100%/u);
assert.match(goals, /достигнута/u);

const credits = renderCredits({
  credits: [{ title: 'Сбер · Авто', remaining: 500000, next: { amount: 15000, date: '2026-10-05', delta: 5 } }],
  cards: [{ title: 'Тинькофф · Black', used: 20000, limit: 100000, minimum: 1000, date: '2026-10-01', delta: 1 }]
});
assert.match(credits, /Общий долг: <b>520 000 ₽<\/b>/u);
assert.match(credits, /20% лимита/u);
assert.match(renderUpcoming([]), /платежей нет/u);
assert.match(renderUpcoming([{ name: 'Интернет', amount: 700, date: '2026-10-01', delta: 1 }, { name: 'Кредит', amount: 300, date: '2026-09-28', delta: -2 }]), /Итого к оплате: <b>1 000 ₽<\/b>/u);

const card = renderOperationCard({ type: 'expense', amount: 250, category: 'Кафе и рестораны', date: '2026-09-28', note: 'кофе' });
assert.match(card, /Проверьте операцию/u);
assert.match(card, /−250 ₽/u);
assert.match(renderOperationCard({ type: 'income', amount: 80000, category: 'Зарплата', date: '2026-09-29', note: 'x' }, { saved: true }), /Записано[\s\S]*\+80 000 ₽/u);
assert.match(renderMenu({ name: 'Андрей', hour: 9 }), /Доброе утро, Андрей/u);
assert.match(renderMenu({ name: '<i>x</i>', hour: 9 }), /&lt;i&gt;x/u);
assert.match(renderBudgetAlert({ category: 'Еда', spent: 12000, limit: 10000, threshold: 100, period: 'month' }), /Лимит исчерпан/u);
assert.match(renderBudgetAlert({ category: 'Еда', spent: 8500, limit: 10000, threshold: 80, period: 'week' }), /Почти лимит[\s\S]*неделя/u);
assert.match(renderCreditAlert({ name: 'Кредит', wording: 'скоро', amount: 100, urgent: true }), /🚨/u);
assert.match(renderWeeklyDigest({ from: '2026-09-21', to: '2026-09-27', rows }), /🥇[^\n]*Продукты/u);

for (const text of [report, budgets, goals, credits, card]) assert.ok(text.length < 4096, 'message fits the Telegram limit');

const salaryMsg = renderSalarySummary({ myEarned: 56576, myForecast: 88384, girlEarned: 42350, girlForecast: 72450, familyForecast: 160834 });
assert.match(salaryMsg, /💰 <b>Зарплата<\/b>/u);
assert.match(salaryMsg, /Моя:[\s\S]*56 576 ₽/u);
assert.match(salaryMsg, /Девушка:[\s\S]*42 350 ₽/u);
assert.match(salaryMsg, /Общий прогноз: <b>160 834 ₽<\/b>/u);

const hourMsg = renderHourCard({ hours: 8, date: '2026-10-05', rate: 442, earned: 3536, profileName: 'Моя зарплата' });
assert.match(hourMsg, /3 536 ₽/u);
assert.match(hourMsg, /442 ₽\/час/u);

console.log('Telegram parser/security/rendering checks passed.');
