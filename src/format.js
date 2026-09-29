/* ============================================================================
   format.js — деньги, даты, числа
   Здесь исправлены два старых бага:
     1) даты больше не «уезжают» из-за UTC (toISOString() сдвигал день до 03:00);
     2) суммы округляются до копеек и складываются через sumMoney(), чтобы
        не накапливать ошибки плавающей точки (0.1 + 0.2).
   ========================================================================== */

/* Валюта одна — рубль. Раньше здесь был список из шести валют и курсы,
   но приложение ведёт учёт в рублях, поэтому лишние варианты убраны:
   так невозможно случайно записать сумму «в евро», которая потом смешается
   с рублями в итогах. Если в выписке встретится «zł», «€» или «$» — символ
   убирается из описания, а сумма попадает в рублях как есть. */
const CURRENCY = { code: 'RUB', symbol: '₽', title: 'Рубль' };

function num(v){ const n = Number(v); return Number.isFinite(n) ? n : 0; }
function round2(v){ return Math.round((num(v) + Number.EPSILON) * 100) / 100; }
function sumMoney(list, pick){ let acc = 0; for (const x of list) acc += Math.round(num(pick ? pick(x) : x) * 100); return acc / 100; }

function currency(){ return CURRENCY; }
function currencyCode(){ return CURRENCY.code; }
function money(v, opts){
  const n = round2(v);
  const sign = n < 0 ? '−' : '';
  const body = Math.abs(n).toLocaleString('ru-RU', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const cur = currency();
  return sign + body + ' ' + ((opts && opts.code) ? cur.code : cur.symbol);
}
function moneyShort(v){
  const n = Math.abs(round2(v)), s = n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' млн'
    : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + ' тыс.' : null;
  return s ? (v < 0 ? '−' : '') + s : money(v);
}
function plain(v, frac){ const n = round2(v); return n.toLocaleString('ru-RU', { minimumFractionDigits: frac || 0, maximumFractionDigits: frac === undefined ? 2 : frac }); }
function percent(part, total, frac){ const t = num(total); return !t ? '0%' : (num(part) / t * 100).toFixed(frac === undefined ? 0 : frac) + '%'; }

/* разбор суммы из текста: «1 200,50», «1,2к», «3k», «12 000 руб» */
function parseAmount(text){
  const s = String(text).replace(/\u00a0/g, ' ').replace(/(\d)\s+(?=\d)/g, '$1'); // «1 200» -> «1200»
  const m = s.match(/(-?\d+(?:[.,]\d+)?)\s*(к|k|тыс|тысяч|млн|m)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'к' || unit === 'k' || unit === 'тыс' || unit === 'тысяч') v *= 1000;
  if (unit === 'млн' || unit === 'm') v *= 1e6;
  return round2(Math.abs(v));
}

/* ---------- даты: всё локальное, без UTC ---------- */
function pad2(n){ return String(n).padStart(2, '0'); }
function toISO(d){ return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function today(){ return toISO(new Date()); }
function fromISO(iso){ const p = String(iso || '').slice(0, 10).split('-').map(Number); return new Date(p[0] || 1970, (p[1] || 1) - 1, p[2] || 1, 12, 0, 0); }
function isValidISO(iso){ return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '').slice(0, 10)); }
function monthKey(iso){ return String(iso || '').slice(0, 7); }
function thisMonthKey(){ return monthKey(today()); }
function addMonthsISO(iso, n){
  const d = isValidISO(iso) ? fromISO(iso) : fromISO(today());
  const day = d.getDate(), shifted = new Date(d.getFullYear(), d.getMonth() + n, 1, 12);
  const last = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(day, last));
  return toISO(shifted);
}
function addDaysISO(iso, n){ const d = isValidISO(iso) ? fromISO(iso) : fromISO(today()); d.setDate(d.getDate() + n); return toISO(d); }
function daysUntil(iso){ if (!isValidISO(iso)) return null; const a = fromISO(today()), b = fromISO(iso); return Math.round((b - a) / 86400000); }
function fmtDate(iso){ return isValidISO(iso) ? fromISO(iso).toLocaleDateString('ru-RU') : '—'; }
function fmtDateLong(iso){ return isValidISO(iso) ? fromISO(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; }
function fmtDateShort(iso){ return isValidISO(iso) ? fromISO(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }) : '—'; }
function fmtMonth(key){ if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return '—'; const d = fromISO(key + '-01'); return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }); }
function fmtMonthShort(key){ if (!/^\d{4}-\d{2}$/.test(String(key || ''))) return '—'; return fromISO(key + '-01').toLocaleDateString('ru-RU', { month: 'short' }).replace('.', ''); }
function monthRangeBack(count, from){ const base = from ? fromISO(from) : new Date(); const out = []; for (let i = count - 1; i >= 0; i--){ const d = new Date(base.getFullYear(), base.getMonth() - i, 1, 12); out.push(d.getFullYear() + '-' + pad2(d.getMonth() + 1)); } return out; }
function daysInMonth(key){ const d = fromISO(key + '-01'); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); }
function relDays(iso){ const n = daysUntil(iso); if (n === null) return '—'; if (n === 0) return 'сегодня'; if (n === 1) return 'завтра'; if (n === -1) return 'вчера'; return n > 0 ? 'через ' + n + ' дн.' : n + ' дн. назад'; }

function plural(n, one, few, many){ const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; }

function uid(prefix){ return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }
function clamp(v, a, b){ return Math.min(b, Math.max(a, num(v))); }
function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function escapeHtml(v){
  return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(v){ return escapeHtml(v).replace(/`/g, '&#96;'); }
