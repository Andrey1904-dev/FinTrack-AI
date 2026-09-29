#!/usr/bin/env node
/* ============================================================================
   tests/e2e-browser.mjs — сквозные проверки в настоящем Chrome (puppeteer).
   Сервер со статикой должен отвечать на http://localhost:8090
   (тест поднимает его сам, если порта нет).

   Запуск: node tests/e2e-browser.mjs
   Если Chrome не установлен — тест честно пропускается (exit 0).
   ========================================================================== */
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8090;
const BASE = 'http://localhost:' + PORT;

let puppeteer = null;
try { puppeteer = (await import('puppeteer')).default; } catch (_e) { /* нет пакета */ }
if (!puppeteer) { console.log('e2e: puppeteer не установлен — пропуск (npm i puppeteer)'); process.exit(0); }

let passed = 0;
const failures = [];
function T(name, cond, extra) {
  if (cond) passed++;
  else { failures.push(name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); console.error('  ✗ ' + name + (extra ? ' — ' + String(extra).slice(0, 200) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- статический сервер, если ещё не запущен ---------- */
async function portOpen() {
  try {
    const res = await fetch(BASE + '/index.html', { method: 'HEAD' });
    return res.ok;
  } catch (_e) { return false; }
}
let serverProc = null;
if (!(await portOpen())) {
  serverProc = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await portOpen()); i++) await sleep(250);
}

/* ---------- браузер ---------- */
let browser;
try {
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
} catch (e) {
  console.log('e2e: Chrome не запустился (' + e.message.split('\n')[0] + ') — пропуск');
  if (serverProc) serverProc.kill();
  process.exit(0);
}

const consoleErrors = [];
const page = await browser.newPage();
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') consoleErrors.push('console: ' + m.text()); });
page.setViewport({ width: 1280, height: 900 });

const text = sel => page.$eval(sel, el => el.textContent || '').catch(() => '');
const exists = sel => page.$(sel).then(v => !!v);

try {
  /* ---------- 1. чистая загрузка без ошибок консоли ---------- */
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(300);
  T('загрузка: экран входа показан', await exists('#authScreen'));
  T('загрузка: нет ошибок в консоли', consoleErrors.length === 0, consoleErrors.join(' | '));
  T('загрузка: тема применена до отрисовки', ['dark', 'light'].includes(await page.$eval('html', el => el.getAttribute('data-theme'))));

  /* ---------- 2. демо-режим ---------- */
  consoleErrors.length = 0;
  await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'networkidle0', timeout: 30000 });
  await sleep(800);
  T('демо: баннер демо-режима', (await text('#bannerHost')).includes('Демо-режим'));
  T('демо: операции отрисованы', (await text('#view')).includes('Общий баланс'));
  T('демо: без ошибок в консоли', consoleErrors.length === 0, consoleErrors.join(' | '));

  /* ---------- 3. форма операции без валюты ---------- */
  await page.click('[data-act="op-new"]');
  await sleep(200);
  T('форма: открыта с подписью «Сумма, ₽»', (await text('#sheetHost')).includes('Сумма, ₽'));
  T('форма: полей валюты/курса нет', !(await exists('#opCurrency')) && !(await exists('#opRate')));
  await page.keyboard.press('Escape');
  await sleep(150);
  T('форма: Esc закрывает окно', !(await page.$eval('#sheetHost', el => !el.classList.contains('hidden'))));

  /* ---------- 4. быстрый ввод ---------- */
  await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'networkidle0' });
  await sleep(600);
  await page.type('#qadd', 'кофе 350');
  await page.keyboard.press('Enter');
  await sleep(300);
  T('быстрый ввод: тост подтверждения', (await text('#toasts')).includes('350'));

  /* ---------- 5. тема переключается и переживает перезагрузку ---------- */
  await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'networkidle0' });
  await sleep(400);
  await page.evaluate(() => { window.applyTheme('light', { silent: true }); });
  await page.reload({ waitUntil: 'networkidle0' });
  await sleep(400);
  T('тема: светлая после перезагрузки', (await page.$eval('html', el => el.getAttribute('data-theme'))) === 'light');
  await page.evaluate(() => { window.applyTheme('dark', { silent: true }); });

  /* ---------- 6. голос и фото: кнопки есть, без функции — честная подсказка ---------- */
  T('ввод: кнопка микрофона на месте', await exists('[data-act="qadd-voice"]') || await exists('#qaddVoice') || (await text('#view')).includes('🎤'));
  T('ввод: кнопка фото чека на месте', (await text('#view')).includes('📷'));

  /* ---------- 7. экспорт CSV и ZIP-архив ---------- */
  {
    const csvOrZipStarted = page.evaluate(() => {
      try { const z = window.buildBackupZip(); return z && z.length > 500 && z[0] === 0x50; } catch (e) { return false; }
    });
    T('архив: ZIP собирается в браузере', await csvOrZipStarted);
  }

  /* ---------- 8. диагностика ---------- */
  {
    await page.evaluate(() => { window.diagLog('e2e', 'проверка из Chrome'); });
    const ok = await page.evaluate(() => window.diagText().includes('проверка из Chrome'));
    T('диагностика: запись видна в журнале', ok);
  }

  /* ---------- 9. сервис-воркер ---------- */
  {
    const swOk = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        await sleep(300);
        return !!reg;
      } catch (_e) { return false; }
    });
    T('PWA: сервис-воркер регистрируется на localhost', swOk);
  }

  /* ---------- 10. мобильная вёрстка 360px ---------- */
  {
    await page.setViewport({ width: 360, height: 740 });
    await page.goto(BASE + '/index.html?demo=1', { waitUntil: 'networkidle0' });
    await sleep(500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    T('мобильный: нет горизонтальной прокрутки на 360px', overflow <= 1, 'переполнение ' + overflow + 'px');
    T('мобильный: без ошибок в консоли', consoleErrors.length === 0, consoleErrors.slice(-2).join(' | '));
  }

  /* ---------- 11. офлайн: приложение открывается из кэша ---------- */
  {
    await page.setOfflineMode(true);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
    await sleep(800);
    const body = await page.evaluate(() => document.body ? document.body.textContent.length : 0);
    T('офлайн: приложение отвечает из кэша', body > 1000, 'body=' + body);
    await page.setOfflineMode(false);
  }

} catch (e) {
  failures.push('критическая ошибка прогона: ' + e.message);
  console.error('  ✗ критическая ошибка прогона: ' + e.message);
}

await browser.close();
if (serverProc) serverProc.kill();

console.log('');
console.log('Сквозные проверки (Chrome): ' + passed + ' ✓, ' + failures.length + ' ✗');
if (failures.length) {
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
}
