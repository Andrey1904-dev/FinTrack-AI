/* ============================================================================
   parse.js — «умное распознавание» текста (честная версия, без магии LLM)
   Разбирает «пятёрочка 1200 вчера», «билайн 900», «зарплата 80к», «кофе 12,50».
   Понимает синонимы магазинов/операторов, относительные даты и правила
   пользователя (правило = ключевое слово → категория).
   ========================================================================== */

const KEYWORDS = {
  'Продукты': ['продукт', 'пятёрочка', 'пятерочка', 'магнит', 'лента', 'ашан', 'дикси', 'перекресток', 'перекрёсток', 'вкусвилл', 'самокат', 'окей', 'o key', 'метро кэш', 'молоко', 'хлеб', 'овощ', 'мясо', 'фрукт', 'biedronka', 'żabka', 'zabka', 'lidl', 'kaufland', 'carrefour', 'auchan', 'auchan', 'netto', 'dino', 'produce'],
  'Кафе и рестораны': ['кафе', 'кофе', 'coffee', 'ресторан', 'макдональдс', 'mcdonald', 'kfc', 'бургер', 'пицца', 'суши', 'обед', 'столовая', 'чай', 'бар', 'kawa', 'restauracja', 'shawarma', 'шаурма', 'food'],
  'Транспорт': ['такси', 'taxi', 'uber', 'bolt', 'метро', 'автобус', 'трамвай', 'бензин', 'заправка', 'азс', 'проезд', 'каршеринг', 'билет', 'orlen', 'shell', 'bp ', 'парковка', 'p+r'],
  'Жильё': ['аренда', 'квартира', 'жилье', 'жильё', 'ипотека', 'коммунал', 'электричеств', 'вода', 'газ ', 'отопление', 'czynsz', 'rent', 'аренд'],
  'Связь': ['связь', 'интернет', 'вайфай', 'wifi', 'домашний интернет', 'тв', 'телевидение'],
  'Мобильный оператор': ['билайн', 'beeline', 'мтс', 'mts', 'мегафон', 'megafon', 'теле2', 'tele2', 'йота', 'yota', 'смарт', 'мобильн', 'оператор', 'пополнил телефон', 'play', 'orange', 'plus', 't-mobile', 't mobile'],
  'Здоровье': ['аптека', 'аптек', 'лекарств', 'врач', 'клиника', 'стоматолог', 'анализ', 'медицин', 'apteka', 'лечение', 'больниц'],
  'Покупки': ['ozon', 'озон', 'wildberries', 'вайлдберриз', 'aliexpress', 'amazon', 'маркет', 'покупка', 'магазин', 'одежд', 'обувь', 'техника', 'аллегро', 'allegro', 'zara', 'h&m', 'ноутбук', 'телефон купил'],
  'Развлечения': ['кино', 'концерт', 'театр', 'игра', 'steam', 'netflix', 'spotify', 'youtube premium', 'подписка youtube', 'боулинг', 'развлеч', 'kino', 'game'],
  'Подписки': ['подписка', 'subscription', 'netflix', 'spotify', 'apple', 'icloud', 'google one', 'яндекс плюс', 'yandex plus', 'chatgpt', 'openai', 'подписку'],
  'Образование': ['курс', 'обучение', 'книга', 'учебник', 'школа', 'университет', 'udemy', 'coursera', 'вебинар', 'курсы'],
  'Кредиты': ['кредит', 'платеж по кредиту', 'платёж по кредиту', 'кредитка', 'card pay', 'ипотека платеж', 'займ'],
  'Путешествия': ['отель', 'hotel', 'booking', 'авиабилет', 'билеты самолет', 'поезд', 'отпуск', 'тур', 'airbnb', 'visa fee'],
  'Дети': ['детский', 'садик', 'детсад', 'ребенок', 'ребёнок', 'школьн', 'игрушк', 'подгузник'],
  'Питомцы': ['корм', 'ветеринар', 'vet', 'кот', 'собака', 'питомец', 'зоомагазин'],
  'Зарплата': ['зарплат', 'зарплата', 'salary', 'аванс', 'получил зарплату'],
  'Подработка': ['подработк', 'фриланс', 'freelance', 'халтур', 'заказ оплатили', 'гонорар'],
  'Подарки': ['подарок', 'подарили', 'gift'],
  'Возврат': ['возврат', 'вернули', 'refund', 'кэшбэк', 'кешбек', 'cashback', 'компенсац'],
  'Продажа': ['продал', 'продажа', 'продала', 'оликс', 'olx', 'avito', 'авито'],
  'Проценты': ['процент по вкладу', 'вклад', 'начислены проценты'],
  'Инвестиции': ['дивиденд', 'инвестиц', 'акции', 'облигац', 'фонд']
};
const INCOME_HINTS = ['зарплат', 'получил', 'получила', 'пришло', 'зачислили', 'доход', 'перевели мне', 'вернули', 'кэшбэк', 'кешбек', 'cashback', 'дивиденд', 'продал', 'продала', 'аванс', 'гонорар', 'зарплата'];
const EXPENSE_HINTS = ['купил', 'купила', 'потратил', 'потратила', 'заплатил', 'заплатила', 'оплатил', 'оплатила', 'списали', 'расход'];
const MONTH_NAMES = { 'январ': 0, 'феврал': 1, 'март': 2, 'апрел': 3, 'ма': 4, 'июн': 5, 'июл': 6, 'август': 7, 'сентябр': 8, 'октябр': 9, 'ноябр': 10, 'декабр': 11 };

function matchKeyword(text, list){ const t = ' ' + text + ' '; return list.find(k => t.includes(k)); }

function applyRules(text, type){
  const t = text.toLowerCase();
  const rules = (S.rules || []).filter(r => r.type === type);
  for (const r of rules) if (t.includes(r.keyword)) return r;
  return null;
}
function guessCategory(text, type){
  const t = text.toLowerCase();
  const exact = categoryOptions(type).find(c => t.includes(c.toLowerCase()));
  if (exact) return { category: exact, why: 'категория из текста' };
  const rule = applyRules(text, type);
  if (rule) return { category: rule.category, why: 'правило «' + rule.keyword + '»' };
  const table = type === 'income' ? ['Зарплата', 'Подработка', 'Подарки', 'Продажа', 'Возврат', 'Проценты', 'Инвестиции'] : Object.keys(KEYWORDS);
  for (const cat of table){
    const keys = KEYWORDS[cat]; if (!keys) continue;
    if (type === 'income' && !S.categorySets.income.includes(cat)) continue;
    if (type === 'expense' && !S.categorySets.expense.includes(cat)) continue;
    const hit = matchKeyword(t, keys);
    if (hit) return { category: cat, why: 'похоже на «' + hit + '»' };
  }
  return { category: type === 'income' ? 'Другое' : 'Другое', why: '' };
}
function parseDateHint(text){
  const t = text.toLowerCase(), now = fromISO(today());
  // границы слов задаём вручную: \b в JS не понимает кириллицу
  const word = w => new RegExp('(^|[^а-яёa-z])' + w + '([^а-яёa-z]|$)', 'i');
  if (word('позавчера').test(t)) return addDaysISO(today(), -2);
  if (word('вчера').test(t)) return addDaysISO(today(), -1);
  if (word('сегодня').test(t)) return today();
  if (word('завтра').test(t)) return addDaysISO(today(), 1);
  const dmy = t.match(/\b(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?\b/);
  if (dmy){
    const y = dmy[3] ? (dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])) : now.getFullYear();
    const iso = y + '-' + pad2(Number(dmy[2])) + '-' + pad2(Number(dmy[1]));
    if (isValidISO(iso)) return iso;
  }
  const dm = t.match(/\b(\d{1,2})\s+([а-яё]+)/);
  if (dm){
    const m = Object.keys(MONTH_NAMES).find(k => dm[2].startsWith(k));
    if (m !== undefined){
      const iso = now.getFullYear() + '-' + pad2(MONTH_NAMES[m] + 1) + '-' + pad2(Number(dm[1]));
      if (isValidISO(iso)) return iso;
    }
  }
  return null;
}
function parseTypeHint(text){
  const t = text.toLowerCase();
  if (matchKeyword(t, EXPENSE_HINTS)) return 'expense';
  if (matchKeyword(t, INCOME_HINTS)) return 'income';
  const incomeWord = S.categorySets.income.find(c => t.includes(c.toLowerCase()));
  return incomeWord ? 'income' : null;
}
function guessAmount(text){
  let cleaned = String(text);
  cleaned = cleaned.replace(/(\d{1,2})[.\-/](\d{1,2})([.\-/]\d{2,4})?/g, ' ');                       // даты вида 12.09
  cleaned = cleaned.replace(/(\d{1,2})\s+(январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-яё]*/gi, ' '); // «12 сентября»
  cleaned = cleaned.replace(/\d{1,2}:\d{2}/g, ' ');                                                    // время 12:30
  const num = '(-?\\d[\\d\\s\\u00a0]*(?:[.,]\\d+)?)';
  const unit = '(к|k|тыс|тысяч|млн|m)';
  const withUnit = new RegExp(num + '\\s*' + unit + '(?![а-яёa-z0-9])', 'gi');
  const plain = new RegExp(num + '(?![\\d.,])', 'g');
  const candidates = [];
  let m;
  while ((m = withUnit.exec(cleaned)) !== null){
    const v = parseAmount(m[1].trim() + m[2]);
    if (v !== null) candidates.push(v);
  }
  if (!candidates.length){
    while ((m = plain.exec(cleaned)) !== null){
      const v = parseAmount(m[1].trim());
      if (v !== null) candidates.push(v);
    }
  }
  if (!candidates.length) return null;
  return Math.max.apply(null, candidates);   // «2 кофе 300» → 300, «1200 вчера» → 1200
}
/* Основная функция: текст -> черновик операции */
function smartParse(text){
  const raw = String(text || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  let type = parseTypeHint(raw) || 'expense';
  const expected = guessCategory(raw, type);
  // если категория нашлась только в «расходных» словах, а тип income — попробуем наоборот
  if (type === 'income' && expected.category === 'Другое'){
    const alt = guessCategory(raw, 'expense');
    if (alt.category !== 'Другое'){ type = 'expense'; }
  }
  const cat = guessCategory(raw, type);
  const amount = guessAmount(raw);
  const date = parseDateHint(raw) || today();
  let confidence = 0;
  if (amount) confidence += 0.45;
  if (cat.category !== 'Другое') confidence += 0.3;
  if (cat.why.startsWith('правило')) confidence += 0.1;
  if (parseTypeHint(raw)) confidence += 0.1;
  if (parseDateHint(raw)) confidence += 0.05;
  const note = raw.replace(/\s+/g, ' ').slice(0, 120);
  return {
    type, amount: amount === null ? null : amount, category: cat.category, date, note,
    why: cat.why, confidence: Math.min(1, round2(confidence))
  };
}
/* Ключевое слово для правила: самое «смысловое» слово текста, кроме цифр и стоп-слов */
const STOP_WORDS = new Set(['купил', 'купила', 'потратил', 'потратила', 'заплатил', 'заплатила', 'оплатил', 'оплатила', 'за', 'на', 'в', 'и', 'с', 'по', 'до', 'от', 'вчера', 'сегодня', 'завтра', 'руб', 'рублей', 'zł', 'шт', 'грн']);
function ruleKeywordFrom(text){
  const words = String(text).toLowerCase().replace(/[^a-zа-яё0-9\s]/gi, ' ').split(/\s+/)
    .filter(w => w && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  return (words.sort((a, b) => b.length - a.length)[0] || '').slice(0, 24);
}
function learnRuleFrom(text, category, type){
  const keyword = ruleKeywordFrom(text);
  if (!keyword) return null;
  const exists = S.rules.find(r => r.keyword === keyword);
  if (exists){ exists.category = category; exists.type = type; }
  else S.rules.push({ id: uid('rl'), keyword, category, type });
  saveProfileToCloud();
  return keyword;
}
