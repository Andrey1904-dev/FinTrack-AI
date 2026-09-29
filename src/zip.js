/* ============================================================================
   zip.js — «скачать всё одним архивом» без сторонних библиотек.

   Приложение публикуется одним HTML-файлом и не тянет зависимости из сети,
   поэтому здесь свой минимальный ZIP: формат STORE (без сжатия) — читается
   любым архиватором Windows/macOS/Linux и встроен в спецификацию PKZIP.
   Сжатие не нужно: файл и так текстовый, а экономия на уровне погрешности.
   ========================================================================== */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++){
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes){
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* Дата в формате MS-DOS (архиваторы показывают её как время изменения файла) */
function dosTime(d){
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { date: date & 0xFFFF, time: time & 0xFFFF };
}

/* makeZip([{name, text}]) → Uint8Array с готовым архивом */
function makeZip(files){
  const enc = new TextEncoder();
  const now = dosTime(new Date());
  const chunks = [], central = [];
  let offset = 0;

  const u16 = (arr, v) => arr.push(v & 0xFF, (v >>> 8) & 0xFF);
  const u32 = (arr, v) => arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);

  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.text === undefined ? '' : String(f.text));
    const crc = crc32(data);

    const local = [];
    u32(local, 0x04034b50);          // подпись локального заголовка
    u16(local, 20);                  // версия для распаковки
    u16(local, 0x0800);              // имена файлов в UTF-8
    u16(local, 0);                   // метод: без сжатия
    u16(local, now.time); u16(local, now.date);
    u32(local, crc); u32(local, data.length); u32(local, data.length);
    u16(local, name.length); u16(local, 0);
    chunks.push(new Uint8Array(local), name, data);

    const cd = [];
    u32(cd, 0x02014b50);             // подпись записи центрального каталога
    u16(cd, 20); u16(cd, 20); u16(cd, 0x0800); u16(cd, 0);
    u16(cd, now.time); u16(cd, now.date);
    u32(cd, crc); u32(cd, data.length); u32(cd, data.length);
    u16(cd, name.length); u16(cd, 0); u16(cd, 0);
    u16(cd, 0); u16(cd, 0); u32(cd, 0);
    u32(cd, offset);
    central.push(new Uint8Array(cd), name);

    offset += local.length + name.length + data.length;
  });

  const centralSize = central.reduce((acc, part) => acc + part.length, 0);
  const end = [];
  u32(end, 0x06054b50);              // конец центрального каталога
  u16(end, 0); u16(end, 0);
  u16(end, files.length); u16(end, files.length);
  u32(end, centralSize); u32(end, offset);
  u16(end, 0);

  const parts = [...chunks, ...central, new Uint8Array(end)];
  const total = parts.reduce((acc, part) => acc + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach(part => { out.set(part, at); at += part.length; });
  return out;
}

/* Собирает архив со всеми данными пользователя. */
function buildBackupZip(){
  const meta = {
    app: 'FinTrack AI',
    appVersion: APP_VERSION,
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    operations: S.ops.length,
    currency: currencyCode(),
    note: 'Человекочитаемая копия: operations.json + operations.csv + profile.json'
  };
  return makeZip([
    {
      name: 'README.txt',
      text: [
        'Резервная копия FinTrack AI',
        'Экспортировано: ' + new Date().toLocaleString('ru-RU'),
        'Операций: ' + S.ops.length,
        '',
        'Файлы в архиве:',
        '  operations.csv  — операции таблицей (Excel, Google Таблицы, Numbers)',
        '  operations.json — операции в исходном виде (для восстановления)',
        '  profile.json    — бюджеты, цели, кредиты, карты, счета, категории, правила, настройки',
        '  meta.json       — сведения об экспорте',
        '',
        'Как восстановить:',
        '  1. Войдите в приложение под своим аккаунтом.',
        '  2. Данные загружаются из вашего проекта Supabase — архив нужен, если',
        '     вы удалили аккаунт, меняете проект или хотите подстраховаться.',
        '  3. Импортировать операции обратно можно через «Импорт выписки» (CSV):',
        '     колонки распознаются автоматически, дубликаты пропускаются.',
        '',
        'Храните архив в надёжном месте: в нём ваша полная финансовая история.',
      ].join('\n')
    },
    { name: 'meta.json', text: JSON.stringify(meta, null, 2) },
    { name: 'operations.csv', text: opsToCSV(S.ops) },
    { name: 'operations.json', text: JSON.stringify({ exportedAt: meta.exportedAt, operations: S.ops }, null, 2) },
    { name: 'profile.json', text: JSON.stringify(snapshotState(), null, 2) }
  ]);
}

function downloadBytes(filename, bytes, mime){
  const blob = new Blob([bytes], { type: mime || 'application/zip' });
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function'){
    throw new Error('Браузер не разрешает скачивание файлов');
  }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* «Похоже, пора сделать бэкап»: раз в 30 дней, только если есть что сохранять. */
function backupDue(){
  if (!S.ops.length) return false;
  const last = S.settings.lastBackupAt;
  if (!last) return S.ops.length >= 20;                 // не пристаём к новым аккаунтам
  const days = Math.floor((fromISO(today()) - fromISO(last)) / 86400000);
  return days >= 30;
}
function markBackupDone(){
  S.settings.lastBackupAt = today();
}
