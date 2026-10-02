import { daysBetween, fromISO, todayISO } from './dates';

const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function num(v: unknown): number {
  const n = typeof v === 'string' ? Number(v.replace(/\s/g, '').replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function money(value: number, opts: { sign?: boolean; decimals?: boolean } = {}): string {
  const n = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(n);
  const body = opts.decimals || (abs % 1 !== 0 && abs < 1000) ? nf2.format(abs) : nf.format(Math.round(abs));
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${body}\u00a0₽`;
}

export function int(value: number): string {
  return nf.format(Math.round(value));
}

export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}М`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}к`;
  return String(Math.round(value));
}

export function pct(value: number, digits = 0): string {
  return `${value.toFixed(digits).replace('.', ',')}%`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function fmtDateShort(iso: string): string {
  return fromISO(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}

export function fmtDateLong(iso: string): string {
  return fromISO(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function fmtMonth(key: string): string {
  const s = fromISO(`${key}-01`).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtMonthShort(key: string): string {
  return fromISO(`${key}-01`).toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
}

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function daysWord(n: number): string {
  return `${Math.abs(n)} ${plural(n, ['день', 'дня', 'дней'])}`;
}

/** "сегодня", "завтра", "через 3 дня", "просрочено на 2 дня" */
export function relativeDays(iso: string | null | undefined, from: string = todayISO()): string {
  if (!iso) return '';
  const d = daysBetween(from, iso.slice(0, 10));
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === -1) return 'вчера';
  if (d > 0) return `через ${daysWord(d)}`;
  return `просрочено на ${daysWord(d)}`;
}

export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export function progressBar(ratio: number, width = 18): string {
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
