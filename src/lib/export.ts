export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Semicolon-separated with a BOM: opens correctly in Excel (RU locale) and Numbers. */
export function toCSV<T>(rows: T[], columns: Array<Column<T>>): string {
  const lines = [columns.map(c => cell(c.header)).join(';'), ...rows.map(r => columns.map(c => cell(c.value(r))).join(';'))];
  return '\ufeff' + lines.join('\r\n');
}

export function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCSV<T>(name: string, rows: T[], columns: Array<Column<T>>): void {
  download(`${name}.csv`, toCSV(rows, columns), 'text/csv');
}

export function downloadJSON(name: string, data: unknown): void {
  download(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
}
