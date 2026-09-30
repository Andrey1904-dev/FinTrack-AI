import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const version = read('VERSION').trim();
const html = read('index.html');
const demo = read('FinTrack-AI-demo.html');

assert.match(html, new RegExp(`FinTrack AI ${version.replaceAll('.', '\\.')} ·`), 'UI version matches VERSION');
assert.match(html, new RegExp(`const APP_VERSION = '${version.replaceAll('.', '\\.')}';`), 'archive version matches VERSION');
assert.match(demo, /window\.__FINTRACK_DEMO__ = true/, 'standalone demo enables demo mode before app boot');
assert.doesNotMatch(html, /\/\*(?:CSS|VENDOR|APP)\*\//, 'built HTML has no unresolved build markers');

const manifest = JSON.parse(read('manifest.webmanifest'));
for (const icon of manifest.icons) {
  assert.ok(fs.existsSync(path.join(root, icon.src)), `manifest icon exists: ${icon.src}`);
}

const sw = read('sw.js');
const assetsMatch = sw.match(/const ASSETS = \[([\s\S]*?)\];/);
assert.ok(assetsMatch, 'service worker has an asset list');
const assets = [...assetsMatch[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
for (const asset of assets) {
  assert.ok(fs.existsSync(path.join(root, asset)), `service worker asset exists: ${asset}`);
}
assert.doesNotMatch(sw, /c\.addAll\(ASSETS\)[\s\S]{0,120}\.catch\s*\(/, 'cache-install failures must not be swallowed');
assert.ok(sw.includes(`fintrack-v${version}`), 'service worker cache version matches VERSION');
assert.match(read('src/app.js'), /diagLog\('pwa'/, 'service-worker registration failures are recorded');

assert.match(read('netlify.toml'), /microphone=\(self\)/, 'Netlify allows same-origin microphone access');
assert.match(read('netlify.toml'), /camera=\(self\)/, 'Netlify allows same-origin camera access');
assert.match(read('netlify.toml'), /X-Frame-Options = "DENY"/, 'Netlify prevents clickjacking via framing');
assert.match(read('vercel.json'), /microphone=\(self\)/, 'Vercel allows same-origin microphone access');
assert.match(read('vercel.json'), /camera=\(self\)/, 'Vercel allows same-origin camera access');

const landing = read('landing/index.html');
assert.match(landing, /<main id="main">/, 'public landing page has a main landmark');
assert.match(landing, /href="\.\.\/index\.html\?demo=1"/, 'landing links to the demo');
for (const [, resource] of landing.matchAll(/(?:href|src)="(\.\.\/[^"?#]+)(?:[^\"]*)"/g)) {
  assert.ok(fs.existsSync(path.resolve(root, 'landing', resource)), `landing resource exists: ${resource}`);
}
const telegramMigration = read('supabase/migrations/202609290002_telegram_bot.sql');
assert.match(telegramMigration, /enable row level security/iu, 'Telegram tables use RLS');
assert.match(telegramMigration, /consume_telegram_link_code/iu, 'link codes are consumed atomically');
assert.match(telegramMigration, /finalize_telegram_operation/iu, 'writes are finalized through a server RPC');
assert.match(read('supabase/config.toml'), /verify_jwt = false/gu, 'Telegram functions use custom-secret authentication');
assert.doesNotMatch(read('src/cloud.js'), /SUPABASE_SERVICE_ROLE_KEY|TELEGRAM_BOT_TOKEN|CRON_SECRET/iu, 'server secrets are not in the browser bundle');

const modules = [
  'src/vendor/supabase.js', 'src/format.js', 'src/state.js', 'src/parse.js',
  'src/credits.js', 'src/csv.js', 'src/zip.js', 'src/charts.js', 'src/cloud.js',
  'src/ui.js', 'src/views.js', 'src/views2.js', 'src/views3.js', 'src/app.js',
  'supabase/functions/_shared/supabase.js', 'supabase/functions/_shared/telegram.js',
  'supabase/functions/_shared/parser.js', 'supabase/functions/_shared/render.js', 'supabase/functions/telegram-webhook/index.js',
  'supabase/functions/telegram-notifications/index.js', 'supabase/functions/telegram-info/index.js',
  'scripts/set-telegram-webhook.mjs'
];
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fintrack-check-'));
try {
  for (const file of modules) {
    const checked = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
    assert.equal(checked.status, 0, `${file} parses: ${checked.stderr}`);
  }
  const bundled = path.join(tempDir, 'bundle.js');
  const source = `const APP_VERSION = '${version}';\n` + modules.map(file => read(file)).join('\n;\n');
  fs.writeFileSync(bundled, source);
  const checked = spawnSync(process.execPath, ['--check', bundled], { encoding: 'utf8' });
  assert.equal(checked.status, 0, `combined app parses: ${checked.stderr}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log('Static checks passed: build markers, versions, PWA assets, browser permissions, JavaScript syntax.');
