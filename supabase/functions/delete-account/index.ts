/* ============================================================================
   delete-account — полное удаление аккаунта и всех данных
   Вызывается из «Настройки → Опасная зона». JWT обязателен: удаляем только
   себя. service_role нужен, потому что строки в telegram_accounts и сам
   пользователь auth.users обычным клиентом не удаляются.
   ========================================================================== */
import { preflight, json, fail } from '../_shared/cors.ts';
import { requireUser, adminClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') return fail('Только POST', 405);

  const { user } = await requireUser(req);
  if (!user) return fail('Требуется вход (JWT)', 401);

  const uid = user.id;
  const admin = adminClient();

  // операции и профиль
  await admin.from('finance_operations').delete().eq('user_id', uid);
  await admin.from('finance_profiles').delete().eq('user_id', uid);
  // привязка Telegram (обе таблицы)
  await admin.from('telegram_link_codes').delete().eq('user_id', uid);
  await admin.from('telegram_accounts').delete().eq('user_id', uid);
  // сам аккаунт
  const { error } = await admin.auth.admin.deleteUser(uid);
  if (error) return fail('Не удалось удалить аккаунт: ' + error.message, 500);

  return json({ ok: true });
});
