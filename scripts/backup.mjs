/* ============================================================================
   backup.mjs — ночная выгрузка базы FinTrack AI для GitHub Actions.
   Забирает все операции и профили через REST (service_role) и складывает в
   backup/ — артефакт воркфлоу хранится 90 дней.

   Включается двумя секретами (Settings → Secrets → Actions):
     SUPABASE_URL              — адрес проекта
     SUPABASE_SERVICE_ROLE_KEY — service_role (НИКОГДА не кладите его в клиент)

   Локально: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backup.mjs
   ========================================================================== */
import fs from 'fs';
import path from 'path';

const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (окружение или секреты Actions).');
  process.exit(1);
}

async function table(name) {
  const rows = [];
  let from = 0;
  const PAGE = 5000;
  while (true) {
    const res = await fetch(`${URL_}/rest/v1/${name}?select=*&limit=${PAGE}&offset=${from}`, {
      headers: {
        'apikey': KEY,
        'Authorization': 'Bearer ' + KEY,
        'Accept-Profile': 'public',
      },
    });
    if (!res.ok) throw new Error(name + ': HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
    const part = await res.json();
    rows.push(...part);
    if (part.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const outDir = path.join(process.cwd(), 'backup');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const ops = await table('finance_operations');
const profiles = await table('finance_profiles');
const tg = await table('telegram_accounts');

const meta = {
  app: 'FinTrack AI',
  exportedAt: new Date().toISOString(),
  operations: ops.length,
  profiles: profiles.length,
  telegram_accounts: tg.length,
};
fs.writeFileSync(path.join(outDir, `operations-${stamp}.json`), JSON.stringify(ops));
fs.writeFileSync(path.join(outDir, `profiles-${stamp}.json`), JSON.stringify(profiles));
fs.writeFileSync(path.join(outDir, `meta-${stamp}.json`), JSON.stringify(meta, null, 2));
// стабильные имена — для диффа между ночами
fs.writeFileSync(path.join(outDir, 'operations-latest.json'), JSON.stringify(ops));
fs.writeFileSync(path.join(outDir, 'profiles-latest.json'), JSON.stringify(profiles));

console.log('Выгрузка готова:', JSON.stringify(meta));
