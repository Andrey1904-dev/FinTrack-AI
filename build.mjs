/* ============================================================================
   build.mjs — сборка: исходники из src/ склеиваются в один index.html
   ----------------------------------------------------------------------------
   Зачем: исходники разбиты на модули (их удобно читать и тестировать), а
   собранный index.html — один самодостаточный файл без внешних CDN, поэтому
   приложение работает офлайн и открывается как обычный файл.

   Запуск:  node build.mjs
   ========================================================================== */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const ORDER = [
  'src/vendor/supabase.js',
  'src/format.js',
  'src/state.js',
  'src/parse.js',
  'src/credits.js',
  'src/csv.js',
  'src/zip.js',
  'src/charts.js',
  'src/cloud.js',
  'src/ui.js',
  'src/views.js',
  'src/views2.js',
  'src/views3.js',
  'src/app.js'
];

const css = read('src/styles.css').trimEnd();
const parts = ORDER.map(f => {
  const code = read(f);
  if (/<\/script/i.test(code)) throw new Error('Файл ' + f + ' содержит </script> — нельзя инлайнить');
  return `/* ===== ${f} ===== */\n${code}`;
});
const version = read('VERSION').trim();
const js = parts.join('\n;\n');
let html = read('template.html');

const guard = (needle) => { if (!html.includes(needle)) throw new Error('В шаблоне нет метки ' + needle); };
guard('/*CSS*/'); guard('/*VENDOR*/'); guard('/*APP*/');

html = html
  .replace('/*CSS*/', () => css)
  .replace('/*VENDOR*/', () => `const APP_VERSION = '${version}';\n` + js.split('/* ===== src/format.js ===== */')[0].replace(/\/\* ===== src\/vendor\/supabase\.js ===== \*\//, ''))
  .replace('/*APP*/', () => '/* ===== src/format.js ===== */' + js.split('/* ===== src/format.js ===== */')[1])
  .replaceAll('__APP_VERSION__', read('VERSION').trim());

// маркер для тестов: сюда подменяется заглушка Supabase
html = html.replace('<script>\n/* ===== src/format.js ===== */', '<!--TEST-STUB-->\n<script>\n/* ===== src/format.js ===== */');

fs.writeFileSync(path.join(root, 'index.html'), html);

// Отдельный автономный файл демо. Флаг задаётся до запуска основного скрипта,
// поэтому файл работает и при открытии напрямую через file://.
const demoHtml = html.replace('<!--TEST-STUB-->', '<!--TEST-STUB--><script>window.__FINTRACK_DEMO__ = true;</script>');
fs.writeFileSync(path.join(root, 'FinTrack-AI-demo.html'), demoHtml);

const kb = n => (n / 1024).toFixed(0) + ' КБ';
console.log('index.html собран:');
console.log('  всего      ', kb(Buffer.byteLength(html)));
console.log('  из них CSS ', kb(Buffer.byteLength(css)));
console.log('  из них JS  ', kb(Buffer.byteLength(js)));
console.log('  модулей    ', ORDER.length);
