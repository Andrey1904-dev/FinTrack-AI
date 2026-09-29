const CATEGORY_KEYWORDS = [
  [['продукт', 'пят[её]роч', 'магнит', 'перекр[её]ст', 'вкусвилл', 'ашан', 'магазин', 'супермаркет'], 'Продукты'],
  [['такси', 'метро', 'автобус', 'трамвай', 'бензин', 'заправ', 'транспорт', 'uber', 'яндекс go'], 'Транспорт'],
  [['кафе', 'ресторан', 'кофе', 'обед', 'ужин', 'пицц', 'доставк', 'столов'], 'Кафе и рестораны'],
  [['аренд', 'жкх', 'коммун', 'квартплат', 'электричеств', 'интернет домой'], 'Жильё'],
  [['аптек', 'лекарств', 'врач', 'клиник', 'стомат', 'здоров'], 'Здоровье'],
  [['подписк', 'spotify', 'netflix', 'ivi', 'кинопоиск', 'премиум'], 'Подписки'],
  [['билайн', 'мтс', 'мегафон', 'теле2', 'связь', 'мобильн'], 'Мобильный оператор'],
  [['одежд', 'обув', 'wildberries', 'ozon', 'ламода'], 'Одежда'],
  [['зарплат', 'аванс', 'подработ', 'премия'], 'Зарплата']
];

function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function shiftISODate(iso, delta) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}
function dateFromText(text, today) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today : localISODate();
  const normalized = String(text).toLowerCase();
  if (/вчера/u.test(normalized)) return shiftISODate(base, -1);
  if (/сегодня|сейчас/u.test(normalized)) return base;
  const explicit = normalized.match(/\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2}|\d{4}))?\b/u);
  if (!explicit) return base;
  let year = explicit[3] ? Number(explicit[3]) : Number(base.slice(0, 4));
  if (year < 100) year += 2000;
  const month = Number(explicit[2]);
  const day = Number(explicit[1]);
  const candidate = new Date(Date.UTC(year, month - 1, day, 12));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return base;
  return candidate.toISOString().slice(0, 10);
}
export function parseAmount(text) {
  const withoutDates = String(text).replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/gu, ' ');
  const re = /(?<![\p{L}\d])((?:\d{1,3}(?:[\s\u00a0.,]\d{3})+|\d+)(?:[,.]\d{1,2})?)\s*(млн|миллион(?:а|ов)?|тыс(?:яч(?:и)?)?|кк|к)?(?![\p{L}])/giu;
  const matches = [...withoutDates.matchAll(re)];
  if (!matches.length) return null;
  const match = matches[matches.length - 1];
  let raw = match[1].replace(/[\s\u00a0]/gu, '');
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  const decimalPos = Math.max(lastComma, lastDot);
  if (decimalPos >= 0) {
    const tail = raw.length - decimalPos - 1;
    if (tail === 1 || tail === 2) {
      const whole = raw.slice(0, decimalPos).replace(/[.,]/gu, '');
      raw = `${whole}.${raw.slice(decimalPos + 1)}`;
    } else raw = raw.replace(/[.,]/gu, '');
  }
  let amount = Number(raw);
  const suffix = (match[2] || '').toLowerCase();
  if (/^(млн|миллион)/u.test(suffix)) amount *= 1_000_000;
  else if (/^(тыс|кк|к)/u.test(suffix)) amount *= 1_000;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000) return null;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}
function categoryFromText(text, type, profile) {
  const rules = Array.isArray(profile?.rules) ? [...profile.rules].sort((a, b) => String(b.keyword || '').length - String(a.keyword || '').length) : [];
  const matchRule = rules.find(rule => rule.keyword && (!rule.type || rule.type === type) && String(text).toLowerCase().includes(String(rule.keyword).toLowerCase()));
  let category = matchRule?.category;
  if (!category) {
    const keywords = CATEGORY_KEYWORDS.find(([words, candidate]) => candidate !== 'Зарплата' && words.some(word => new RegExp(word, 'iu').test(text)));
    category = keywords?.[1];
    if (type === 'income' && CATEGORY_KEYWORDS.find(([, candidate]) => candidate === 'Зарплата')?.[0].some(word => new RegExp(word, 'iu').test(text))) category = 'Зарплата';
  }
  const available = Array.isArray(profile?.categories?.[type]) ? profile.categories[type] : [];
  if (category && available.length && !available.includes(category)) category = null;
  return category || available[0] || (type === 'income' ? 'Другое' : 'Другое');
}
export function parseTransaction(text, options = {}) {
  const source = String(text || '').trim().slice(0, 1000);
  if (!source) return null;
  const amount = parseAmount(source);
  if (!amount) return null;
  const normalized = source.toLowerCase();
  const income = /(зарплат|доход|получил|подар|аванс|кэшбек|возврат|пополн|зачисл)/u.test(normalized);
  const type = income ? 'income' : 'expense';
  const date = dateFromText(source, options.today);
  const category = categoryFromText(normalized, type, options.profile || {});
  const note = source
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/gu, ' ')
    .replace(/(?<![\p{L}\d])(?:\d[\d\s\u00a0.,]*\d|\d)(?:\s*(?:млн|миллион(?:а|ов)?|тыс(?:яч(?:и)?)?|кк|к))?(?![\p{L}])/giu, ' ')
    .replace(/сегодня|вчера|расход|потратил\w*|купил\w*|оплатил\w*|доход|получил\w*|зарплата|аванс/giu, ' ')
    .replace(/[+−-]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, 140);
  return { type, amount, date, category, note: note || category };
}

export function formatRUB(amount) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(amount) || 0);
}
export function daysBetweenISO(from, to) {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
}
