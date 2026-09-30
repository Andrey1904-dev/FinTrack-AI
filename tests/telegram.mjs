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
console.log('Telegram parser/security utility checks passed.');
