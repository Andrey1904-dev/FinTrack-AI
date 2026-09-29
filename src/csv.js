/* ============================================================================
   csv.js — экспорт и импорт, в том числе выписок из банка
   Импорт: пользователь загружает CSV любого банка, приложение само предлагает
   сопоставление колонок, показывает предпросмотр и раскладывает строки по
   категориям (по правилам и словарю синонимов).
   ========================================================================== */

function csvCell(v, delim){
  const s = String(v === null || v === undefined ? '' : v);
  return /["\n\r]|;|,|\t/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function opsToCSV(ops, delim){
  const d = delim || ';';
  const head = ['Дата', 'Тип', 'Категория', 'Сумма', 'Описание', 'Счёт'];
  const rows = ops.map(o => [
    o.date, o.type === 'income' ? 'Доход' : 'Расход', o.category,
    plain(o.amount, 2).replace(/\s/g, ''),                                  // суммы всегда в рублях
    o.note,
    (S.accounts.find(a => a.id === o.accountId) || {}).name || ''
  ]);
  return '\ufeff' + [head, ...rows].map(r => r.map(c => csvCell(c, d)).join(d)).join('\r\n') + '\r\n';
}
function foreignSeen(){ return [...FOREIGN_SEEN]; }

function parseCSV(text, delim){
  const t = String(text).replace(/^\ufeff/, '');
  let d = delim;
  if (!d){
    const sample = t.slice(0, 4000);
    const counts = [';', '\t', ',', '|'].map(x => ({ x, n: (sample.match(new RegExp('\\' + x, 'g')) || []).length }));
    d = counts.sort((a, b) => b.n - a.n)[0].x;
  }
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++){
    const c = t[i];
    if (q){
      if (c === '"'){ if (t[i + 1] === '"'){ cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === d){ row.push(cell); cell = ''; }
    else if (c === '\n'){ row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r'){ /* пропускаем */ }
    else cell += c;
  }
  if (cell.length || row.length){ row.push(cell); rows.push(row); }
  return { delim: d, rows: rows.filter(r => r.some(c => String(c).trim() !== '')) };
}
/* Символы других валют в выписках: приложение ведёт учёт только в рублях,
   поэтому такие символы просто убираются из описания, а сумма берётся как есть.
   Список ведём ради предупреждения в предпросмотре импорта. */
const FOREIGN_SIGNS = [['zł', 'злотый'], ['zl', 'злотый'], ['pln', 'злотый'], ['€', 'евро'], ['eur', 'евро'],
  ['$', 'доллар'], ['usd', 'доллар'], ['₴', 'гривна'], ['uah', 'гривна'], ['₸', 'тенге'], ['kzt', 'тенге']];
function foreignMarksIn(text){
  const t = String(text || '').toLowerCase();
  return FOREIGN_SIGNS.filter(([sign]) => t.includes(sign)).map(([, title]) => title);
}
/* «Biedronka zakupy 42,50 zł» → «Biedronka zakupy 42,50» */
function stripForeignSigns(text){
  let t = String(text || '');
  FOREIGN_SIGNS.forEach(([sign]) => { t = t.split(sign).join(' '); });
  FOREIGN_SIGNS.forEach(([sign]) => { t = t.split(sign.toUpperCase()).join(' '); });
  return t.replace(/\s+/g, ' ').trim();
}
const RE_CURRENCY = /(валюта|currency|walut)/i,
      RE_DATE = /(дата|date|операц|data)/i, RE_AMOUNT = /(сумм|amount|kwota|стоим|количество|оборот)/i,
      RE_DEBIT = /(списан|debit|расход|wypłat|обремен)/i, RE_CREDIT = /(зачисл|credit|поступ|доход|wpłat)/i,
      RE_DESC = /(описан|назначен|коммент|desc|детал|merchant|получател|контрагент|наименован|miejsce|tytuł|title)/i,
      RE_TYPE = /(тип|type|вид|kind|категория|category)/i;
function detectMapping(rows){
  const header = (rows[0] || []).map(c => String(c));
  const hasHeader = header.some(c => RE_DATE.test(c) || RE_AMOUNT.test(c) || RE_DESC.test(c));
  const cols = hasHeader ? header : header.map((_, i) => 'Колонка ' + (i + 1));
  const find = re => cols.findIndex(c => re.test(c));
  let amount = find(RE_AMOUNT);
  const debit = find(RE_DEBIT), credit = find(RE_CREDIT);
  if (amount < 0 && debit >= 0 && credit >= 0) amount = -1; // отдельные колонки приход/расход
  const m = {
    hasHeader, date: find(RE_DATE), amount,
    debit: amount < 0 ? debit : -1, credit: amount < 0 ? credit : -1,
    desc: find(RE_DESC), type: find(RE_TYPE), currency: find(RE_CURRENCY),   // колонка валюты нам нужна только чтобы её игнорировать
    negativeIsExpense: true, delimiter: ';'
  };
  if (m.date < 0){ const i = rows.findIndex(r => r.findIndex(c => parseLooseDate(c)) >= 0); if (i >= 0) m.date = rows[i].findIndex(c => parseLooseDate(c)); }
  if (m.amount < 0 && m.debit < 0){ const i = rows.findIndex(r => r.findIndex(c => parseAmount(c) !== null) >= 0); if (i >= 0) m.amount = rows[i].findIndex(c => parseAmount(c) !== null); }
  if (m.desc < 0){ const used = new Set([m.date, m.amount, m.debit, m.credit]); for (let i = 0; i < cols.length; i++) if (!used.has(i)){ m.desc = i; break; } }
  return m;
}
function parseLooseDate(v){
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})/);
  if (m){ const y = Number(m[3].length === 2 ? '20' + m[3] : m[3]); return y + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1])); }
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (m) return fromISO(today()).getFullYear() + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[1]));
  return null;
}
/* Символы других валют, встреченные при последнем импорте: предпросмотр
   показывает по ним предупреждение. */
const FOREIGN_SEEN = new Set();
function rowsToOps(rows, m){
  FOREIGN_SEEN.clear();
  const out = [];
  const start = m.hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++){
    const r = rows[i];
    const date = parseLooseDate(r[m.date]);
    let amount = null, type = null;
    if (m.amount >= 0 && m.amount !== undefined){
      const raw = String(r[m.amount] || '').replace(/\s/g, '').replace(/[^\d,.\-+−]/g, '').replace('−', '-');
      const digits = raw.match(/-?\d+(?:[.,]\d+)?/);
      amount = digits ? parseFloat(digits[0].replace(',', '.')) : null;
      if (amount !== null && amount < 0){ type = m.negativeIsExpense ? 'expense' : 'income'; amount = Math.abs(amount); }
    } else {
      const d = parseAmount(r[m.debit]), c = parseAmount(r[m.credit]);
      if (d) { amount = d; type = 'expense'; } else if (c) { amount = c; type = 'income'; }
    }
    if (amount === null || !amount || !date) continue;
    // В выписке может стоять «zł», «€», «$» — символ убираем из описания,
    // потому что учёт ведётся в рублях, а сумму переносим как есть.
    const rawDesc = String(r[m.desc] === undefined ? '' : r[m.desc]);
    if (m.currency >= 0) foreignMarksIn(String(r[m.currency] || '')).forEach(k => FOREIGN_SEEN.add(k));
    foreignMarksIn(rawDesc).forEach(k => FOREIGN_SEEN.add(k));
    const desc = stripForeignSigns(rawDesc).replace(/\s+/g, ' ').trim().slice(0, 200);
    amount = round2(amount);
    if (!type){
      const t = String(m.type >= 0 ? r[m.type] : '').toLowerCase();
      if (/доход|поступ|зачисл|income|credit|wpłat/.test(t)) type = 'income'; else type = 'expense';
      if (!m.type || m.type < 0){
        const hint = parseTypeHint(desc);
        if (hint) type = hint;
      }
    }
    const guess = guessCategory(desc, type);
    out.push(normalizeOperation({
      id: uid('imp'), type, amount, category: guess.category, note: desc || 'Импорт', date, source: 'csv'
    }));
  }
  return out;
}
function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function readFileText(file){
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('Не удалось прочитать файл'));
    r.readAsText(file, 'utf-8');
  });
}
