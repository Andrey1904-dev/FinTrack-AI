export interface QuickEntry {
  type: 'income' | 'expense';
  amount: number;
  category: string;
  note: string;
  /** section of the app the entry belongs to */
  section: 'Финансы' | 'Автомобиль';
}

const INCOME_WORDS: Record<string, string> = {
  зарплата: 'Зарплата', зп: 'Зарплата', аванс: 'Зарплата', премия: 'Премия', премию: 'Премия',
  подработка: 'Подработка', подработку: 'Подработка', доход: 'Другое',
};

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/^(бензин|топливо|заправка|азс|газпром|лукойл|роснефть|дизель|газ)/, 'Топливо'],
  [/^(продукт|еда|магазин|пятёрочка|пятерочка|магнит|перекрёсток|перекресток|лента)/, 'Продукты'],
  [/^(жиль|аренд|ипотек|квартир)/, 'Жильё'],
  [/^(коммунал|жкх|свет|вода|электричеств|отоплен)/, 'Коммунальные услуги'],
  [/^(кредит|заём|займ)/, 'Кредиты'],
  [/^(подписк|netflix|spotify|youtube|яндекс\s?плюс|ivi|кинопоиск)/, 'Подписки'],
  [/^(кино|игр|развлеч|бар|концерт|театр|кафе|ресторан)/, 'Развлечения'],
  [/^(аптек|врач|лекарств|здоров|стоматолог|анализ)/, 'Здоровье'],
  [/^(одежд|обув|куртк|кроссовк)/, 'Одежда'],
  [/^(техник|телефон|ноутбук|наушник|компьютер)/, 'Техника'],
  [/^(авто|машин|мойк|масл|шин|ремонт|запчаст|осаго|каско|тех\s?осмотр)/, 'Автомобиль'],
];

const CAR_CATEGORIES = new Set(['Топливо', 'Автомобиль']);

/** "+1200 бензин" / "1200 кофе" / "зарплата 150000" -> structured entry, or null when no amount is found. */
export function parseQuickEntry(text: string): QuickEntry | null {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return null;
  const match = raw.match(/(\d(?:[\d\s]*\d)?(?:[.,]\d{1,2})?)\s*(к|тыс|руб|₽|р)?(?=\s|$)/iu);
  if (!match) return null;
  let amount = Number(match[1].replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (match[2] && /^(к|тыс)$/i.test(match[2])) amount *= 1000;

  const rest = (raw.slice(0, match.index) + ' ' + raw.slice((match.index ?? 0) + match[0].length))
    .replace(/[+\-−]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const firstWord = rest.split(' ')[0]?.toLowerCase() ?? '';
  const incomeCategory = INCOME_WORDS[firstWord];
  if (incomeCategory) {
    return { type: 'income', amount, category: incomeCategory, note: rest, section: 'Финансы' };
  }
  let category = 'Другое';
  for (const [re, name] of CATEGORY_WORDS) {
    if (re.test(rest.toLowerCase())) {
      category = name;
      break;
    }
  }
  const note = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
  return { type: 'expense', amount, category, note, section: CAR_CATEGORIES.has(category) ? 'Автомобиль' : 'Финансы' };
}
