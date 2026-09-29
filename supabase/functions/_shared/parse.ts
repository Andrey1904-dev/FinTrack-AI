/* ============================================================================
   _shared/parse.ts — разбор текста операции: словарь, суммы, даты
   Порт src/parse.js из приложения: у сайта и бота одни категории и одни
   правила, поэтому «билайн 900» попадает в «Мобильный оператор» и там, и там.
   Словарь — фолбэк: он работает даже без ключа AI_API_KEY.
   ========================================================================== */

export type Parsed = {
  type: 'income' | 'expense';
  amount: number | null;
  category: string;
  date: string;          // YYYY-MM-DD
  note: string;
  why: string;
  confidence: number;
};

export type Rule = { id: string; keyword: string; category: string; type: 'income' | 'expense' };

export const KEYWORDS: Record<string, string[]> = {
  'Продукты': ['продукт', 'пятёрочка', 'пятерочка', 'магнит', 'лента', 'ашан', 'дикси', 'перекресток', 'перекрёсток', 'вкусвилл', 'самокат', 'молоко', 'хлеб', 'овощ', 'мясо', 'фрукт', 'biedronka', 'żabka', 'zabka', 'lidl', 'kaufland', 'carrefour', 'auchan', 'netto', 'dino'],
  'Кафе и рестораны': ['кафе', 'кофе', 'coffee', 'ресторан', 'макдональдс', 'mcdonald', 'kfc', 'бургер', 'пицца', 'суши', 'обед', 'столовая', 'чай', 'бар', 'kawa', 'шаурма', 'food'],
  'Транспорт': ['такси', 'taxi', 'uber', 'bolt', 'метро', 'автобус', 'трамвай', 'бензин', 'заправка', 'азс', 'проезд', 'каршеринг', 'билет', 'orlen', 'shell', 'парковка'],
  'Жильё': ['аренда', 'квартира', 'жилье', 'жильё', 'ипотека', 'коммунал', 'электричеств', 'вода', 'отопление', 'czynsz', 'rent'],
  'Связь': ['связь', 'интернет', 'вайфай', 'wifi', 'домашний интернет', 'телевидение'],
  'Мобильный оператор': ['билайн', 'beeline', 'мтс', 'mts', 'мегафон', 'megafon', 'теле2', 'tele2', 'йота', 'yota', 'смарт', 'мобильн', 'оператор', 'пополнил телефон', 'play', 'orange', 'plus', 't-mobile', 't mobile'],
  'Здоровье': ['аптека', 'аптек', 'лекарств', 'врач', 'клиника', 'стоматолог', 'анализ', 'медицин', 'apteka', 'лечение'],
  'Покупки': ['ozon', 'озон', 'wildberries', 'вайлдберриз', 'aliexpress', 'amazon', 'маркет', 'покупка', 'магазин', 'одежд', 'обувь', 'техника', 'аллегро', 'allegro', 'zara', 'h&m', 'ноутбук'],
  'Развлечения': ['кино', 'концерт', 'театр', 'игра', 'steam', 'netflix', 'spotify', 'боулинг', 'развлеч', 'kino', 'game'],
  'Подписки': ['подписка', 'subscription', 'icloud', 'google one', 'яндекс плюс', 'chatgpt', 'openai'],
  'Образование': ['курс', 'обучение', 'книга', 'учебник', 'школа', 'университет', 'udemy', 'coursera'],
  'Кредиты': ['кредит', 'платеж по кредиту', 'платёж по кредиту', 'кредитка', 'займ'],
  'Путешествия': ['отель', 'hotel', 'booking', 'авиабилет', 'поезд', 'отпуск', 'тур', 'airbnb'],
  'Дети': ['детский', 'садик', 'ребенок', 'ребёнок', 'школьн', 'игрушк', 'подгузник'],
  'Питомцы': ['корм', 'ветеринар', 'vet', 'кот', 'собака', 'питомец', 'зоомагазин'],
  'Зарплата': ['зарплат', 'salary', 'аванс', 'получил зарплату'],
  'Подработка': ['подработк', 'фриланс', 'freelance', 'халтур', 'гонорар'],
  'Подарки': ['подарок', 'подарили', 'gift'],
  'Возврат': ['возврат', 'вернули', 'refund', 'кэшбэк', 'кешбек', 'cashback', 'компенсац'],
  'Продажа': ['продал', 'продажа', 'продала', 'olx', 'avito', 'авито'],
  'Проценты': ['процент по вкладу', 'вклад', 'начислены проценты'],
  'Инвестиции': ['дивиденд', 'инвестиц', 'акции', 'облигац', 'фонд'],
};

const INCOME_HINTS = ['зарплат', 'получил', 'получила', 'пришло', 'зачислили', 'доход', 'перевели мне', 'вернули', 'кэшбэк', 'кешбек', 'cashback', 'дивиденд', 'продал', 'продала', 'аванс', 'гонорар'];
const EXPENSE_HINTS = ['купил', 'купила', 'потратил', 'потратила', 'заплатил', 'заплатила', 'оплатил', 'оплатила', 'списали', 'расход'];
const MONTH_NAMES: Record<string, number> = { 'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма': 4, 'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11 };

export function round2(v: number): number { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
export function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
export function pad2(n: number): string { return String(n).padStart(2, '0'); }
export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n, 12);
  return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
}
export function isValidISO(iso: unknown): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '').slice(0, 10));
}

export function parseAmount(text: string): number | null {
  const s = String(text).replace(/\u00a0/g, ' ').replace(/(\d)\s+(?=\d)/g, '$1');
  const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(к|k|тыс|тысяч|млн|m)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'к' || unit === 'k' || unit === 'тыс' || unit === 'тысяч') v *= 1000;
  if (unit === 'млн' || unit === 'm') v *= 1e6;
  return round2(Math.abs(v));
}

function matchKeyword(text: string, list: string[]): string | undefined {
  const t = ' ' + text + ' ';
  return list.find(k => t.includes(k));
}

export function parseDateHint(text: string, today: string): string | null {
  const t = text.toLowerCase();
  const word = (w: string) => new RegExp('(^|[^а-яёa-z])' + w + '([^а-яёa-z]|$)', 'i');
  if (word('позавчера').test(t)) return addDaysISO(today, -2);
  if (word('вчера').test(t)) return addDaysISO(today, -1);
  if (word('сегодня').test(t)) return today;
  const dmy = t.match(/(?:^|\s)(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?(?:\s|$|[^\d])/);
  if (dmy) {
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : Number(today.slice(0, 4));
    const iso = y + '-' + pad2(Number(dmy[2])) + '-' + pad2(Number(dmy[1]));
    if (isValidISO(iso)) return iso;
  }
  return null;
}

function parseTypeHint(text: string): 'income' | 'expense' | null {
  const t = text.toLowerCase();
  if (matchKeyword(t, EXPENSE_HINTS)) return 'expense';
  if (matchKeyword(t, INCOME_HINTS)) return 'income';
  return null;
}

export function guessCategory(text: string, type: 'income' | 'expense', categories: { expense: string[]; income: string[] }, rules: Rule[]): { category: string; why: string } {
  const t = text.toLowerCase();
  const list = type === 'income' ? categories.income : categories.expense;
  const exact = (list || []).find(c => t.includes(c.toLowerCase()));
  if (exact) return { category: exact, why: 'категория из текста' };
  const rule = (rules || []).find(r => r.type === type && t.includes(r.keyword.toLowerCase()));
  if (rule) return { category: rule.category, why: 'правило «' + rule.keyword + '»' };
  for (const [cat, keys] of Object.entries(KEYWORDS)) {
    if (!(list || []).includes(cat)) continue;
    const hit = matchKeyword(t, keys);
    if (hit) return { category: cat, why: 'похоже на «' + hit + '»' };
  }
  return { category: 'Другое', why: '' };
}

/* Основной разбор: текст -> черновик операции (как smartParse в приложении) */
export function smartParse(text: string, categories: { expense: string[]; income: string[] }, rules: Rule[], today: string): Parsed {
  const raw = String(text || '').trim();
  let type = parseTypeHint(raw) || 'expense';
  let cat = guessCategory(raw, type, categories, rules);
  if (type === 'income' && cat.category === 'Другое') {
    const alt = guessCategory(raw, 'expense', categories, rules);
    if (alt.category !== 'Другое') { type = 'expense'; cat = alt; }
  }
  const amount = parseAmount(raw.replace(/(\d{1,2})[.\-/](\d{1,2})([.\-/]\d{2,4})?/g, ' '));
  const date = parseDateHint(raw, today) || today;
  let confidence = 0;
  if (amount) confidence += 0.5;
  if (cat.category !== 'Другое') confidence += 0.35;
  if (parseTypeHint(raw)) confidence += 0.1;
  if (parseDateHint(raw, today)) confidence += 0.05;
  return {
    type,
    amount,
    category: cat.category,
    date,
    note: raw.replace(/\s+/g, ' ').slice(0, 120),
    why: cat.why,
    confidence: Math.min(1, round2(confidence)),
  };
}

/* Модель отвечает JSON — проверяем каждое поле, чужую категорию и «выдуманную»
   сумму отбрасываем (сумма обязана быть конечным неотрицательным числом). */
export function sanitizeModelReply(d: any, categories: { expense: string[]; income: string[] }, today: string): Parsed {
  const type: 'income' | 'expense' = d?.type === 'income' ? 'income' : 'expense';
  const list = type === 'income' ? categories.income : categories.expense;
  const category = (list || []).includes(d?.category) ? d.category : 'Другое';
  let amount: number | null = null;
  const raw = Number(d?.amount);
  if (d?.amount !== null && d?.amount !== undefined && Number.isFinite(raw) && raw >= 0) amount = round2(raw);
  return {
    type,
    amount,
    category,
    date: isValidISO(d?.date) ? String(d.date).slice(0, 10) : today,
    note: String(d?.note || '').slice(0, 140),
    why: 'LLM',
    confidence: Math.min(1, Math.max(0, num(d?.confidence) || 0.8)),
  };
}
